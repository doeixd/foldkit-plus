import { Effect, Option, Schema } from 'effect'
import { expect, it } from 'vitest'
import * as Artifact from '../src/artifact.js'
import * as Node from '../src/node.js'
import * as Operation from '../src/operation.js'
import { wrap } from '../src/ops/core.js'
import { addOp } from '../src/ops/num.js'

const wire = (
  node: Artifact.PortableNode,
  requiredOps: Artifact.PortableArtifactV1['requiredOps'] = [],
): Artifact.PortableArtifactV1 => ({ codecVersion: 1, node, requiredOps })

const options = { env: {}, result: Schema.Unknown }
const list = Array.from({ length: 40_000 }, (_, index) => index)
const nest = (levels: number): Artifact.PortableLiteral =>
  Array.from({ length: levels }).reduce<Artifact.PortableLiteral>(value => [value], 0)

const failure = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(Effect.match(effect, { onFailure: error => error, onSuccess: () => undefined }))

it('counts values in a 40,000-element literal list against the default node limit on encode', async () => {
  const expr = wrap(Node.Lit({ value: list }))
  expect(await failure(Artifact.encodeExpr(expr))).toMatchObject({
    _tag: 'ArtifactLimitError',
    kind: 'nodes',
    limit: 2048,
    actual: 2049,
  })
})

it('round-trips a 40,000-element literal list at its exact node budget', async () => {
  const expr = wrap(Node.Lit({ value: list }))
  const limits = { maxNodes: 40_002 }
  const encoded = await Effect.runPromise(Artifact.encodeExpr(expr, { limits }))
  const decoded = await Effect.runPromise(Artifact.decodeExpr(encoded, { ...options, limits }))
  expect(decoded.node).toEqual(expr.node)
})

it('refuses a wire literal nested 100 levels deep at the first depth over the limit', async () => {
  expect(
    await failure(Artifact.decodeExpr(wire({ _tag: 'Lit', value: nest(100) }), options)),
  ).toMatchObject({ _tag: 'ArtifactLimitError', kind: 'depth', limit: 64, actual: 65 })
})

it.each([
  {
    kind: 'nodes',
    limits: { maxNodes: 4 },
    limit: 4,
    at: { a: false, b: null },
    over: { a: [false], b: null },
  },
  { kind: 'depth', limits: { maxDepth: 2 }, limit: 2, at: nest(2), over: nest(3) },
  { kind: 'string', limits: { maxStringLength: 2 }, limit: 2, at: '😀', over: '😀a' },
])('agrees at and just past the literal $kind limit', async ({ kind, limits, limit, at, over }) => {
  const atWire = wire({ _tag: 'Lit', value: at })
  const atNode = Node.Lit({ value: at })
  expect(await Effect.runPromise(Artifact.encodeExpr(wrap(atNode), { limits }))).toEqual(atWire)
  expect(
    await Effect.runPromise(Artifact.decodeExpr(atWire, { ...options, limits })),
  ).toMatchObject({ node: atNode })

  const expected = { _tag: 'ArtifactLimitError', kind, limit, actual: limit + 1 }
  expect(
    await failure(Artifact.encodeExpr(wrap(Node.Lit({ value: over })), { limits })),
  ).toMatchObject(expected)
  expect(
    await failure(Artifact.decodeExpr(wire({ _tag: 'Lit', value: over }), { ...options, limits })),
  ).toMatchObject(expected)
})

it('bounds path segments independently of expression depth and node count', async () => {
  const segments = Array.from({ length: 100 }, () => 'a')
  const root = segments.reduceRight<Schema.Top>(schema => Schema.Struct({ a: schema }), Schema.Int)
  const raw = wire({ _tag: 'Path', segments })
  const expr = wrap(Node.Path({ segments, ast: Option.none() }))
  const limits = { maxNodes: 1, maxDepth: 100 }
  const decodeOptions = { schema: root, result: Schema.Int, limits }
  expect(await Effect.runPromise(Artifact.encodeExpr(expr, { limits }))).toEqual(raw)
  expect(
    (await Effect.runPromise(Artifact.decodeForSchema(raw, decodeOptions))).node,
  ).toMatchObject({ segments })

  const tighter = { ...limits, maxDepth: 99 }
  const expected = { _tag: 'ArtifactLimitError', kind: 'depth', limit: 99, actual: 100 }
  expect(await failure(Artifact.encodeExpr(expr, { limits: tighter }))).toMatchObject(expected)
  expect(
    await failure(Artifact.decodeForSchema(raw, { ...decodeOptions, limits: tighter })),
  ).toMatchObject(expected)
})

const long = 'x'.repeat(70_000)
const zero = Node.Lit({ value: 0 })
const wireZero: Artifact.PortableNode = { _tag: 'Lit', value: 0 }
const stringFixtures: ReadonlyArray<{
  name: string
  node: Node.Node
  portable: Artifact.PortableNode
}> = [
  {
    name: 'literal string',
    node: Node.Lit({ value: long }),
    portable: { _tag: 'Lit', value: long },
  },
  {
    name: 'path segment',
    node: Node.Path({ segments: [long], ast: Option.none() }),
    portable: { _tag: 'Path', segments: [long] },
  },
  {
    name: 'Match label',
    node: Node.Match({ on: zero, cases: [[long, zero]], otherwise: Option.none() }),
    portable: { _tag: 'Match', on: wireZero, cases: [[long, wireZero]] },
  },
  {
    name: 'relation name',
    node: Node.Rows({
      fold: 'count',
      over: Node.RowsOver.Related({ of: zero, relation: long }),
      where: Option.none(),
      value: Option.none(),
      set: [],
    }),
    portable: {
      _tag: 'Rows',
      fold: 'count',
      over: { _tag: 'Related', of: wireZero, relation: long },
      set: [],
    },
  },
]

it.each(stringFixtures)(
  'bounds a 70,000-code-unit $name in both directions',
  async ({ node, portable }) => {
    const expected = { _tag: 'ArtifactLimitError', kind: 'string', limit: 65_536, actual: 70_000 }
    const decodeOptions = { ...options, env: { [long]: Schema.Int } }
    expect.soft(await failure(Artifact.encodeExpr(wrap(node)))).toMatchObject(expected)
    expect(await failure(Artifact.decodeExpr(wire(portable), decodeOptions))).toMatchObject(
      expected,
    )
  },
)

const Increment = Operation.define({
  id: 'example.increment',
  version: 1,
  args: [Schema.Int],
  returns: Schema.Int,
  nulls: 'strict',
})

const calls: ReadonlyArray<{
  op: Node.AnyOp
  ref: Artifact.PortableOpRef
  kind: string
  name: string
  arity: number
}> = [
  { op: addOp, ref: { _tag: 'Core', id: addOp.id }, kind: 'core', name: addOp.id, arity: 2 },
  {
    op: Increment.descriptor,
    ref: { _tag: 'Foreign', id: Increment.descriptor.id, version: Increment.descriptor.version },
    kind: 'foreign',
    name: 'example.increment@1',
    arity: 1,
  },
]

it.each(calls)(
  'refuses a wrong-arity $kind call with the same error on encode and decode',
  async ({ op, ref, kind, name, arity }) => {
    const expected = {
      _tag: 'ArtifactDecodeError',
      phase: 'arity',
      path: name,
      detail: `${kind} operator "${name}" expects ${arity} argument(s), got 0`,
    }
    const registry = await Effect.runPromise(Artifact.registry(Increment))
    const raw = wire({ _tag: 'Call', op: ref, args: [] }, [ref])
    expect(await failure(Artifact.decodeExpr(raw, { ...options, registry }))).toMatchObject(
      expected,
    )
    expect(await failure(Artifact.encodeExpr(wrap(Node.Call({ op, args: [] }))))).toMatchObject(
      expected,
    )
  },
)

/**
 * One meaning for a partly known environment: the lean judge (`judgeNode`,
 * `settleNode`, which judge without building the expression left over)
 * answers exactly as the expression partial evaluation leaves
 * (`residualizeNode`) says, verdict, value, reads and reason alike, over
 * random expressions on random partly held environments, and over the cases
 * where only the residual's shape decides (a read reached by a law, a
 * refusal ruled out once a law drops an operand).
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { coreOps } from '../src/conformance.js'
import * as Text from '../src/domain/text.js'
import * as Node from '../src/node.js'
import { judgeNode, Settled, settleNode } from '../src/ops/judge.js'
import type { ForeignImplementations } from '../src/ops/eval.js'
import { residualSettled, residualVerdict } from '../src/residualJudge.js'

/** A small seeded generator (mulberry32), so a failing case is found again. */
const random = (seed: number) => {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pick = <A>(items: ReadonlyArray<A>): A => items[Math.floor(next() * items.length)]!
  return { next, pick, chance: (p: number) => next() < p }
}
type Random = ReturnType<typeof random>

const Item = Schema.Struct({ x: Schema.Int, s: Text.schema, b: Schema.Boolean })
const Row = Schema.Struct({
  x: Schema.Int,
  f: Schema.Number,
  s: Text.schema,
  t: Schema.String,
  b: Schema.Boolean,
  n: Schema.NullOr(Schema.Int),
  list: Schema.Array(Item),
})

const fields: ReadonlyArray<readonly [string, Schema.Top]> = Object.entries(Row.fields)
const itemFields: ReadonlyArray<readonly [string, Schema.Top]> = Object.entries(Item.fields)

const literals: ReadonlyArray<unknown> = [
  0,
  1,
  -1,
  2,
  0.5,
  Number.MAX_SAFE_INTEGER,
  NaN,
  Infinity,
  true,
  false,
  null,
  '',
  'a',
  'A',
  ' a ',
  'a\u0000',
  [],
  [1],
  [null],
  ['a'],
  [1, null],
  [0, 2],
]

const values: Record<string, ReadonlyArray<unknown>> = {
  x: [0, 1, -1, 3, Number.MAX_SAFE_INTEGER, null],
  f: [0, 1.5, NaN, Infinity, null],
  s: ['', 'a', 'A', 'ab', null],
  t: ['', 'a', 'a\u0000', 'B', null],
  b: [true, false, null],
  n: [null, 0, 2],
}

const item = (r: Random) =>
  Object.fromEntries(
    itemFields.flatMap(([key]) => (r.chance(0.85) ? [[key, r.pick(values[key] ?? [null])]] : [])),
  )

/** A row some of whose fields are held, with its related rows held whole, in part, or not at all. */
const partialEnv = (r: Random): unknown => {
  const row: Record<string, unknown> = {}
  for (const [key] of fields) {
    if (!r.chance(0.6)) continue
    row[key] =
      key === 'list'
        ? r.chance(0.2)
          ? null
          : Array.from({ length: Math.floor(r.next() * 4) }, () => item(r))
        : r.pick(values[key]!)
  }
  if (r.chance(0.6)) {
    row[Node.relatedSegment('rel')] = r.chance(0.1)
      ? 'not a slot'
      : {
          rows: Array.from({ length: Math.floor(r.next() * 3) }, () => item(r)),
          whole: r.chance(0.5),
        }
  }
  const env: Record<string, unknown> = { row }
  if (r.chance(0.5)) env['input'] = { v: r.pick(literals), w: r.pick(literals) }
  return env
}

const foreignNum = Node.foreign({ id: 'test.plus', version: 1, returns: 'number', nulls: 'strict' })
const foreignFlag = Node.foreign({ id: 'test.flag', version: 1, returns: 'boolean', nulls: 'own' })
const foreignMissing = Node.foreign({
  id: 'test.none',
  version: 1,
  returns: 'text',
  nulls: 'strict',
})
const implementations: ForeignImplementations = {
  'test.plus@1': {
    run: ([a, b]) => (typeof a === 'number' && typeof b === 'number' ? a + b : 'not a number'),
  },
  'test.flag@1': {
    run: ([a]) => {
      if (a === 'a\u0000') throw new Error('boom')
      return a === null ? null : a === true
    },
  },
}

const unary: ReadonlySet<Node.CoreOpId> = new Set([
  'bool.not',
  'null.isNull',
  'str.lowerAscii',
  'str.trim',
  'num.neg',
  'str.len',
  'arr.count',
  'arr.isEmpty',
])
const ops = Object.values(coreOps)
const opaqueRun = (env: unknown): unknown => (typeof env === 'object' && env !== null ? 1 : 0)

const read = (r: Random, scope: 'row' | 'each'): Node.Node => {
  if (scope === 'row' && r.chance(0.12)) {
    return Node.Path({ segments: ['input', r.pick(['v', 'w'])], ast: Option.none() })
  }
  const [key, schema] = r.pick(scope === 'row' ? fields : itemFields)
  return Node.Path({
    segments: [scope, key],
    ast: r.chance(0.9) ? Option.some(schema.ast) : Option.none(),
  })
}

/** A random expression, `depth` deep at most, reading the row (or a body's element). */
const expression = (r: Random, depth: number, scope: 'row' | 'each' = 'row'): Node.Node => {
  const leaf = depth <= 0 || r.chance(0.25)
  if (leaf) {
    return r.chance(0.55) ? read(r, scope) : Node.Lit({ value: r.pick(literals) })
  }
  const sub = (): Node.Node => expression(r, depth - 1, scope)
  const choice = r.next()
  if (choice < 0.6) {
    const op = r.pick(ops)
    // A term twice, so laws that ask for one term (`x = x`, `x and x`) are met.
    const left = sub()
    const right = r.chance(0.2) ? left : sub()
    // A decimal product moves its operands by a literal number of places.
    const operands =
      op.id === 'num.mulScaled' ? [left, right, Node.Lit({ value: 2 })] : [left, right]
    return Node.Call({ op, args: unary.has(op.id) ? [left] : operands })
  }
  if (choice < 0.68) {
    const op = r.pick([foreignNum, foreignFlag, foreignMissing])
    return Node.Call({ op, args: op === foreignNum ? [sub(), sub()] : [sub()] })
  }
  if (choice < 0.78) return Node.If({ cond: sub(), then: sub(), otherwise: sub() })
  if (choice < 0.85) {
    return Node.Match({
      on: sub(),
      cases: [
        ['a', sub()],
        ['A', sub()],
      ],
      otherwise: r.chance(0.5) ? Option.some(sub()) : Option.none(),
    })
  }
  if (choice < 0.9 && scope === 'row') {
    return Node.Opaque({
      name: 'probe',
      reads: r.chance(0.7) ? Option.some([['row', r.pick(fields)[0]]]) : Option.none(),
      run: opaqueRun,
    })
  }
  if (scope === 'row') {
    const body = (): Node.Node => expression(r, depth - 1, 'each')
    return Node.Rows({
      fold: r.pick([
        'any',
        'every',
        'count',
        'sum',
        'min',
        'max',
        'find',
        'keep',
        'patch',
      ] as const),
      over: r.chance(0.5)
        ? Node.RowsOver.List({
            list: r.chance(0.8)
              ? Node.Path({ segments: ['row', 'list'], ast: Option.some(Row.fields.list.ast) })
              : Node.Lit({ value: [item(r), item(r)] }),
          })
        : Node.RowsOver.Related({
            of: Node.Path({ segments: ['row'], ast: Option.some(Row.ast) }),
            relation: 'rel',
          }),
      where: r.chance(0.8) ? Option.some(body()) : Option.none(),
      value: r.chance(0.5) ? Option.some(body()) : Option.none(),
      set: r.chance(0.3) ? [['x', body()]] : [],
    })
  }
  return sub()
}

const agree = (node: Node.Node, env: unknown): void => {
  expect(settleNode(node, env, implementations)).toEqual(
    residualSettled(node, env, implementations),
  )
  expect(judgeNode(node, env, implementations)).toEqual(residualVerdict(node, env, implementations))
}

describe('the lean judge answers as partial evaluation leaves it', () => {
  it.each([1, 2, 3, 4])('over random expressions and environments (seed %i)', seed => {
    const r = random(seed)
    for (let index = 0; index < 4000; index++) {
      const node = expression(r, 1 + Math.floor(r.next() * 4))
      const env = partialEnv(r)
      try {
        agree(node, env)
      } catch (error) {
        throw new Error(`seed ${seed}, case ${index}: ${String(error)}`)
      }
    }
  })

  const Env = Schema.Struct({ x: Schema.Int, b: Schema.Boolean, s: Text.schema, t: Schema.String })
  const at = (key: keyof typeof Env.fields): Node.Node =>
    Node.Path({ segments: [key], ast: Option.some(Env.fields[key].ast) })
  const call = (id: Node.CoreOpId, ...args: ReadonlyArray<Node.Node>): Node.Node =>
    Node.Call({ op: coreOps[id], args })
  const lit = (value: unknown): Node.Node => Node.Lit({ value })

  // Each is decided by what a law leaves, not by the operands as written.
  it.each([
    [
      'a read reached by an identity, compared with itself',
      call('eq.is', call('num.add', at('x'), lit(0)), at('x')),
      {},
      true,
    ],
    [
      'a read reached by an involution after an idempotent and',
      call(
        'eq.is',
        call('bool.not', call('bool.and', call('bool.not', at('b')), call('bool.not', at('b')))),
        at('b'),
      ),
      {},
      true,
    ],
    [
      'a refusal ruled out once an identity drops the operand that could be one',
      call('bool.and', lit(false), call('ord.gt', call('num.add', at('x'), lit(0)), lit(1))),
      {},
      false,
    ],
    [
      'a strict call beside a known null whose other operand an identity made unrefused',
      call('ord.gt', call('num.add', at('x'), at('t')), lit(null)),
      {},
      'open',
    ],
    [
      'one candidate leaves a call, not its needle',
      call('eq.is', call('eq.in', at('b'), lit([true])), at('b')),
      {},
      'open',
    ],
    [
      'no candidate, a read of text that may hold a NUL',
      call('eq.in', at('t'), lit([])),
      {},
      'open',
    ],
    ['no candidate, a read of Text', call('eq.in', at('s'), lit([])), {}, false],
    [
      "no candidate for SQL's in, an unrefused call",
      call('eq.among', call('str.lowerAscii', at('s')), lit([])),
      {},
      false,
    ],
    [
      'a known identity from the environment',
      call(
        'bool.and',
        lit(false),
        call(
          'ord.gt',
          call(
            'num.add',
            at('x'),
            Node.Path({ segments: ['d'], ast: Option.some(Schema.Int.ast) }),
          ),
          lit(5),
        ),
      ),
      { d: 0 },
      false,
    ],
  ] as const)('%s', (_, node, env, expected) => {
    agree(node, env)
    expect(
      Settled.$match(settleNode(node, env), { Known: ({ value }) => value, Open: () => 'open' }),
    ).toBe(expected)
  })
})

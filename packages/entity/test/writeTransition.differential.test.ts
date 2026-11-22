// @vitest-environment node
/**
 * Every write declared in entity's tests and in the examples that declare
 * writes (`examples/writes`, `writes-domain`, `chirp`, `entity`, `reference`,
 * `cloudflare`; `examples/cms` declares none: its mutations are handlers), run
 * over seeded random rows twice: through `Write.apply` as it was before step 6
 * (`writeBefore.ts`, after the guard a writer judged first), and through
 * `transitionOf(write)`. Each must land or refuse alike and leave the same
 * row. The one difference is intended and counted: a sum past the safe integer
 * range was written before and is refused now.
 *
 * `Write.update`, `insert` and `delete` are wrapped for this file only, to
 * record each write the imported files declare. The examples are imported by
 * a path built at run time, since entity's project does not include them.
 */
import { Effect, Option, Result, Schema, SchemaAST } from 'effect'
import { Node, Transition } from 'metakit'
import { describe, expect, it, vi } from 'vitest'
import { matchContext, type ViewerPathExpr } from '../src/context.js'
import { dependenciesOf } from '../src/index.js'
import type { AnyWrite } from '../src/write.js'

const declared = vi.hoisted(() => [] as Array<AnyWrite>)

vi.mock('../src/write.js', async original => {
  const real = await original<typeof import('../src/write.js')>()
  const { Write } = real
  return {
    ...real,
    Write: {
      ...Write,
      update: (...args: Parameters<typeof Write.update>) => {
        const write = Write.update(...args)
        declared.push(write)
        return write
      },
      insert: (...args: Parameters<typeof Write.insert>) => {
        const write = Write.insert(...args)
        declared.push(write)
        return write
      },
      delete: (...args: Parameters<typeof Write.delete>) => {
        const write = Write.delete(...args)
        declared.push(write)
        return write
      },
    },
  }
})

await import('./write.test.js')
await import('./writeContext.test.js')
await import('./compute.test.js')
await import('./decrement.test.js')
await import('./arithmetic.test.js')
await import('./context.test.js')
await import('./precondition.test.js')
await import('./protoKey.test.js')
await import('./refine.test.js')
await import('./sets.test.js')
await import('./versions.test.js')
await import('./viewerPath.test.js')
await import('./accountFixture.js')
await import('./blogFixture.js')
const EXAMPLES = [
  'writes/src/domain',
  'writes-domain/src/domain',
  'chirp/src/operations',
  'entity/src/operations',
  'reference/src/operations',
  'cloudflare/src/operations',
]
for (const example of EXAMPLES) {
  const file = ['..', '..', '..', 'examples', `${example}.ts`].join('/')
  await import(/* @vite-ignore */ file)
}

const { Held, Operators, Write, evaluate, QueryEvaluateError } = await import('../src/index.js')
const { foreignOf, readingOf } = await import('../src/reading.js')
const { suppliedOf, transitionOf } = await import('../src/writeTransition.js')
const { applyBefore } = await import('./writeBefore.js')

type Row = Readonly<Record<string, unknown>>
type State = { readonly present: boolean; readonly row: Row }

/** mulberry32: a seed's stream, the same on every machine. */
const rngOf = (seed: number): (() => number) => {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

const TEXT = [
  '',
  'a',
  'B',
  'draft',
  'published',
  'Hello',
  'x y',
  'A1',
  'u1',
  'o1',
  // What a Date field stores.
  '2024-03-01T00:00:00.000Z',
]
const NUMBERS = [0, 1, 2, 3, 5, 10, -1, -4, 100, 1000, 0.5, 2.5, 1e9, Number.MAX_SAFE_INTEGER]

class Unsupported extends Error {}

interface Pools {
  readonly text: ReadonlyArray<string>
  readonly numbers: ReadonlyArray<number>
}

/** A value of a stored form, from pools that hold what the write's own expressions name. */
const sampleOf = (ast: SchemaAST.AST, rng: () => number, pools: Pools): unknown => {
  const pick = <A>(from: ReadonlyArray<A>): A => from[Math.floor(rng() * from.length)]!
  if (SchemaAST.isString(ast) || SchemaAST.isTemplateLiteral(ast)) return pick(pools.text)
  if (SchemaAST.isNumber(ast)) return pick(pools.numbers)
  if (SchemaAST.isBoolean(ast)) return rng() < 0.5
  if (SchemaAST.isNull(ast)) return null
  if (SchemaAST.isUndefined(ast)) return undefined
  if (SchemaAST.isLiteral(ast)) return ast.literal
  if (SchemaAST.isUnion(ast)) return sampleOf(pick(ast.types), rng, pools)
  throw new Unsupported(ast._tag)
}

/** What a write reads: its precondition's predicates and its assignments' expressions. */
const loweredOf = (write: AnyWrite) =>
  readingOf([
    ...Option.match(write.when, { onNone: () => [], onSome: query => query.where }),
    ...write.assignments.map(assignment => assignment.expr),
  ])

/** Every literal a write's expressions name, so a sampled row can meet them. */
const poolsOf = (write: AnyWrite): Pools => {
  const text = new Set(TEXT)
  const numbers = new Set(NUMBERS)
  const visit = (node: Node.Node): void =>
    Node.$match(node, {
      Lit: ({ value }) => {
        if (typeof value === 'string') text.add(value)
        else if (typeof value === 'number') numbers.add(value)
      },
      Path: () => undefined,
      Call: ({ args }) => args.forEach(visit),
      If: ({ cond, then, otherwise }) => [cond, then, otherwise].forEach(visit),
      Match: ({ on, cases, otherwise }) =>
        [on, ...cases.map(([, then]) => then), ...Option.toArray(otherwise)].forEach(visit),
      Opaque: () => undefined,
      Rows: () => undefined,
    })
  loweredOf(write).nodes.forEach(visit)
  return { text: [...text], numbers: [...numbers] }
}

/** A table that runs each foreign operator a write calls by a fixed function of its arguments. */
const operatorsFor = (write: AnyWrite) =>
  Operators.memory(
    ...[...loweredOf(write).foreign.values()].map(operator => ({
      operator,
      run: (args: ReadonlyArray<unknown>) => {
        const out = SchemaAST.toEncoded(operator.output.ast)
        if (SchemaAST.isNumber(out))
          return args.reduce<number>((sum, each) => sum + Number(each ?? 0), 1)
        if (SchemaAST.isBoolean(out)) return args[0] === args[1]
        return args.map(String).join('|')
      },
    })),
  )

const MAX = Number.MAX_SAFE_INTEGER
const outcomes = {
  landed: 0,
  refused: 0,
  skipped: 0,
  unknownFields: 0,
  /** Intended: a sum past the safe integer range is refused by the transition, and was written before. */
  pastSafeRange: 0,
  unsupported: [] as Array<string>,
  neverLanded: [] as Array<string>,
}

/** Whether a row after holds a number past the safe range in a field the write moves. */
const pastRange = (write: AnyWrite, row: Row): boolean =>
  write.increments.some(({ field }) => {
    const held = row[field.key]
    return typeof held === 'number' && Math.abs(held) > MAX
  })

/** The transition run by `Transition.step`, with the implementations of the foreign operators it calls: where it lands, the state after. */
const stepOf = (
  transition: ReturnType<typeof transitionOf>,
  state: State,
  input: Row,
  supplied: Row,
  foreign: ReturnType<typeof foreignOf>,
): Option.Option<State> =>
  Result.match(Transition.step(transition, state, input, supplied, { foreign }), {
    onFailure: () => Option.none(),
    onSuccess: ({ state: next }) => Option.some(next),
  })

const linkIds = (links: Readonly<Record<string, Option.Option<{ readonly id: string }>>>) =>
  Object.fromEntries(
    Object.entries(links).map(([key, link]) => [
      key,
      Option.getOrNull(Option.map(link, ref => ref.id)),
    ]),
  )

const compareWrite = (write: AnyWrite, seed: number): void => {
  const rng = rngOf(seed)
  const pools = poolsOf(write)
  const { entity } = write.input
  const inputFields = write.input.schema.fields
  const operators = operatorsFor(write)
  const transition = transitionOf(write)
  const lowered = loweredOf(write)
  const foreign = foreignOf(lowered, operators)

  const encodedInput: Record<string, unknown> = {}
  for (const [key, schema] of Object.entries<Schema.Top>(inputFields)) {
    const accepts = Schema.is(Schema.make(SchemaAST.toEncoded(schema.ast)))
    let value: unknown
    for (let attempt = 0; attempt < 20; attempt++) {
      value = sampleOf(SchemaAST.toEncoded(schema.ast), rng, pools)
      if (accepts(value)) break
    }
    if (value !== undefined) encodedInput[key] = value
  }
  const typed = Schema.decodeUnknownResult(
    Schema.make<Schema.Codec<Record<string, unknown>>>(write.input.schema.ast),
  )(encodedInput)
  if (Result.isFailure(typed)) {
    outcomes.skipped++
    return
  }
  const bound = Write.bind(write, typed.success)

  // A row: random, with the values of the input keys that name its fields often copied.
  const named = new Map<string, string>(
    [...write.sets, ...(write.expect === undefined ? [] : [write.expect])].map(({ key, field }) => [
      field.key,
      key,
    ]),
  )
  const row: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(entity.fields)) {
    const copied = named.get(key)
    row[key] =
      copied !== undefined && Object.hasOwn(encodedInput, copied) && rng() < 0.6
        ? encodedInput[copied]
        : sampleOf(SchemaAST.toEncoded(field.schema.ast), rng, pools)
  }

  // What the write's context gives, read once.
  const pathOf = (value: ViewerPathExpr<unknown>) => {
    const [reach] = dependenciesOf(value).reaches
    if (reach?._tag !== 'ViewerPath') throw new Error('a path from the viewer reads one')
    return reach
  }
  const viewing = write.context.flatMap(({ value }) =>
    matchContext(value, {
      viewer: each => [each.entity.name],
      viewerPath: each => [pathOf(each).viewer.name],
      now: () => [],
    }),
  )
  const by = {
    viewer: Option.some({ entity: viewing[0] ?? entity.name, id: 'u1' }),
    now: Option.some(1_700_000_000_000),
  }
  // What a row of the viewer's path holds is fixed for the seed, as it is where the rows are held.
  const held = new Map<string, unknown>()
  const read = (ref: { readonly entity: string; readonly id: string }, key: string) => {
    if (!held.has(key)) {
      held.set(
        key,
        write.context.flatMap(({ value }) => {
          if (value.term !== 'viewerPath') return []
          const reach = pathOf(value)
          const hop = reach.via.find(relation => relation.key === key)
          if (hop !== undefined) return [`${hop.target().name}:t1`]
          return reach.field.key === key
            ? [sampleOf(SchemaAST.toEncoded(reach.field.schema.ast), rng, pools)]
            : []
        })[0] ?? `${ref.entity}:t1`,
      )
    }
    return Effect.succeed(Held.of(held.get(key)))
  }
  const context = Effect.runSync(Write.contextValues(write, by, read))
  if (context.unfilled.length > 0) {
    outcomes.skipped++
    return
  }
  const { supplied } = Effect.runSync(suppliedOf(write, by, read))

  // Before: the writer's guard, then `Write.apply` as it was.
  const expected = Write.expected(write, typed.success)
  const before = ((): Option.Option<{
    readonly row: Row
    readonly unknown: ReadonlyArray<string>
  }> => {
    try {
      if (
        Option.isSome(write.when) &&
        evaluate(write.when.value, encodedInput, [row], { operators }).length !== 1
      ) {
        return Option.none()
      }
      if (
        Option.isSome(expected) &&
        JSON.stringify(row[expected.value.field]) !== JSON.stringify(expected.value.revision)
      ) {
        return Option.none()
      }
      const applied = applyBefore(
        row,
        {
          values: {
            ...bound.values,
            ...context.values,
            ...linkIds(bound.links),
            ...linkIds(context.links),
          },
          increments: bound.increments,
          assignments: bound.assignments,
        },
        { operators },
      )
      const after: Record<string, unknown> = { ...applied.row }
      // A writer moves the revision it expects on by one: an update does, a delete leaves no row.
      if (Option.isSome(expected) && write._tag === 'Update') {
        const held = row[expected.value.field]
        after[expected.value.field] = typeof held === 'number' ? held + 1 : null
      }
      return Option.some({ row: after, unknown: applied.unknown })
    } catch (error) {
      if (error instanceof QueryEvaluateError) return Option.none()
      throw error
    }
  })()

  // After: the transition, over the row's place in its table.
  const state = { present: write._tag !== 'Insert', row }
  const run = stepOf(transition, state, encodedInput, supplied, foreign)

  const label = `${write._tag} ${entity.name} seed ${seed} input ${JSON.stringify(encodedInput)} row ${JSON.stringify(row)}`
  if (Option.isNone(before) && Option.isNone(run)) {
    outcomes.refused++
    return
  }
  if (Option.isNone(run)) {
    // Intended: a sum past the safe range was written before and is refused now.
    expect(Option.isSome(before) && pastRange(write, before.value.row), `refused: ${label}`).toBe(
      true,
    )
    outcomes.pastSafeRange++
    return
  }
  if (Option.isNone(before)) throw new Error(`landed only through the transition: ${label}`)
  expect(run.value.present, label).toBe(write._tag !== 'Delete')
  outcomes.unknownFields += before.value.unknown.length
  for (const key of new Set([...Object.keys(before.value.row), ...Object.keys(run.value.row)])) {
    // A field the old computation could not work out is not compared.
    if (before.value.unknown.includes(key)) continue
    expect(run.value.row[key], `${key}: ${label}`).toEqual(before.value.row[key])
  }
  outcomes.landed++
}

describe('a declared write, run before and as a transition', () => {
  it('lands and refuses alike over seeded rows, and leaves the same row', () => {
    const writes = [...new Set(declared)]
    expect(writes.length).toBeGreaterThan(80)
    for (const write of writes) {
      const landed = outcomes.landed
      for (let seed = 1; seed <= 60; seed++) {
        try {
          compareWrite(write, seed)
        } catch (error) {
          if (!(error instanceof Unsupported)) throw error
          outcomes.unsupported.push(`${write._tag} ${write.input.entity.name}: ${error.message}`)
          break
        }
      }
      if (outcomes.landed === landed) {
        outcomes.neverLanded.push(
          `${write._tag} ${write.input.entity.name} ${write.sets.map(set => set.key)}`,
        )
      }
    }
    // Each write landed at least once, so its row was compared, and no write was left out.
    expect(outcomes.neverLanded).toEqual([])
    expect(outcomes.unsupported).toEqual([])
    expect(outcomes.landed).toBeGreaterThan(3000)
    expect(outcomes.pastSafeRange).toBeGreaterThan(0)
  })
})

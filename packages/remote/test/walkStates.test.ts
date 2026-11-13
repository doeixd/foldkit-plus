import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Remote } from '../src/index.js'
import { Walk } from '../src/testing.js'

const Row = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(['a', 'b']),
  quantity: Schema.Number.check(Schema.isGreaterThan(0)),
  active: Schema.Boolean,
  note: Schema.NullOr(Schema.String),
  tags: Schema.Array(Schema.String),
  pair: Schema.Tuple([Schema.Number, Schema.String]),
  extra: Schema.optionalKey(Schema.String),
  byName: Schema.Record(Schema.String, Schema.Number),
})

const draw = (seed: number, count = 40) =>
  Walk.states(Row, { count, seed }).map(({ start }) => start())

describe('Walk.states', () => {
  it('gives values the Schema decodes', () => {
    const values = draw(7)
    expect(values).toHaveLength(40)
    for (const value of values) expect(Schema.is(Row)(value)).toBe(true)
  })

  it('refuses nothing it builds: a value the checks refuse is drawn again', () => {
    // Four of the five numbers in the pool are not above zero.
    for (const value of draw(3, 100)) expect(value.quantity).toBeGreaterThan(0)
  })

  it('is deterministic per seed, and differs between seeds', () => {
    expect(draw(7)).toEqual(draw(7))
    expect(draw(8)).not.toEqual(draw(7))
  })

  it('names each start by its seed and place', () => {
    expect(Walk.states(Row, { count: 2, seed: 5 }).map(({ name }) => name)).toEqual([
      'states(seed 5) #1',
      'states(seed 5) #2',
    ])
  })

  it('covers each kind: both literals, both booleans, a null, arrays of 0, 1 and 2, an omitted key', () => {
    const values = draw(1, 200)
    expect(new Set(values.map(value => value.kind))).toEqual(new Set(['a', 'b']))
    expect(new Set(values.map(value => value.active))).toEqual(new Set([true, false]))
    expect(values.some(value => value.note === null)).toBe(true)
    expect(new Set(values.map(value => value.tags.length))).toEqual(new Set([0, 1, 2]))
    expect(values.some(value => !('extra' in value))).toBe(true)
    expect(values.some(value => 'extra' in value)).toBe(true)
    expect(
      values.some(value => value.tags.some(tag => /\p{Extended_Pictographic}/u.test(tag))),
    ).toBe(true)
  })

  it('draws Remote’s own Model Schema', () => {
    const [first] = Walk.states(Remote.Model, { count: 1, seed: 2 })
    expect(Schema.is(Remote.Model)(first!.start())).toBe(true)
  })

  it('throws by kind and path for a Schema kind it has no generator for', () => {
    const Lacking = Schema.Struct({ id: Schema.String, inner: Schema.Struct({ at: Schema.Date }) })
    expect(() => Walk.states(Lacking, { count: 1, seed: 1 })).toThrow(
      'no generator for a Declaration at .inner.at',
    )
  })

  it('throws when the checks refuse every value it can build', () => {
    const Never = Schema.String.check(Schema.isMinLength(100))
    expect(() => Walk.states(Never, { count: 1, seed: 1 })).toThrow('all refused')
  })

  it('gives starts a walk can begin from', async () => {
    const result = await Walk.run({
      cases: Walk.cases<typeof Row.Type, { readonly _tag: 'Touch' }>()({
        Touch: { touched: () => ({ _tag: 'Touch' }) },
      }).list,
      from: Walk.states(Row, { count: 3, seed: 9 }),
      step: model => model,
      violations: before => (before.quantity > 0 ? [] : [{ law: 'positive', message: 'no' }]),
      seeds: 2,
      steps: 2,
    })
    expect(result.failures).toEqual([])
  })
})

describe('Walk.cases', () => {
  type Message = { readonly _tag: 'A' } | { readonly _tag: 'B' }

  it('needs a generator for every variant', () => {
    // @ts-expect-error B has no generator
    Walk.cases<number, Message>()({ A: { one: () => ({ _tag: 'A' }) } })
  })

  it('refuses a key that is no variant', () => {
    Walk.cases<number, Message>()({
      A: { one: () => ({ _tag: 'A' }) },
      B: { one: () => ({ _tag: 'B' }) },
      // @ts-expect-error C is not a variant
      C: { one: () => ({ _tag: 'B' }) },
    })
  })

  it('lists every generator under its tag and name', () => {
    const { list } = Walk.cases<number, Message>()({
      A: { one: () => ({ _tag: 'A' }), two: () => ({ _tag: 'A' }) },
      B: { three: () => ({ _tag: 'B' }) },
    })
    expect(list.map(({ tag, name }) => `${tag}/${name}`)).toEqual(['A/one', 'A/two', 'B/three'])
  })
})

// Seed 1 over two cases, as the generator `heldValue.test.ts` first used drew it.
const PINNED = [
  'Add: two',
  'Add: one',
  'Add: one',
  'Add: one',
  'Add: one',
  'Add: two',
  'Add: one',
  'Add: two',
]

describe('Walk.run', () => {
  interface Counter {
    readonly n: number
  }
  type Message = { readonly _tag: 'Add'; readonly by: number }
  const { list: adds } = Walk.cases<Counter, Message>()({
    Add: { one: () => ({ _tag: 'Add', by: 1 }) },
  })
  const { list: both } = Walk.cases<Counter, Message>()({
    Add: { one: () => ({ _tag: 'Add', by: 1 }), two: () => ({ _tag: 'Add', by: 2 }) },
  })
  const addOne: Message = { _tag: 'Add', by: 1 }
  const base = {
    step: (model: Counter, message: Message) => ({ n: model.n + message.by }),
    violations: (_: Counter, __: Message, after: Counter) =>
      after.n >= 100 ? [{ law: 'below 100', message: `reached ${after.n}` }] : [],
    seeds: 5,
    steps: 12,
  }

  it('finds a law that holds from the usual start and breaks from an installed one, by name', async () => {
    const result = await Walk.run({
      ...base,
      cases: adds,
      from: [
        { name: 'loaded', start: () => ({ n: 0 }) },
        { name: 'near the edge', start: () => ({ n: 98 }) },
      ],
    })
    expect(result.failures).toEqual([
      {
        start: 'near the edge',
        seed: Option.some(1),
        path: ['Add: one', 'Add: one'],
        broken: [{ law: 'below 100', message: 'reached 100' }],
      },
    ])
  })

  it('reports no failure when every start keeps the law', async () => {
    const result = await Walk.run({
      ...base,
      cases: adds,
      from: [{ name: 'loaded', start: () => ({ n: 0 }) }],
    })
    expect(result).toEqual({ failures: [], seeds: 5, steps: 12 })
  })

  it('draws the same walks from the same seeds', async () => {
    const run = () =>
      Walk.run({
        ...base,
        cases: both,
        from: [{ name: 'start', start: () => ({ n: 0 }) }],
        violations: (_, __, after) => (after.n > 10 ? [{ law: 'under 18', message: '' }] : []),
        seeds: 1,
      })
    const first = await run()
    expect(first.failures[0]?.path).toEqual(PINNED)
    expect(await run()).toEqual(first)
  })

  it('awaits an asynchronous step', async () => {
    const result = await Walk.run({
      ...base,
      cases: adds,
      step: async (model, message) => ({ n: model.n + message.by + 50 }),
      from: [{ name: 'loaded', start: () => ({ n: 0 }) }],
      seeds: 1,
    })
    expect(result.failures.map(({ path }) => path)).toEqual([['Add: one', 'Add: one']])
  })

  it('runs each regression from its own start, naming it', async () => {
    const result = await Walk.run({
      ...base,
      cases: adds,
      from: [{ name: 'loaded', start: () => ({ n: 0 }) }],
      regressions: [
        { name: 'fine', from: () => ({ n: 0 }), case: () => addOne },
        { name: 'one step over', from: () => ({ n: 99 }), case: () => addOne },
      ],
    })
    expect(result.failures).toEqual([
      {
        start: 'regression: one step over',
        seed: Option.none(),
        path: [],
        broken: [{ law: 'below 100', message: 'reached 100' }],
      },
    ])
  })

  it('refuses a walk with no start or no case', async () => {
    await expect(Walk.run({ ...base, cases: adds, from: [] })).rejects.toThrow('no starts')
    await expect(
      Walk.run({ ...base, cases: [], from: [{ name: 'x', start: () => ({ n: 0 }) }] }),
    ).rejects.toThrow('nothing to walk')
  })
})

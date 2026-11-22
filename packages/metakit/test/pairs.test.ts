import { Option, Schema } from 'effect'
import { Eq, Num, Transition, Verdict } from 'metakit'
import * as Machine from 'metakit/machine'
import * as Pairs from 'metakit/pairs'
import * as Temporal from 'metakit/temporal'
import { describe, expect, it } from 'vitest'

const State = Schema.Struct({
  count: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
  log: Schema.Array(Schema.String),
  title: Schema.String,
})
const Amount = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 }))

const Bump = Transition.make({
  state: State,
  input: Schema.Struct({ by: Amount }),
  apply: ({ state, input }) => [Transition.add(state.count, input.by)],
})
const Reset = Transition.make({
  state: State,
  input: Schema.Struct({}),
  apply: ({ state }) => [Transition.set(state.count, 0)],
})
const Note = Transition.make({
  state: State,
  input: Schema.Struct({ line: Schema.String }),
  apply: ({ state, input }) => [Transition.append(state.log, input.line)],
})
const Retitle = Transition.make({
  state: State,
  input: Schema.Struct({ title: Schema.String }),
  apply: ({ state, input }) => [Transition.set(state.title, input.title)],
})
const Notebook = Machine.make({ state: State, transitions: { Bump, Reset, Note, Retitle } })

const verdictOf = (name: string) =>
  Verdict.isTrue(Pairs.pairs(Notebook).find(pair => pair.name === name)!.verdict)

describe('the pairs of a machine', () => {
  it('lists each pair whose footprints overlap, and none on disjoint state', () => {
    expect(Pairs.pairs(Notebook).map(({ name }) => name)).toEqual([
      'Bump/Bump',
      'Bump/Reset',
      'Reset/Reset',
      'Note/Note',
      'Retitle/Retitle',
    ])
  })

  it('decides a pair from the rule and says which', () => {
    const [bumps, bumpAndReset, resets, notes, retitles] = Pairs.pairs(Notebook)
    expect(bumps?.why).toBe(
      'an add and an add of "count": integer amounts, and every total either order passes through stays in the safe range',
    )
    expect(resets?.why).toBe('a set and a set of "count": both write one literal')
    expect(Verdict.isTrue(bumps!.verdict)).toBe(true)
    expect(Verdict.isTrue(resets!.verdict)).toBe(true)
    expect([bumpAndReset, notes, retitles].map(pair => Verdict.isTrue(pair!.verdict))).toEqual([
      false,
      false,
      false,
    ])
    expect(notes?.why).toBe('a append and a append of "log" do not decide')
  })

  it('owes a walk for each pair that does not decide, and for no other', () => {
    expect(Pairs.owed(Notebook).map(({ name }) => name)).toEqual([
      'Bump/Reset',
      'Note/Note',
      'Retitle/Retitle',
    ])
    expect(Pairs.owed(Notebook)[1]).toEqual({
      kind: 'walk',
      name: 'Note/Note',
      detail:
        'the order of Note and Note is undecided: a append and a append of "log" do not decide',
      over: ['Note', 'Note'],
    })
  })

  it('leaves a pair with an opaque transition undecided where it overlaps the declared footprint', () => {
    const Mirror = Transition.opaque({
      name: 'Mirror',
      state: State,
      input: Schema.Struct({ title: Schema.String }),
      reads: ({ input }) => [input.title],
      writes: ({ state }) => [state.title],
      run: (state, input) => ({ ...state, title: input.title.trim() }),
    })
    const Mirrored = Machine.make({ state: State, transitions: { Retitle, Mirror, Bump } })
    const found = Pairs.pairs(Mirrored)
    expect(found.map(({ name }) => name)).toEqual([
      'Retitle/Retitle',
      'Retitle/Mirror',
      'Mirror/Mirror',
      'Bump/Bump',
    ])
    expect(found.map(({ verdict }) => Verdict.isTrue(verdict))).toEqual([false, false, false, true])
  })
})

describe('walking both orders of a pair', () => {
  it('breaks on two appends with a seed, and the seed runs the case again', () => {
    const result = Pairs.walkPair(Notebook, ['Note', 'Note'])
    expect(result._tag).toBe('Broken')
    if (!Temporal.WalkResult.$is('Broken')(result)) return
    expect(result.reason).toContain('differ in log')
    expect(result.interleaving).toEqual(['Note', 'Note'])
    const again = Pairs.walkPair(Notebook, ['Note', 'Note'], { seed: result.seed, runs: 1 })
    expect(again).toEqual(result)
  })

  it('holds for two adds of integers in range', () => {
    expect(Pairs.walkPair(Notebook, ['Bump', 'Bump'])).toEqual(
      Temporal.WalkResult.Held({ seed: 1, runs: 100 }),
    )
  })

  it('breaks where an add meets a set of the same total', () => {
    expect(Pairs.walkPair(Notebook, ['Bump', 'Reset'])._tag).toBe('Broken')
  })

  it('refuses a tag the machine does not declare', () => {
    expect(() => Pairs.walkPair(Notebook, ['Bump', 'Missing' as 'Bump'])).toThrow(
      'the machine declares no transition "Missing"',
    )
  })

  it('treats a step refused in one order as a difference, and two equal Messages as none', () => {
    const Once = Transition.make({
      state: State,
      input: Schema.Struct({}),
      when: ({ state }) => Num.lt(state.count, 1),
      apply: ({ state }) => [Transition.set(state.count, 1)],
    })
    const Gate = Machine.make({ state: State, transitions: { Once, Reset } })
    expect(Pairs.walkPair(Gate, ['Once', 'Once'])._tag).toBe('Held')
    expect(Pairs.walkPair(Gate, ['Once', 'Reset'])._tag).toBe('Broken')
  })

  const reasonOf = (result: Temporal.WalkResult) =>
    Temporal.WalkResult.$match(result, { Held: () => 'held', Broken: ({ reason }) => reason })

  it('tells which Message was refused: two claims leave one state, and the one refused differs', () => {
    const claim = (title: string) =>
      Transition.make({
        state: State,
        input: Schema.Struct({}),
        when: ({ state }) => Eq.equals(state.title, ''),
        apply: ({ state }) => [Transition.set(state.title, title)],
      })
    const Claims = Machine.make({
      state: State,
      transitions: { Left: claim('x'), Right: claim('x') },
    })
    const result = Pairs.walkPair(Claims, ['Left', 'Right'])
    expect(reasonOf(result)).toContain('which step was refused')
    expect(Pairs.walkPair(Claims, ['Left', 'Left'])._tag).toBe('Held')
  })

  it('compares the records emitted: two writes of one literal still tell what they saw', () => {
    const say = (record: 'Heard' | 'Shouted') =>
      Transition.make({
        state: State,
        input: Schema.Struct({}),
        apply: ({ state }) => [Transition.set(state.title, 'x')],
        emits: ({ state }) => [Transition.emit(record, { title: state.title })],
      })
    const Echo = Machine.make({
      state: State,
      transitions: { Hear: say('Heard'), Shout: say('Shouted') },
    })
    expect(reasonOf(Pairs.walkPair(Echo, ['Hear', 'Shout']))).toContain('the records emitted')
  })

  it('draws a Message toward the rows the state holds: two renames of one row do not commute', () => {
    const Items = Schema.Struct({
      items: Schema.Array(
        Schema.Struct({ id: Schema.String.check(Schema.isMinLength(12)), title: Schema.String }),
      ),
    })
    const Rename = Transition.make({
      state: Items,
      input: Schema.Struct({
        id: Schema.String.check(Schema.isMinLength(12)),
        title: Schema.String,
      }),
      apply: ({ state, input }) => [
        Transition.patch(state.items, input.id, () => ({ title: input.title })),
      ],
    })
    const Shelf = Machine.make({ state: Items, transitions: { Rename } })
    expect(reasonOf(Pairs.walkPair(Shelf, ['Rename', 'Rename']))).toContain('differ in items')
  })

  it('keeps the Message it generated where a drawn string would break its Schema', () => {
    const Kind = Schema.Literals(['x', 'y'])
    const Picks = Schema.Struct({ a: Kind, b: Kind, c: Kind, d: Kind, e: Kind, f: Kind })
    const Mark = Transition.make({
      state: State,
      input: Picks,
      apply: ({ state, input }) => [Transition.set(state.title, input.a)],
    })
    const Marks = Machine.make({ state: State, transitions: { Mark } })
    expect(Pairs.walkPair(Marks, ['Mark', 'Mark'])._tag).toBe('Broken')
  })
})

describe('settling a machine in a registry', () => {
  it('discharges each undecided pair by its walk and checks each decided one', () => {
    const registry = Temporal.makeRegistry()
    Pairs.settle(Notebook, { owner: 'notebook', registry })
    const report = registry.report()
    expect(report.ok).toBe(true)
    expect(report.open).toEqual([])
    expect(report.discharged.map(({ obligation }) => obligation.name)).toEqual([
      'Bump/Reset',
      'Note/Note',
      'Retitle/Retitle',
    ])
    expect(report.discharged.map(({ discharge }) => discharge.answer)).toEqual([
      'order-matters',
      'order-matters',
      'order-matters',
    ])
    expect(report.decided.map(({ name, checked }) => [name, Option.isSome(checked)])).toEqual([
      ['Bump/Bump', true],
      ['Reset/Reset', true],
    ])
    expect(report.format()).toContain('notebook Bump/Bump: an add and an add of "count"')
    expect(report.format()).toContain('notebook Note/Note: the order matters (seed 1: with Note')
  })

  it('leaves each undecided pair open until it is walked, naming where it was declared', () => {
    const registry = Temporal.makeRegistry()
    Pairs.declare(Notebook, { owner: 'notebook', registry })
    const report = registry.report()
    expect(report.ok).toBe(false)
    expect(report.open.map(({ obligation }) => obligation.name)).toEqual([
      'Bump/Reset',
      'Note/Note',
      'Retitle/Retitle',
    ])
    expect(report.open.every(({ where }) => where.includes('pairs.test.ts'))).toBe(true)
    expect(report.format()).toContain('notebook Note/Note (declared at ')
    expect(report.decided.every(({ checked }) => Option.isNone(checked))).toBe(true)
  })

  it('has no pair of a machine decided wrongly', () => {
    const registry = Temporal.makeRegistry()
    Pairs.settle(Notebook, { owner: 'notebook', registry })
    expect(registry.report().refuted).toEqual([])
    expect(['Bump/Bump', 'Reset/Reset'].map(verdictOf)).toEqual([true, true])
  })
})

describe('the registry', () => {
  const broken = Temporal.WalkResult.Broken({
    seed: 3,
    interleaving: ['A', 'B'],
    minimal: ['A', 'B'],
    reason: 'x',
  })
  const owed = [Temporal.obligation({ name: 'A/B', shows: 'order', over: ['A', 'B'] })]

  it('keeps an obligation open while its walks broke, and closes it when one held', () => {
    const registry = Temporal.makeRegistry()
    registry.declare({ owner: 'p', where: 'p.ts:1' }, owed)
    registry.record({ owner: 'p' }, { obligation: 'A/B', result: broken })
    expect(registry.report().open[0]?.why).toBe('broke at seed 3 in the order A, B: x')
    registry.record(
      { owner: 'p' },
      { obligation: 'A/B', result: Temporal.WalkResult.Held({ seed: 1, runs: 5 }) },
    )
    expect(registry.report().ok).toBe(true)
  })

  it('refuses a discharge of an obligation nobody declared, and a name declared twice from two places', () => {
    const registry = Temporal.makeRegistry()
    registry.declare({ owner: 'p', where: 'p.ts:1' }, owed)
    expect(() => registry.record({ owner: 'q' }, { obligation: 'A/B', result: broken })).toThrow(
      'q declared no obligation "A/B"',
    )
    expect(() => registry.declare({ owner: 'p', where: 'p.ts:9' }, owed)).toThrow(
      'p declares "A/B" at p.ts:1 and again at p.ts:9',
    )
    expect(() => registry.declare({ owner: 'p', where: 'p.ts:1' }, owed)).not.toThrow()
  })

  it('fails the report for a decided pair a walk refutes', () => {
    const registry = Temporal.makeRegistry()
    registry.decide({ owner: 'p', where: 'p.ts:1' }, { name: 'A/B', reason: 'r', checked: broken })
    expect(registry.report().ok).toBe(false)
    expect(registry.report().format()).toContain('decided wrongly')
  })

  it('is one registry for every copy of the module', () => {
    expect(Temporal.registry).toBe(Reflect.get(globalThis, Symbol.for('metakit/temporal/registry')))
  })
})

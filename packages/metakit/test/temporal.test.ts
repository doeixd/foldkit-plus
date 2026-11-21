import { Effect, Option, Schema } from 'effect'
import { Expr, Num, Transition } from 'metakit'
import * as Rows from 'metakit/aggregates'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'
import * as Temporal from 'metakit/temporal'
import { describe, expect, it } from 'vitest'

const Account = Schema.Struct({ balance: Schema.Int, label: Schema.String }).pipe(
  Expr.refine($ => Num.gte($.balance, 0)),
)
const Amount = Schema.Struct({ amount: Schema.Int.pipe(Expr.refine($ => Num.gt($, 0))) })

const Deposit = Transition.make({
  state: Account,
  input: Amount,
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.add(state.balance, input.amount)),
  ],
})
const Withdraw = Transition.make({
  state: Account,
  input: Amount,
  when: ({ state, input }) => Num.lte(input.amount, state.balance),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
})
const Relabel = Transition.make({
  state: Account,
  input: Schema.Struct({ label: Schema.String }),
  apply: ({ state, input }) => [Transition.set(state.label, input.label)],
})
const Bank = Machine.make({ state: Account, transitions: { Deposit, Withdraw, Relabel } })

const Entry = Schema.Struct({ account: Schema.String, delta: Schema.Int })
const aggregates = {
  balanceIsItsEntries: Rows.sum(Entry, $ => $.delta),
  entryLimit: Rows.count(Entry),
}

const store = (
  isolation: Temporal.Isolation,
  parentRowLock: boolean,
): Temporal.StoreCapabilities => ({ name: `${isolation}-store`, isolation, parentRowLock })

describe('what each declared rule needs of its store', () => {
  it('reads row-atomic off a transition and parent-serialized off an aggregate', () => {
    expect(Temporal.requirements({ machine: Bank, aggregates })).toEqual([
      { rule: 'Deposit', needs: 'row-atomic', because: 'it writes from the state it read' },
      { rule: 'Withdraw', needs: 'row-atomic', because: 'it writes from the state it read' },
      {
        rule: 'Relabel',
        needs: 'row-atomic',
        because: "it writes a state whose Schema's rules it must keep",
      },
      {
        rule: 'balanceIsItsEntries',
        needs: 'parent-serialized',
        because: 'it reads every row under one parent',
      },
      {
        rule: 'entryLimit',
        needs: 'parent-serialized',
        because: 'it reads every row under one parent',
      },
    ])
  })

  it('asks nothing for a write that reads no state into a state with no rules', () => {
    const Note = Schema.Struct({ title: Schema.String })
    const Retitle = Transition.make({
      state: Note,
      input: Schema.Struct({ title: Schema.String }),
      apply: ({ state, input }) => [Transition.set(state.title, input.title)],
    })
    const Notes = Machine.make({ state: Note, transitions: { Retitle } })
    expect(Temporal.requirements({ machine: Notes })).toEqual([])
  })

  it('refuses one key naming a transition and an aggregate', () => {
    expect(() =>
      Temporal.requirements({ machine: Bank, aggregates: { Deposit: Rows.count(Entry) } }),
    ).toThrow('"Deposit" names both a transition and an aggregate')
  })
})

describe('mounting on a store', () => {
  const transitions = Temporal.requirements({ machine: Bank })
  const rows = Temporal.requirements({ aggregates })

  it.each([
    { needed: transitions, on: store('read-committed', false) },
    { needed: transitions, on: store('serializable', false) },
    { needed: rows, on: store('serializable', false) },
    { needed: rows, on: store('read-committed', true) },
  ])('mounts on $on.name (lock: $on.parentRowLock)', ({ needed, on }) => {
    expect(needed.length).toBeGreaterThan(0)
    expect(() => Temporal.mount(on, needed)).not.toThrow()
  })

  it.each([
    { needed: transitions, on: store('eventual', false), rule: 'Withdraw', needs: 'row-atomic' },
    // A lock is no use to a store that merges writes after the fact.
    { needed: transitions, on: store('eventual', true), rule: 'Deposit', needs: 'row-atomic' },
    {
      needed: rows,
      on: store('read-committed', false),
      rule: 'balanceIsItsEntries',
      needs: 'parent-serialized',
    },
    { needed: rows, on: store('eventual', true), rule: 'entryLimit', needs: 'parent-serialized' },
  ])('throws on $on.name (lock: $on.parentRowLock) for $rule', ({ needed, on, rule, needs }) => {
    expect(() => Temporal.mount(on, needed)).toThrow(Temporal.StoreRefused)
    expect(() => Temporal.mount(on, needed)).toThrow(`store "${on.name}"`)
    expect(() => Temporal.mount(on, needed)).toThrow(`"${rule}" needs ${needs}`)
  })

  it('names only the rules the store cannot hold', () => {
    const all = Temporal.requirements({ machine: Bank, aggregates })
    expect(Temporal.refused(store('read-committed', false), all).map(({ rule }) => rule)).toEqual([
      'balanceIsItsEntries',
      'entryLimit',
    ])
  })
})

describe('walk obligations of a machine', () => {
  it('names each pair whose order matters, and no pair on disjoint state', () => {
    expect(Temporal.obligations(Bank).map(({ name }) => name)).toEqual([
      'Deposit/Deposit',
      'Deposit/Withdraw',
      'Withdraw/Withdraw',
      'Relabel/Relabel',
    ])
    const [first] = Temporal.obligations(Bank)
    expect(first).toEqual({
      kind: 'walk',
      name: 'Deposit/Deposit',
      detail:
        'answers to Deposit and Deposit arriving in either order leave the state their sending order leaves',
      over: ['Deposit', 'Deposit'],
    })
  })

  it('pairs a write under a path with a write of the whole', () => {
    const Meta = Schema.Struct({ title: Schema.String })
    const Doc = Schema.Struct({ meta: Meta, body: Schema.String })
    const Retitle = Transition.make({
      state: Doc,
      input: Meta,
      apply: ({ state, input }) => [Transition.set(state.meta.title, input.title)],
    })
    const Replace = Transition.make({
      state: Doc,
      input: Schema.Struct({ meta: Meta }),
      apply: ({ state, input }) => [Transition.set(state.meta, input.meta)],
    })
    const Rewrite = Transition.make({
      state: Doc,
      input: Schema.Struct({ body: Schema.String }),
      apply: ({ state, input }) => [Transition.set(state.body, input.body)],
    })
    const Docs = Machine.make({ state: Doc, transitions: { Retitle, Replace, Rewrite } })
    expect(Temporal.obligations(Docs).map(({ name }) => name)).toEqual([
      'Retitle/Retitle',
      'Retitle/Replace',
      'Replace/Replace',
      'Rewrite/Rewrite',
    ])
  })

  it('rides on the proof report beside the proved entries', async () => {
    const report = await Effect.runPromise(Prove.machine(Bank))
    expect(report.ok).toBe(true)
    expect(report.obligations).toEqual(Temporal.obligations(Bank))
    expect(report.format()).toContain('OBLIGATION (walk) Deposit/Withdraw: answers to Deposit')
  })
})

/** A page showing a title: each edit shows at once, and an answer shows what the server stored. */
interface Page {
  readonly shown: string
  readonly latest: number
}

/** Two edits of one title, answered in any order; `dropsStale` is the check under test. */
const twoEdits = (dropsStale: boolean): Temporal.Scenario<Page, string, 'Deposit'> => {
  const send =
    (request: number, title: string) =>
    (page: Page): Page => ({
      shown: title,
      latest: request,
    })
  const answer =
    (request: number, title: string) =>
    (page: Page): Page =>
      dropsStale && request < page.latest ? page : { ...page, shown: title }
  return {
    initial: () => ({ shown: 'original', latest: 0 }),
    steps: [
      { name: 'send first', of: 'Deposit', run: send(1, 'first') },
      { name: 'send second', of: 'Deposit', after: ['send first'], run: send(2, 'second') },
      { name: 'answer first', after: ['send first'], run: answer(1, 'first') },
      { name: 'answer second', after: ['send second'], run: answer(2, 'second') },
      { name: 'reconnect', run: page => page },
    ],
    holds: (page, ran) =>
      ran.includes('send second') && page.shown !== 'second'
        ? Option.some(`shows "${page.shown}" after the second edit`)
        : Option.none(),
  }
}

describe('walking a scenario', () => {
  it('holds where a stale answer is dropped', () => {
    expect(Temporal.walk(twoEdits(true))).toEqual(Temporal.WalkResult.Held({ seed: 1, runs: 200 }))
  })

  it('finds a planted race, its seed and its fewest steps', () => {
    const result = Temporal.walk(twoEdits(false))
    expect(result._tag).toBe('Broken')
    if (result._tag !== 'Broken') return
    expect(result.reason).toBe('shows "first" after the second edit')
    expect(result.minimal).toEqual(['send first', 'send second', 'answer first'])
    expect(result.interleaving.at(-1)).toBe('answer first')
    // The reported seed alone runs the same order again.
    expect(Temporal.walk(twoEdits(false), { seed: result.seed, runs: 1 })).toEqual(result)
  })

  it('tries the orders its seeds give, and no more than asked', () => {
    // Seed 1's order answers in turn, so one run of it finds nothing.
    const found = Temporal.walk(twoEdits(false))
    expect(found._tag === 'Broken' && found.seed).toBeGreaterThan(1)
    expect(Temporal.walk(twoEdits(false), { seed: 1, runs: 1 })._tag).toBe('Held')
  })

  it('asks the property after every step, not only the last', () => {
    const result = Temporal.walk<boolean, 'break' | 'mend'>({
      initial: () => true,
      steps: [
        { name: 'break', run: () => false },
        { name: 'mend', after: ['break'], run: () => true },
      ],
      holds: sound => (sound ? Option.none() : Option.some('broken between the steps')),
    })
    expect(result).toEqual(
      Temporal.WalkResult.Broken({
        seed: 1,
        interleaving: ['break'],
        minimal: ['break'],
        reason: 'broken between the steps',
      }),
    )
  })

  it('never runs a step before one it waits on', () => {
    const scenario: Temporal.Scenario<ReadonlyArray<string>, 'a' | 'b' | 'c'> = {
      initial: () => [],
      steps: [
        { name: 'c', after: ['b'], run: ran => [...ran, 'c'] },
        { name: 'b', after: ['a'], run: ran => [...ran, 'b'] },
        { name: 'a', run: ran => [...ran, 'a'] },
      ],
      holds: ran =>
        ran.join('') === 'abc'.slice(0, ran.length) ? Option.none() : Option.some(ran.join('')),
    }
    expect(Temporal.walk(scenario)._tag).toBe('Held')
  })

  it('refuses steps no order can run', () => {
    const step = (name: 'a' | 'b', after: 'a' | 'b') => ({
      name,
      after: [after],
      run: (n: number) => n,
    })
    const holds = () => Option.none<string>()
    expect(() =>
      Temporal.walk({ initial: () => 0, steps: [step('a', 'b'), step('b', 'a')], holds }),
    ).toThrow('steps "a", "b" wait on each other')
    expect(() =>
      Temporal.walk({ initial: () => 0, steps: [step('a', 'a'), step('a', 'a')], holds }),
    ).toThrow('two steps are named "a"')
  })
})

describe('discharging obligations', () => {
  const owed = Temporal.obligations(Bank)
  const deposits = owed.find(({ name }) => name === 'Deposit/Deposit')!

  it('lists every obligation until a walk that held covers it', () => {
    expect(Temporal.undischarged(owed, [])).toEqual(owed)
    const held = Temporal.discharge(deposits, twoEdits(true))
    expect(held).toEqual({
      obligation: 'Deposit/Deposit',
      result: Temporal.WalkResult.Held({ seed: 1, runs: 200 }),
    })
    expect(Temporal.undischarged(owed, [held]).map(({ name }) => name)).toEqual([
      'Deposit/Withdraw',
      'Withdraw/Withdraw',
      'Relabel/Relabel',
    ])
  })

  it('leaves an obligation owed when its walk broke', () => {
    const broke = Temporal.discharge(deposits, twoEdits(false))
    expect(broke.result._tag).toBe('Broken')
    expect(Temporal.undischarged(owed, [broke])).toEqual(owed)
  })

  it('refuses a scenario with too few steps of what the obligation is over', () => {
    const once: Temporal.Scenario<Page, string, 'Deposit'> = {
      ...twoEdits(true),
      steps: twoEdits(true).steps.filter(
        ({ name }) => name !== 'send second' && name !== 'answer second',
      ),
    }
    expect(() => Temporal.discharge(deposits, once)).toThrow(
      'obligation "Deposit/Deposit" is over Deposit, Deposit, but the scenario has too few steps of "Deposit"',
    )
  })

  it('carries an obligation a check of your own emits', () => {
    const reconnect = Temporal.obligation({
      name: 'reconnect',
      shows: 'a reconnect between an edit and its answer loses neither',
      over: ['Deposit'],
    })
    expect(reconnect).toEqual({
      kind: 'walk',
      name: 'reconnect',
      detail: 'a reconnect between an edit and its answer loses neither',
      over: ['Deposit'],
    })
    expect(
      Temporal.undischarged([reconnect], [Temporal.discharge(reconnect, twoEdits(true))]),
    ).toEqual([])
  })
})

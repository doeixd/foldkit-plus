/**
 * `convergence` and `settleConvergence` over a small machine: which pairs of
 * the durable Messages may rebase, what a copy of each needs, and how the
 * answers of the walks the caller gives are filed.
 */
import { Schema } from 'effect'
import { Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import * as Temporal from 'metakit/temporal'
import { describe, expect, it } from 'vitest'
import { convergence, settleConvergence } from '../src/metakit.js'

const Model = Schema.Struct({
  title: Schema.String,
  tags: Schema.Array(Schema.String),
  items: Schema.Array(Schema.Struct({ id: Schema.String, done: Schema.Boolean })),
  count: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
})
const Input = Schema.Struct({ id: Schema.String, text: Schema.String })

const machine = Machine.make({
  state: Model,
  transitions: {
    Titled: Transition.make({
      state: Model,
      input: Input,
      apply: ({ state, input }) => [Transition.set(state.title, input.text)],
    }),
    Cleared: Transition.make({
      state: Model,
      input: Input,
      apply: ({ state }) => [Transition.removeWhere(state.items, item => item.done)],
    }),
    Tagged: Transition.make({
      state: Model,
      input: Input,
      apply: ({ state, input }) => [Transition.append(state.tags, input.text)],
    }),
    Counted: Transition.make({
      state: Model,
      input: Input,
      apply: ({ state }) => [Transition.add(state.count, 1)],
    }),
    // Not durable: it writes the title too, but is never replicated.
    Local: Transition.make({
      state: Model,
      input: Input,
      apply: ({ state, input }) => [Transition.set(state.title, input.id)],
    }),
  },
})
const durable = ['Titled', 'Cleared', 'Tagged', 'Counted'] as const

describe('convergence', () => {
  const read = convergence(machine, durable)
  const rebase = Object.fromEntries(read.pairs.map(({ name, rebase: answer }) => [name, answer]))

  it('lists the pairs of durable Messages that write one path, and none with a Message that is not durable', () => {
    expect(Object.keys(rebase).sort()).toEqual([
      'Cleared/Cleared',
      'Counted/Counted',
      'Tagged/Tagged',
      'Titled/Titled',
    ])
  })

  it('says a rebase never changes what the pairs that commute showed, and possibly does for the others', () => {
    expect(rebase).toMatchObject({
      'Cleared/Cleared': 'never',
      'Counted/Counted': 'never',
      'Titled/Titled': 'possible',
      'Tagged/Tagged': 'possible',
    })
  })

  it('gives the rule that decides a pair that never rebases and why the others are not decided', () => {
    const why = Object.fromEntries(read.pairs.map(({ name, why: reason }) => [name, reason]))
    expect(why['Cleared/Cleared']).toContain('removeWhere')
    expect(why['Counted/Counted']).toContain('safe range')
    expect(why['Titled/Titled']).toContain('set')
  })

  it('says a copy is harmless where every way of writing it is idempotent, and removed by id where one is not', () => {
    const copies = Object.fromEntries(read.redelivery.map(({ tag, copy }) => [tag, copy]))
    expect(copies).toEqual({
      Titled: 'harmless',
      Cleared: 'harmless',
      Tagged: 'removed by id',
      Counted: 'removed by id',
    })
    const why = Object.fromEntries(read.redelivery.map(({ tag, why: reason }) => [tag, reason]))
    expect(why.Titled).toContain('set')
    expect(why.Tagged).toContain('append')
  })

  it('deduplicates repeated tags and throws on unknown tags', () => {
    const deduped = convergence(machine, ['Titled', 'Titled'])
    expect(deduped.redelivery.map(({ tag }) => tag)).toEqual(['Titled'])
    expect(() => convergence(machine, ['Missing' as 'Titled'])).toThrow(
      /the machine declares no transition "Missing"/,
    )
  })
})

describe('settleConvergence', () => {
  const held = Temporal.WalkResult.Held({ seed: 1, runs: 3 })
  const settle = async (walks: {
    readonly orderMatters: (over: readonly string[]) => boolean
    readonly redelivery: (tag: string) => Temporal.WalkResult
  }) => {
    const registry = Temporal.makeRegistry()
    await settleConvergence(machine, durable, {
      owner: 'fixture',
      where: 'convergenceRead.test.ts',
      registry,
      walkPair: async over => ({ result: held, orderMatters: walks.orderMatters(over) }),
      walkRedelivery: async tag => walks.redelivery(tag),
    })
    return registry.report()
  }

  it('discharges each pair that may rebase and each copy, answering where the order showed', async () => {
    const report = await settle({
      orderMatters: over => over.every(tag => tag === 'Titled'),
      redelivery: () => held,
    })
    expect(report.open).toEqual([])
    const discharged = Object.fromEntries(
      report.discharged.map(({ obligation, discharge }) => [obligation.name, discharge.answer]),
    )
    expect(discharged).toEqual({
      'rebase Titled/Titled': 'order-matters',
      'rebase Tagged/Tagged': undefined,
      'redelivery Titled': undefined,
      'redelivery Cleared': undefined,
      'redelivery Tagged': undefined,
      'redelivery Counted': undefined,
    })
    expect(report.decided.map(({ name }) => name).sort()).toEqual([
      'rebase Cleared/Cleared',
      'rebase Counted/Counted',
    ])
    expect(report.ok).toBe(true)
  })

  it('refutes a pair declared never to rebase whose two orders left different documents', async () => {
    const report = await settle({
      orderMatters: over => over[0] === 'Counted',
      redelivery: () => held,
    })
    expect(report.refuted.map(({ name }) => name)).toEqual(['rebase Counted/Counted'])
    expect(report.ok).toBe(false)
  })

  it('leaves a pair open when the replicas diverged, even where the order matters', async () => {
    const diverged = Temporal.WalkResult.Broken({
      seed: 4,
      interleaving: ['Titled', 'Titled'],
      minimal: ['Titled', 'Titled'],
      reason: 'the replicas ended on different documents',
    })
    const registry = Temporal.makeRegistry()
    await settleConvergence(machine, durable, {
      owner: 'fixture',
      where: 'convergenceRead.test.ts',
      registry,
      walkPair: async over => ({
        result: over[0] === 'Titled' ? diverged : held,
        orderMatters: true,
      }),
      walkRedelivery: async () => held,
    })
    const report = registry.report()
    expect(report.open.map(({ obligation }) => obligation.name)).toEqual(['rebase Titled/Titled'])
    expect(report.ok).toBe(false)
  })

  it('leaves a copy open while its walk breaks', async () => {
    const report = await settle({
      orderMatters: () => false,
      redelivery: tag =>
        tag === 'Tagged'
          ? Temporal.WalkResult.Broken({
              seed: 2,
              interleaving: ['submit'],
              minimal: ['submit'],
              reason: 'counted twice',
            })
          : held,
    })
    expect(report.open.map(({ obligation }) => obligation.name)).toEqual(['redelivery Tagged'])
  })
})

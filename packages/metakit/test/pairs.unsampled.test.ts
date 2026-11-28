import { Effect, Schema } from 'effect'
import { Transition } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import * as Pairs from '@doeixd/metakit/pairs'
import * as Temporal from '@doeixd/metakit/temporal'
import { describe, expect, it, vi } from 'vitest'

// A sampler that draws no state: the walk ran no case, so it shows nothing about the order.
vi.mock('effect', async importOriginal => {
  const original = await importOriginal<typeof import('effect')>()
  return {
    ...original,
    Arbitrary: { ...original.Arbitrary, sampleEffect: () => Effect.succeed([]) },
  }
})

const State = Schema.Struct({ title: Schema.String })
const Retitle = Transition.make({
  state: State,
  input: Schema.Struct({ title: Schema.String }),
  apply: ({ state, input }) => [Transition.set(state.title, input.title)],
})
const Titled = Machine.make({ state: State, transitions: { Retitle } })

describe('settling a pair whose walk sampled no state', () => {
  it('leaves the pair open instead of recording that the order matters', () => {
    const registry = Temporal.makeRegistry()
    Pairs.settle(Titled, { owner: 'titled', registry })
    const report = registry.report()
    expect(report.open.map(({ obligation }) => obligation.name)).toEqual(['Retitle/Retitle'])
    expect(report.discharged).toEqual([])
    expect(report.ok).toBe(false)
  })
})

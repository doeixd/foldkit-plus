import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Transition } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import * as Operation from '@doeixd/metakit/operation'
import { convergence } from '../src/convergence.js'

const Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0x7fff_ffff }))

const flagsOr = Operation.define({
  id: 'flags.or',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    idempotent: true,
    identity: { value: 0, side: 'both' },
  },
})

const flagsXor = Operation.define({
  id: 'flags.xor',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    identity: { value: 0, side: 'both' },
    invertible: { inverse: 'self' },
  },
})

const flagsAndNot = Operation.define({
  id: 'flags.andNot',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
})

const State = Schema.Struct({ granted: Flags })
const Bit = Schema.Struct({ bit: Flags })

const machine = Machine.make({
  state: State,
  transitions: {
    Grant: Transition.make({
      state: State,
      input: Bit,
      apply: ({ state, input }) => [Transition.combine(state.granted, flagsOr, input.bit)],
    }),
    Toggle: Transition.make({
      state: State,
      input: Bit,
      apply: ({ state, input }) => [Transition.combine(state.granted, flagsXor, input.bit)],
    }),
    Revoke: Transition.make({
      state: State,
      input: Bit,
      apply: ({ state, input }) => [Transition.combine(state.granted, flagsAndNot, input.bit)],
    }),
  },
})

describe('Sync convergence over Transition.combine', () => {
  it('classifies rebase and redelivery from custom operation claims', () => {
    const report = convergence(machine, ['Grant', 'Toggle', 'Revoke'])
    const pair = (name: string) => report.pairs.find(p => p.name === name)
    const redelivery = (tag: string) => report.redelivery.find(r => r.tag === tag)

    expect(pair('Grant/Grant')?.rebase).toBe('never')
    expect(pair('Toggle/Toggle')?.rebase).toBe('never')
    expect(pair('Revoke/Revoke')?.rebase).toBe('possible')
    expect(pair('Grant/Toggle')?.rebase).toBe('possible')

    expect(redelivery('Grant')?.copy).toBe('harmless')
    expect(redelivery('Toggle')?.copy).toBe('removed by id')
    expect(redelivery('Revoke')?.copy).toBe('removed by id')
  })
})

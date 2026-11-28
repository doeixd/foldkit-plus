import { Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Path, Transition, Verdict } from '../src/index.js'
import * as Operation from '../src/operation.js'

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

const flagsMaybeAssoc = Operation.define({
  id: 'flags.maybeAssoc',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: { unlessRefused: true },
    idempotent: true,
  },
})

const impls = Operation.implementations(
  'combine',
  Operation.implement(flagsOr, (a, b) => a | b),
  Operation.implement(flagsXor, (a, b) => a ^ b),
  Operation.implement(flagsAndNot, (a, b) => a & ~b),
)

const State = Schema.Struct({ granted: Flags })
const Bit = Schema.Struct({ bit: Flags })

const Grant = Transition.make({
  state: State,
  input: Bit,
  apply: ({ state, input }) => [Transition.combine(state.granted, flagsOr, input.bit)],
})

const Toggle = Transition.make({
  state: State,
  input: Bit,
  apply: ({ state, input }) => [Transition.combine(state.granted, flagsXor, input.bit)],
})

const Revoke = Transition.make({
  state: State,
  input: Bit,
  apply: ({ state, input }) => [Transition.combine(state.granted, flagsAndNot, input.bit)],
})

const MaybeAssoc = Transition.make({
  state: State,
  input: Bit,
  apply: ({ state, input }) => [Transition.combine(state.granted, flagsMaybeAssoc, input.bit)],
})

describe('Transition.combine', () => {
  it('commutes and is idempotent for flagsOr, and is Unknown with walk for flagsAndNot', () => {
    expect(Verdict.isTrue(Transition.commutes(Grant, Grant))).toBe(true)
    expect(Verdict.isTrue(Transition.idempotent(Grant))).toBe(true)

    const revComm = Transition.commutes(Revoke, Revoke)
    expect(Verdict.isUnknown(revComm)).toBe(true)
    if (Verdict.isUnknown(revComm)) {
      expect(Option.exists(revComm.obligation, o => o.kind === 'walk')).toBe(true)
    }

    const revIdem = Transition.idempotent(Revoke)
    expect(Verdict.isUnknown(revIdem)).toBe(true)
    if (Verdict.isUnknown(revIdem)) {
      expect(Option.exists(revIdem.obligation, o => o.kind === 'walk')).toBe(true)
    }
  })

  it('commutes for flagsXor (not idempotent) and stays Unknown across different operations', () => {
    expect(Verdict.isTrue(Transition.commutes(Toggle, Toggle))).toBe(true)
    expect(Verdict.isUnknown(Transition.idempotent(Toggle))).toBe(true)
    expect(Verdict.isUnknown(Transition.commutes(Grant, Toggle))).toBe(true)
  })

  it('refuses to prove commutes or idempotent when associativity is only unlessRefused', () => {
    expect(Verdict.isUnknown(Transition.commutes(MaybeAssoc, MaybeAssoc))).toBe(true)
    expect(Verdict.isUnknown(Transition.idempotent(MaybeAssoc))).toBe(true)
  })

  it('steps in memory with foreign implementations and preserves combine through lift', () => {
    const stepped = Transition.step(Grant, { granted: 1 }, { bit: 4 }, undefined, {
      foreign: impls,
    })
    expect(Result.isSuccess(stepped) && stepped.success.state.granted === 5).toBe(true)

    const Outer = Schema.Struct({ perms: State })
    const $outer = Path.forSchema(Outer)
    const lifted = Transition.lift($outer.perms, Grant)
    expect(lifted.writes[0]?.way._tag).toBe('combine')
    const liftedStepped = Transition.step(
      lifted,
      { perms: { granted: 1 } },
      { bit: 4 },
      undefined,
      { foreign: impls },
    )
    expect(Result.isSuccess(liftedStepped) && liftedStepped.success.state.perms.granted === 5).toBe(
      true,
    )
  })
})

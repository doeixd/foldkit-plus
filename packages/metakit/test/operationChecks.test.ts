import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Conformance from '../src/conformance.js'
import { Transition } from '../src/index.js'
import * as Machine from '../src/machine.js'
import * as Operation from '../src/operation.js'
import * as Temporal from '../src/temporal.js'

const Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2147483647 }))

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

const flagsClamp = Operation.define({
  id: 'flags.clamp',
  version: 1,
  args: [Flags, Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: { monotone: ['up', 'none', 'none'] },
})

const impls = Operation.implementations(
  'page',
  Operation.implement(flagsOr, (a, b) => a | b),
  Operation.implement(flagsXor, (a, b) => a ^ b),
  Operation.implement(flagsAndNot, (a, b) => a & ~b),
  Operation.implement(flagsClamp, (x, lo, hi) => Math.min(hi, Math.max(lo, x))),
)

describe('checkOperation and lawObligations (Phase 4 bout 4.6)', () => {
  it('passes all valid claims of the permissions domain well under 1s', () => {
    const start = performance.now()
    for (const op of [flagsOr, flagsXor, flagsAndNot, flagsClamp]) {
      const report = Conformance.checkOperation(op, impls)
      expect(report.ok, report.failures.join('\n')).toBe(true)
      expect(report.failures).toEqual([])
      expect(report.calls).toBeGreaterThan(0)
    }
    expect(performance.now() - start).toBeLessThan(1000)
  })

  it('falsifies false claims with exact failure messages', () => {
    const badXor = Operation.define({
      id: 'flags.xor',
      version: 1,
      args: [Flags, Flags],
      returns: Flags,
      nulls: 'strict',
      claims: { idempotent: true },
    })
    const xorReport = Conformance.checkOperation(badXor, impls)
    expect(xorReport.ok).toBe(false)
    expect(xorReport.failures[0]).toMatch(
      /^\[metakit\] flags\.xor@1 claims idempotent, and it does not hold: flags\.xor\(/,
    )

    const badOr = Operation.define({
      id: 'flags.or',
      version: 1,
      args: [Flags, Flags],
      returns: Flags,
      nulls: 'strict',
      claims: { invertible: { inverse: 'self' } },
    })
    expect(Conformance.checkOperation(badOr, impls).ok).toBe(false)

    const badAndNot = Operation.define({
      id: 'flags.andNot',
      version: 1,
      args: [Flags, Flags],
      returns: Flags,
      nulls: 'strict',
      claims: { commutative: true },
    })
    expect(Conformance.checkOperation(badAndNot, impls).ok).toBe(false)
  })

  it('collects reachable obligations from a Machine and discharges them in the registry', () => {
    const State = Schema.Struct({ granted: Flags })
    const Grant = Transition.make({
      state: State,
      input: Schema.Struct({ bit: Flags }),
      apply: ({ state, input }) => [
        Transition.set(state.granted, flagsOr(state.granted, input.bit)),
      ],
    })
    const Toggle = Transition.make({
      state: State,
      input: Schema.Struct({ bit: Flags }),
      apply: ({ state, input }) => [
        Transition.set(state.granted, flagsXor(state.granted, input.bit)),
      ],
    })
    const machine = Machine.make({ state: State, transitions: { Grant, Toggle } })

    const reg = Temporal.makeRegistry()
    const scope = { owner: 'permissions', where: 'operationChecks.test.ts:1' }
    const owed = Conformance.lawObligations(machine, [impls])
    expect(owed.map(o => o.name)).toContain('law:flags.or@1/commutative/page')
    expect(owed.map(o => o.name)).toContain('law:flags.xor@1/invertible/page')
    reg.declare(scope, owed)
    // Open until checked.
    expect(reg.report().ok).toBe(false)

    for (const op of [flagsOr, flagsXor]) {
      const report = Conformance.checkOperation(op, impls)
      for (const d of report.discharges) reg.record(scope, d)
    }
    expect(reg.report().ok).toBe(true)
    expect(reg.report().open).toEqual([])
  })

  it('runs SQL parity runners over recorded calls and reports mismatches', () => {
    const goodPg: Conformance.ParityRunner = {
      dialect: 'postgres',
      evaluate: (_op, calls) => calls.map(([a, b]) => (a as number) | (b as number)),
    }
    const ok = Conformance.checkOperation(flagsOr, impls, { sql: [goodPg] })
    expect(ok.ok).toBe(true)
    expect(ok.discharges.some(d => d.obligation === 'law:flags.or@1/parity/postgres')).toBe(true)

    const badPg: Conformance.ParityRunner = {
      dialect: 'postgres',
      evaluate: (_op, calls) => calls.map(([a, b]) => (a as number) ^ (b as number)),
    }
    const fail = Conformance.checkOperation(flagsOr, impls, { sql: [badPg] })
    expect(fail.ok).toBe(false)
    expect(fail.failures.some(f => f.includes('postgres parity failed'))).toBe(true)
  })
})

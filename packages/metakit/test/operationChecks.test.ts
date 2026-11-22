import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Conformance from '../src/conformance.js'
import { Ord, Transition } from '../src/index.js'
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
      evaluate: (_op, calls) =>
        calls.map(([a, b]) => (a === null || b === null ? null : (a as number) | (b as number))),
    }
    const ok = Conformance.checkOperation(flagsOr, impls, { sql: [goodPg] })
    expect(ok.ok).toBe(true)
    expect(ok.discharges.some(d => d.obligation === 'law:flags.or@1/parity/postgres')).toBe(true)

    const badPg: Conformance.ParityRunner = {
      dialect: 'postgres',
      evaluate: (_op, calls) =>
        calls.map(([a, b]) => (a === null || b === null ? null : (a as number) ^ (b as number))),
    }
    const fail = Conformance.checkOperation(flagsOr, impls, { sql: [badPg] })
    expect(fail.ok).toBe(false)
    expect(fail.failures.some(f => f.includes('postgres parity failed'))).toBe(true)
  })

  it('H2: runs baseline samples for SQL parity even when an operation has no claims', () => {
    const noClaims = Operation.define({
      id: 'flags.noClaims',
      version: 1,
      args: [Flags, Flags],
      returns: Flags,
      nulls: 'strict',
    })
    const localImpls = Operation.implementations(
      'page',
      Operation.implement(noClaims, (a, b) => a & ~b),
    )
    let seenCalls = 0
    const badSql: Conformance.ParityRunner = {
      dialect: 'sqlite',
      evaluate: (_op, calls) => {
        seenCalls = calls.length
        return calls.map(([a, b]) =>
          a === null || b === null ? null : (a as number) | (b as number),
        )
      },
    }
    const report = Conformance.checkOperation(noClaims, localImpls, { sql: [badSql] })
    expect(seenCalls).toBeGreaterThan(0)
    expect(report.ok).toBe(false)
    expect(report.failures.some(f => f.includes('sqlite parity failed'))).toBe(true)
  })

  it('C1 & M1: monotone fails on null/refused in-domain results and non-numeric 0-pair checks; invertible fails when all samples refuse', () => {
    const partialMono = Operation.define({
      id: 'rev.partialMono',
      version: 1,
      args: [Flags],
      returns: Flags,
      nulls: 'strict',
      claims: { monotone: ['up'] },
    })
    const partialImpls = Operation.implementations(
      'page',
      Operation.implement(partialMono, x => (x === 1 ? null : x)),
    )
    const monoReport = Conformance.checkOperation(partialMono, partialImpls)
    expect(monoReport.ok).toBe(false)
    expect(monoReport.failures.some(f => f.includes('monotone'))).toBe(true)

    const alwaysRefuses = Operation.define({
      id: 'rev.alwaysRefuses',
      version: 1,
      args: [Flags, Flags],
      returns: Flags,
      nulls: 'strict',
      claims: { invertible: { inverse: 'self' } },
    })
    const refuseImpls = Operation.implementations(
      'page',
      Operation.implement(alwaysRefuses, () => {
        throw new Error('always fails')
      }),
    )
    const invReport = Conformance.checkOperation(alwaysRefuses, refuseImpls)
    expect(invReport.ok).toBe(false)
    expect(invReport.failures.some(f => f.includes('every forward sample was refused'))).toBe(true)
  })

  it('H3: samples null for nulls: own operations when checking claims', () => {
    const badOwn = Operation.define({
      id: 'rev.badOwnComm',
      version: 1,
      args: [Flags, Flags],
      returns: Flags,
      nulls: 'own',
      claims: { commutative: true },
    })
    // Commutative on numbers, but NOT commutative when one argument is null!
    const badOwnImpls = Operation.implementations(
      'page',
      Operation.implement(badOwn, (a, b) => (a === null ? 1 : b === null ? 2 : a | b)),
    )
    const report = Conformance.checkOperation(badOwn, badOwnImpls)
    expect(report.ok).toBe(false)
    expect(report.failures.some(f => f.includes('commutative'))).toBe(true)
  })

  it('M2: lawObligations collects custom operations inside Transition emit.when', () => {
    const State = Schema.Struct({ granted: Flags })
    const emitGuard = Transition.make({
      state: State,
      input: Schema.Struct({ bit: Flags }),
      apply: ({ state }) => [Transition.set(state.granted, state.granted)],
      emits: ({ state, input }) => [
        Transition.emit(
          'Notify',
          { ok: true },
          { when: Ord.gt(flagsOr(state.granted, input.bit), 0) },
        ),
      ],
    })
    const owed = Conformance.lawObligations(emitGuard, [impls])
    expect(owed.map(o => o.name)).toContain('law:flags.or@1/commutative/page')
  })

  it('L1: associative failure prints (a, b, c) and invertible failure names the inverse operation', () => {
    const badAssoc = Operation.define({
      id: 'rev.badAssoc',
      version: 1,
      args: [Flags, Flags],
      returns: Flags,
      nulls: 'strict',
      claims: { associative: true },
    })
    const assocImpls = Operation.implementations(
      'page',
      Operation.implement(badAssoc, (a, b) =>
        a === 0 && b === 1 ? 2 : a === 1 && b === 2 ? 3 : 0,
      ),
    )
    const assocRep = Conformance.checkOperation(badAssoc, assocImpls)
    expect(assocRep.ok).toBe(false)
    expect(assocRep.failures[0]).toMatch(/rev\.badAssoc\([^,]+, [^,]+, [^,]+\)/)

    const invTarget = Operation.define({
      id: 'rev.invTarget',
      version: 1,
      args: [Flags, Flags],
      returns: Flags,
      nulls: 'strict',
    })
    const fwdOp = Operation.define({
      id: 'rev.fwdOp',
      version: 1,
      args: [Flags, Flags],
      returns: Flags,
      nulls: 'strict',
      claims: { invertible: { inverse: invTarget } },
    })
    const invImpls = Operation.implementations(
      'page',
      Operation.implement(fwdOp, (a, b) => (a + b) & 0x7fffffff),
      Operation.implement(invTarget, (a, b) => a | b),
    )
    const invRep = Conformance.checkOperation(fwdOp, invImpls)
    expect(invRep.ok).toBe(false)
    expect(invRep.failures[0]).toContain('rev.invTarget@1')
  })
})

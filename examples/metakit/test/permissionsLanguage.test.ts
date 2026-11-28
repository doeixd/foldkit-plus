import { Schema } from 'effect'
import { Arr, Expr, Path, Transition } from '@doeixd/metakit'
import * as Language from '@doeixd/metakit/language'
import * as Machine from '@doeixd/metakit/machine'
import { describe, expect, it } from 'vitest'
import {
  Flags,
  flagsAndNot,
  flagsClamp,
  flagsOr,
  flagsXor,
  serverLowerings,
} from '../src/permissions.js'

const PermissionsLanguage = Language.make(
  {
    flags: {
      or: flagsOr,
      xor: flagsXor,
      andNot: flagsAndNot,
      clamp: flagsClamp,
    },
  },
  { lowerings: serverLowerings },
)

const serverImpl = PermissionsLanguage.implement('server', {
  flags: {
    or: (a, b) => a | b,
    xor: (a, b) => a ^ b,
    andNot: (a, b) => a & ~b,
    clamp: (x, lo, hi) => Math.min(Math.max(x, lo), hi),
  },
})

const Role = Schema.Struct({ id: Schema.String, bits: Flags })
type Role = typeof Role.Type

describe('examples/metakit permissions on metakit/language (Phase 9 Bout 9.6)', () => {
  it('validates sqlite and postgres lowerings, describes operations, and collects law obligations', () => {
    expect(PermissionsLanguage.sql('sqlite')).toBe(serverLowerings)
    expect(PermissionsLanguage.sql('postgres')).toBe(serverLowerings)
    expect(PermissionsLanguage.describe().map(d => `${d.id}@${d.version}`)).toEqual([
      'flags.or@1',
      'flags.xor@1',
      'flags.andNot@1',
      'flags.clamp@1',
    ])

    const obligations = PermissionsLanguage.obligations([serverImpl], {
      dialects: ['sqlite', 'postgres'],
    })
    const names = obligations.map(o => o.name)
    expect(names).toContain('law:flags.or@1/commutative/server')
    expect(names).toContain('law:flags.xor@1/invertible/server')
    expect(names).toContain('law:flags.clamp@1/monotone/server')
    expect(names).toContain('law:flags.or@1/parity/postgres')
  })

  it('maintains flags.xor incrementally on delete (invertible) while flags.or rescans on delete, matching full recomputation', () => {
    const Env = Schema.Struct({ roles: Schema.Array(Role) })
    const $env = Path.from(Env)
    const orExpr = Arr.reduce($env.roles, PermissionsLanguage.families.flags.or, r => r.bits)
    const xorExpr = Arr.reduce($env.roles, PermissionsLanguage.families.flags.xor, r => r.bits)

    let rows: Array<Role> = [
      { id: 'r1', bits: 0b0011 },
      { id: 'r2', bits: 0b0110 },
      { id: 'r3', bits: 0b1010 },
    ]

    let maintainedXor = rows.reduce((acc, r) => acc ^ r.bits, 0)
    let maintainedOr = rows.reduce((acc, r) => acc | r.bits, 0)

    const assertMatches = () => {
      expect(maintainedXor).toBe(Expr.evaluate(xorExpr, { roles: rows }, { foreign: serverImpl }))
      expect(maintainedOr).toBe(Expr.evaluate(orExpr, { roles: rows }, { foreign: serverImpl }))
    }
    assertMatches()

    // Insert r4: both update from the delta row alone.
    const r4: Role = { id: 'r4', bits: 0b0100 }
    rows = [...rows, r4]
    maintainedXor = maintainedXor ^ r4.bits
    maintainedOr = maintainedOr | r4.bits
    assertMatches()

    // Delete r2: flags.xor updates via self-inverse; flags.or rescans remaining rows.
    const removed = rows.find(r => r.id === 'r2')!
    rows = rows.filter(r => r.id !== 'r2')
    maintainedXor = maintainedXor ^ removed.bits
    maintainedOr = rows.reduce((acc, r) => acc | r.bits, 0)
    assertMatches()
  })

  it('replicates two permission machines with Grant (flags.or) commuting to identical state', () => {
    const State = Schema.Struct({ granted: Flags })
    const M = Machine.make({
      state: State,
      transitions: {
        Grant: Transition.make({
          state: State,
          input: Schema.Struct({ bit: Flags }),
          apply: ({ state, input }) => [
            Transition.combine(state.granted, PermissionsLanguage.families.flags.or, input.bit),
          ],
        }),
      },
    })

    // Replica A applies Grant(0b001) then Grant(0b100); Replica B applies in reverse order.
    const [a1] = M.update(
      { granted: 0 },
      { _tag: 'Grant', input: { bit: 0b001 } },
      { foreign: serverImpl },
    )
    const [a2] = M.update(a1, { _tag: 'Grant', input: { bit: 0b100 } }, { foreign: serverImpl })

    const [b1] = M.update(
      { granted: 0 },
      { _tag: 'Grant', input: { bit: 0b100 } },
      { foreign: serverImpl },
    )
    const [b2] = M.update(b1, { _tag: 'Grant', input: { bit: 0b001 } }, { foreign: serverImpl })

    expect(a2).toEqual({ granted: 0b101 })
    expect(b2).toEqual(a2)
  })
})

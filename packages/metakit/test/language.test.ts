import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Expr from '../src/expr.js'
import * as Language from '../src/language.js'
import * as Num from '../src/ops/num.js'
import * as Operation from '../src/operation.js'
import * as OperationSql from '../src/operationSql.js'
import * as Path from '../src/path.js'
import * as Transition from '../src/transition.js'

const Mask = Schema.Int

const flagsOr = Operation.define({
  id: 'flags.or',
  version: 1,
  args: [Mask, Mask] as const,
  returns: Mask,
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
  args: [Mask, Mask] as const,
  returns: Mask,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    identity: { value: 0, side: 'both' },
    invertible: { inverse: 'self' },
  },
})

const Permissions = Language.make({
  flags: {
    or: flagsOr,
    xor: flagsXor,
  },
})

describe('metakit/language (Phase 9 Bout 9.1)', () => {
  it('implements families exhaustively and evaluates expressions mixing Num and language operations', () => {
    const State = Schema.Struct({ mask: Mask, extra: Mask })
    const addRole = Transition.make({
      state: State,
      input: Schema.Struct({ grant: Mask }),
      when: () => true,
      apply: ({ state, input }) => [
        Transition.set(
          state.mask,
          Permissions.families.flags.or(state.mask, Num.add(input.grant, 0)),
        ),
      ],
    })

    const serverImpl = Permissions.implement('server', {
      flags: {
        or: (a, b) => a | b,
        xor: (a, b) => a ^ b,
      },
    })

    const stepped = Transition.step(
      addRole,
      { mask: 0b001, extra: 0 },
      { grant: 0b100 },
      undefined,
      { foreign: serverImpl },
    )
    expect(Result.isSuccess(stepped)).toBe(true)
    if (Result.isSuccess(stepped)) {
      expect(stepped.success.state.mask).toBe(0b101)
    }
  })

  it('implementSome allows a page subset and refuses evaluation of an omitted operation with A2 text', () => {
    const Env = Schema.Struct({ a: Mask, b: Mask })
    const P = Path.from(Env)
    const pageImpl = Permissions.implementSome('page', {
      flags: {
        or: (a, b) => a | b,
      },
    })

    expect(
      Expr.evaluate(Permissions.families.flags.or(P.a, P.b), { a: 1, b: 2 }, { foreign: pageImpl }),
    ).toBe(3)
    expect(() =>
      Expr.evaluate(
        Permissions.families.flags.xor(P.a, P.b),
        { a: 1, b: 2 },
        { foreign: pageImpl },
      ),
    ).toThrow(/flags\.xor@1: no implementation was given/)
  })

  it('sql validates dialect lowerings and refuses a missing lowering by name', () => {
    const partial = OperationSql.lowerings(
      OperationSql.lowering(flagsOr, {
        sqlite: (a, b) => OperationSql.piece`(${a} | ${b})`,
        postgres: (a, b) => OperationSql.piece`(${a} | ${b})`,
      }),
    )

    expect(() => Permissions.sql('sqlite', partial)).toThrow(/no sqlite lowering of "flags\.xor@1"/)

    const full = OperationSql.lowerings(
      OperationSql.lowering(flagsOr, {
        sqlite: (a, b) => OperationSql.piece`(${a} | ${b})`,
        postgres: (a, b) => OperationSql.piece`(${a} | ${b})`,
      }),
      OperationSql.lowering(flagsXor, {
        sqlite: (a, b) => OperationSql.piece`((${a} | ${b}) - (${a} & ${b}))`,
        postgres: (a, b) => OperationSql.piece`(${a} # ${b})`,
      }),
    )

    expect(Permissions.sql('sqlite', full)).toBe(full)
    expect(Permissions.sql('postgres', full)).toBe(full)
  })

  it('describe() and obligations() return descriptions and law obligations for every operation', () => {
    const described = Permissions.describe()
    expect(described.map(d => `${d.id}@${d.version}`)).toEqual(['flags.or@1', 'flags.xor@1'])

    const serverImpl = Permissions.implement('server', {
      flags: {
        or: (a, b) => a | b,
        xor: (a, b) => a ^ b,
      },
    })
    const obligations = Permissions.obligations([serverImpl], { dialects: ['sqlite'] })
    const names = obligations.map(o => o.name)
    expect(names).toContain('law:flags.or@1/commutative/server')
    expect(names).toContain('law:flags.xor@1/invertible/server')
    expect(names).toContain('law:flags.or@1/parity/sqlite')
  })
})

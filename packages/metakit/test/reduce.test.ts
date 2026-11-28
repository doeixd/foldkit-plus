import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Conformance from '../src/conformance.js'
import {
  Arr,
  Eq,
  Expr,
  foldProperties,
  foldPropertiesOf,
  Ord,
  Path,
  reduceProperties,
} from '../src/index.js'
import * as Operation from '../src/operation.js'
import { lowering, lowerings, piece } from '../src/operationSql.js'
import * as Relation from '../src/relation.js'
import * as Sql from '../src/sql.js'

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

const flagsAndNot = Operation.define({
  id: 'flags.andNot',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
})

const customSub = Operation.define({
  id: 'custom.sub',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
})

const customAdd = Operation.define({
  id: 'custom.add',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    identity: { value: 0, side: 'both' },
    invertible: { inverse: customSub },
  },
})

const impls = Operation.implementations(
  'reduce',
  Operation.implement(flagsOr, (a, b) => a | b),
  Operation.implement(customAdd, (a, b) => a + b),
  Operation.implement(customSub, (a, b) => a - b),
)

const Role = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  active: Schema.Boolean,
  bits: Schema.NullOr(Flags),
})
const User = Schema.Struct({
  id: Schema.String,
  roles: Schema.Array(Role),
})
const $ = Path.forSchema(User)

describe('Arr.reduce', () => {
  it('evaluates in memory: identity on empty, skips nulls, respects predicate, propagates refusals', () => {
    const allBits = Arr.reduce($.roles, flagsOr, each => each.bits)
    const activeBits = Arr.reduce(
      $.roles,
      flagsOr,
      each => each.bits,
      each => each.active,
    )

    expect(Expr.eval(allBits, { id: 'u1', roles: [] }, { foreign: impls })).toBe(0)
    expect(
      Expr.eval(
        allBits,
        {
          id: 'u1',
          roles: [
            { id: 'r1', userId: 'u1', active: true, bits: 1 },
            { id: 'r2', userId: 'u1', active: false, bits: null },
            { id: 'r3', userId: 'u1', active: false, bits: 4 },
          ],
        },
        { foreign: impls },
      ),
    ).toBe(5)

    expect(
      Expr.eval(
        activeBits,
        {
          id: 'u1',
          roles: [
            { id: 'r1', userId: 'u1', active: true, bits: 2 },
            { id: 'r2', userId: 'u1', active: false, bits: 4 },
          ],
        },
        { foreign: impls },
      ),
    ).toBe(2)

    // Missing implementation refuses even on empty list.
    expect(() => Expr.eval(allBits, { id: 'u1', roles: [] })).toThrow(/flags\.or@1/)

    // Out-of-Schema element value is refused.
    expect(() =>
      Expr.eval(
        allBits,
        { id: 'u1', roles: [{ id: 'r1', userId: 'u1', active: true, bits: -1 }] },
        { foreign: impls },
      ),
    ).toThrow(/outside its Schema/)
  })

  it('refuses at runtime when given an operation without commutative-monoid claims', () => {
    expect(() =>
      Arr.reduce($.roles, flagsAndNot as unknown as typeof flagsOr, each => each.bits),
    ).toThrow(
      '[metakit] Arr.reduce: "flags.andNot@1" does not claim commutative and associative with an identity, so its answer over rows would depend on their order.',
    )
  })

  it('derives foldProperties from the operation claims, matching sum for an invertible addition', () => {
    const addProps = reduceProperties(customAdd.descriptor)
    expect(addProps.identity).toEqual(foldProperties.sum.identity)
    expect(addProps.commutative).toBeDefined()
    expect(addProps.associative?.unlessRefused).toBe(false)
    expect(addProps.invertible).toBeDefined()

    const orExpr = Arr.reduce($.roles, flagsOr, each => each.bits)
    const orProps = orExpr.node._tag === 'Rows' ? foldPropertiesOf(orExpr.node) : undefined
    expect(orProps?.identity).toEqual({ value: 0 })
    expect(orProps?.commutative).toBeDefined()
    expect(orProps?.associative?.unlessRefused).toBe(false)
    expect(orProps?.invertible).toBeUndefined()
  })

  it('lowers Relation.reduce to COALESCE(aggregate, identity) in SQL and refuses dialects without an aggregate lowering', () => {
    const UserRoles = Relation.make('Role.userId', Role)
    const RowEnv = Schema.Struct({ row: User })
    const r = Path.forSchema(RowEnv)
    const effective = Relation.reduce(r.row, UserRoles, flagsOr, each => each.bits)
    const pred = Ord.gt(effective, 0)

    const serverLowerings = lowerings(
      lowering(flagsOr, {
        sqlite: (a, b) => piece`(${a} | ${b})`,
        postgres: (a, b) => piece`(${a} | ${b})`,
        aggregate: { postgres: x => piece`bit_or(${x})` },
      }),
    )

    const pg = Sql.toWhere(pred, {
      dialect: 'postgres',
      table: 'users',
      relations: { 'Role.userId': { table: 'roles', foreignKey: 'user_id' } },
      foreign: serverLowerings,
    })
    expect(Result.isSuccess(pg)).toBe(true)
    if (Result.isSuccess(pg)) {
      expect(pg.success.text).toContain('COALESCE(bit_or("roles"."bits"), $1)')
      expect(pg.success.params).toEqual([0, 0])
    }

    const sqlite = Sql.toWhere(pred, {
      dialect: 'sqlite',
      table: 'users',
      relations: { 'Role.userId': { table: 'roles', foreignKey: 'user_id' } },
      foreign: serverLowerings,
    })
    expect(Result.isFailure(sqlite)).toBe(true)
    if (Result.isFailure(sqlite)) {
      expect(sqlite.failure.reason).toContain(
        'Arr.reduce over "flags.or@1" has no sqlite aggregate',
      )
    }
  })

  it('reaches the reduce operation in lawObligations', () => {
    const expr = Eq.is(
      Arr.reduce($.roles, flagsOr, each => each.bits),
      0,
    )
    const owed = Conformance.lawObligations(expr, [impls])
    expect(owed.map(o => o.name)).toContain('law:flags.or@1/commutative/reduce')
  })
})

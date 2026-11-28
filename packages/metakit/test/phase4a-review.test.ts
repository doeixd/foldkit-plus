import { Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as AbstractCheck from '../src/abstract/check.js'
import { Arr, Eq, Expr, Ord, Path, reduceProperties, Transition } from '../src/index.js'
import * as Node from '../src/node.js'
import * as Operation from '../src/operation.js'
import * as OperationSql from '../src/operationSql.js'
import * as Eval from '../src/ops/eval.js'
import { judgeNode } from '../src/ops/judge.js'
import * as Relation from '../src/relation.js'
import * as Sql from '../src/sql.js'

const Uint31 = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0x7fffffff }))

describe('Phase 4A adversarial review regressions (core & readers)', () => {
  it('C1: monotoneForeignTerm does not prove unrefused when op.result is non-convex (e.g. Schema.Int)', () => {
    const stepOp = Operation.define({
      id: 'rev.stepInt',
      version: 1,
      args: [Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 2 }))],
      returns: Schema.Int,
      nulls: 'strict',
      claims: { monotone: ['up'] },
    })
    const Row = Schema.Struct({
      x: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 2 })),
    })
    const row = Path.forSchema(Row)
    const impls = Operation.implementations(
      'rev',
      Operation.implement(stepOp, x => x),
    )
    const checked = AbstractCheck.checkInvariant(Row, Ord.gt(stepOp(row.x), -1), { foreign: impls })
    // Corners 0 and 2 are integers, but x = 0.5 returns 0.5 which Schema.Int refuses;
    // abstract checker must NOT claim True.
    expect(checked._tag).toBe('Unknown')
  })

  it('C3: strict absorbing rewrite does not collapse Schema.NullOr or Schema.Option operands', () => {
    const flagsOr = Operation.define({
      id: 'rev.flagsOr',
      version: 1,
      args: [Uint31, Uint31],
      returns: Uint31,
      nulls: 'strict',
      claims: {
        commutative: true,
        associative: true,
        absorbing: { value: 0x7fffffff, result: 0x7fffffff, side: 'both' },
      },
    })
    const impls = Operation.implementations(
      'rev',
      Operation.implement(flagsOr, (a, b) => (a | b) >>> 0),
    )

    const NullRow = Schema.Struct({ x: Schema.NullOr(Uint31) })
    const nullPath = Path.forSchema(NullRow)
    const nullExpr = flagsOr(0x7fffffff, nullPath.x)
    const pNull = Expr.residualize(nullExpr, {}, { foreign: impls })
    expect(Expr.eval(pNull, { x: null }, { foreign: impls })).toBe(null)
    expect(Expr.eval(nullExpr, { x: null }, { foreign: impls })).toBe(null)

    const OptRow = Schema.Struct({ x: Schema.Option(Uint31) })
    const optPath = Path.forSchema(OptRow)
    const optExpr = flagsOr(0x7fffffff, optPath.x)
    const pOpt = Expr.residualize(optExpr, {}, { foreign: impls })
    expect(Expr.eval(pOpt, { x: Option.none() }, { foreign: impls })).toBe(null)
  })

  it('H3: applyForeign propagates Refusal arguments even for nulls: own', () => {
    const ownCoalesce = Operation.define({
      id: 'rev.ownCoalesce',
      version: 1,
      args: [Schema.Number],
      returns: Schema.Number,
      nulls: 'own',
    })
    const impls = Operation.implementations(
      'rev',
      Operation.implement(ownCoalesce, x => (x === null ? 0 : x)),
    )
    const refused = new Node.Refusal({
      reason: 'failed',
      at: 'test',
      detail: 'origin refusal',
    })
    const result = Eval.applyForeign(ownCoalesce.descriptor, [refused], impls)
    expect(Node.isRefusal(result)).toBe(true)
    if (Node.isRefusal(result)) {
      expect(result.reason).toBe('failed')
      expect(result.detail).toBe('origin refusal')
    }
  })

  it('H4: monotoneForeignTerm skips nulls: own operations on nullable inputs', () => {
    const ownInc = Operation.define({
      id: 'rev.ownInc',
      version: 1,
      args: [Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 10 }))],
      returns: Schema.Number.check(Schema.isBetween({ minimum: -100, maximum: 100 })),
      nulls: 'own',
      claims: { monotone: ['up'] },
    })
    const Row = Schema.Struct({
      x: Schema.NullOr(Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 10 }))),
    })
    const row = Path.forSchema(Row)
    // Returns -50 for null, violating > -1!
    const impls = Operation.implementations(
      'rev',
      Operation.implement(ownInc, x => (x === null ? -50 : x + 1)),
    )
    const checked = AbstractCheck.checkInvariant(Row, Ord.gt(ownInc(row.x), -1), { foreign: impls })
    expect(checked._tag).toBe('Unknown')
  })

  it('H5: astOfNode treats nested foreign Call results as nullable', () => {
    const maybeNull = Operation.define({
      id: 'rev.maybeNull',
      version: 1,
      args: [Uint31],
      returns: Uint31,
      nulls: 'own',
    })
    const flagsOr = Operation.define({
      id: 'rev.flagsOrNested',
      version: 1,
      args: [Uint31, Uint31],
      returns: Uint31,
      nulls: 'strict',
      claims: {
        absorbing: { value: 0x7fffffff, result: 0x7fffffff, side: 'both' },
      },
    })
    const impls = Operation.implementations(
      'rev',
      Operation.implement(maybeNull, x => (x === 0 ? null : x)),
      Operation.implement(flagsOr, (a, b) => (a | b) >>> 0),
    )
    const Row = Schema.Struct({ x: Uint31 })
    const row = Path.forSchema(Row)
    const expr = flagsOr(0x7fffffff, maybeNull(row.x))
    const p = Expr.residualize(expr, {}, { foreign: impls })
    // When x = 0, maybeNull(0) = null, so flagsOr(0x7fffffff, null) = null.
    expect(Expr.eval(p, { x: 0 }, { foreign: impls })).toBe(null)
  })

  it('H6: idempotent rewrite and judge distinguish op@1 from op@2', () => {
    const opV1 = Operation.define({
      id: 'rev.norm',
      version: 1,
      args: [Uint31],
      returns: Uint31,
      nulls: 'strict',
      claims: { idempotent: true },
    })
    const opV2 = Operation.define({
      id: 'rev.norm',
      version: 2,
      args: [Uint31],
      returns: Uint31,
      nulls: 'strict',
      claims: { idempotent: true },
    })
    const impls = Operation.implementations(
      'rev',
      Operation.implement(opV1, x => x & 0xff),
      Operation.implement(opV2, x => x & 0x0f),
    )
    const Row = Schema.Struct({ x: Uint31 })
    const row = Path.forSchema(Row)
    const nested = opV2(opV1(row.x))
    const p = Expr.residualize(nested, {}, { foreign: impls })
    // Must not collapse opV2(opV1(x)) -> opV1(x): for x = 0xab, opV1=0xab, opV2(opV1)=0x0b.
    expect(Expr.eval(p, { x: 0xab }, { foreign: impls })).toBe(0x0b)
    // Judge must not consider opV1(x) and opV2(x) identical.
    const eq = judgeNode(Eq.is(opV1(row.x), opV2(row.x)).node, {}, impls)
    expect(eq._tag).toBe('Unknown')
  })

  it('H7 & M4: reduce SQL refuses NUL text identity and toUpdate accepts ForeignLowerings', () => {
    const nulStr = Operation.define({
      id: 'rev.nulStr',
      version: 1,
      args: [Schema.String, Schema.String],
      returns: Schema.String,
      nulls: 'strict',
      claims: {
        commutative: true,
        associative: true,
        identity: { value: 'bad\u0000id', side: 'both' },
      },
    })
    const nulLow = OperationSql.lowerings(
      OperationSql.lowering(nulStr, {
        sqlite: (a, b) => OperationSql.piece`(${a} || ${b})`,
        aggregate: {
          sqlite: a => OperationSql.piece`GROUP_CONCAT(${a})`,
        },
      }),
    )
    const Item = Schema.Struct({ id: Schema.String, parentId: Schema.String, s: Schema.String })
    const Parent = Schema.Struct({ id: Schema.String })
    const ParentItems = Relation.make('Item.parentId', Item)
    const RowEnv = Schema.Struct({ row: Parent })
    const r = Path.forSchema(RowEnv)
    const whereBad = Sql.toWhere(
      Eq.is(
        Relation.reduce(r.row, ParentItems, nulStr, item => item.s),
        'x',
      ),
      {
        dialect: 'sqlite',
        table: 'parent',
        relations: { 'Item.parentId': { table: 'items', foreignKey: 'parent_id' } },
        foreign: nulLow,
      },
    )
    expect(Result.isFailure(whereBad)).toBe(true)

    const addOp = Operation.define({
      id: 'rev.addUpd',
      version: 1,
      args: [Uint31, Uint31],
      returns: Uint31,
      nulls: 'strict',
      claims: { commutative: true, associative: true },
    })
    const addLow = OperationSql.lowerings(
      OperationSql.lowering(addOp, {
        sqlite: (a, b) => OperationSql.piece`(${a} | ${b})`,
      }),
    )
    const State = Schema.Struct({ flags: Uint31 })
    const Input = Schema.Struct({ mask: Uint31 })
    const grant = Transition.make({
      state: State,
      input: Input,
      apply: ({ state, input }) => [Transition.combine(state.flags, addOp, input.mask)],
    })
    const upd = Sql.toUpdate('roles', grant, { mask: 4 }, { dialect: 'sqlite', foreign: addLow })
    expect(Result.isSuccess(upd)).toBe(true)
  })

  it('M3: partialRows keeps Arr.reduce open when implementation is missing', () => {
    const missingOp = Operation.define({
      id: 'rev.missingReduce',
      version: 1,
      args: [Uint31, Uint31],
      returns: Uint31,
      nulls: 'strict',
      claims: {
        commutative: true,
        associative: true,
        identity: { value: 0, side: 'both' },
      },
    })
    const Env = Schema.Struct({ items: Schema.Array(Schema.Struct({ n: Uint31 })) })
    const env = Path.forSchema(Env)
    const expr = Arr.reduce(env.items, missingOp, item => item.n)
    const p = Expr.residualize(expr, { items: [{ n: 1 }, { n: 2 }] })
    expect(p.node._tag).not.toBe('Lit')
  })

  it('M5 & L2: Operation.compare ignores claim key order, distinguishes stacked checks, and define validates claims', () => {
    const a = Operation.define({
      id: 'rev.cmp',
      version: 1,
      args: [Uint31, Uint31],
      returns: Uint31,
      nulls: 'strict',
      claims: { commutative: true, associative: true },
    })
    const b = Operation.define({
      id: 'rev.cmp',
      version: 1,
      args: [Uint31, Uint31],
      returns: Uint31,
      nulls: 'strict',
      claims: { associative: true, commutative: true },
    })
    expect(Option.isNone(Operation.compare(Operation.describe(a), Operation.describe(b)))).toBe(
      true,
    )

    const floatRange = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 0x7fffffff }))
    const c = Operation.define({
      id: 'rev.cmp',
      version: 1,
      args: [floatRange, Uint31],
      returns: Uint31,
      nulls: 'strict',
      claims: { commutative: true, associative: true },
    })
    expect(Option.isSome(Operation.compare(Operation.describe(a), Operation.describe(c)))).toBe(
      true,
    )

    // L2: monotone length mismatch throws
    expect(() =>
      Operation.define({
        id: 'rev.badMono',
        version: 1,
        args: [Uint31, Uint31],
        returns: Uint31,
        nulls: 'strict',
        claims: { monotone: ['up'] as unknown as readonly ['up', 'up'] },
      }),
    ).toThrow(/monotone claim/)

    // L2: identity rejected by second argument Schema throws
    expect(() =>
      Operation.define({
        id: 'rev.badId2',
        version: 1,
        args: [Schema.Int, Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))],
        returns: Schema.Int,
        nulls: 'strict',
        claims: { identity: { value: 0, side: 'both' } },
      }),
    ).toThrow(/second argument Schema/)

    // L2: reduceProperties omits identity when side !== 'both'
    const leftIdOp = Operation.define({
      id: 'rev.leftId',
      version: 1,
      args: [Uint31, Uint31],
      returns: Uint31,
      nulls: 'strict',
      claims: { identity: { value: 0, side: 'left' } },
    })
    expect(reduceProperties(leftIdOp.descriptor).identity).toBeUndefined()
  })

  it('M6: operationSql rejects forged SqlPiece holes and duck-typed ForeignLowerings', () => {
    const forgedPiece = {
      [Symbol.for('metakit/operation/sqlPiece')]: true,
      strings: ['', ''],
      holes: [{ raw: '1; DROP TABLE users;--' }],
    } as unknown as OperationSql.SqlPiece
    expect(() => OperationSql.piece`(${forgedPiece})`).toThrow(/SqlPiece/)
    expect(() => OperationSql.renderPiece(forgedPiece, parts => parts.join(''))).toThrow(/SqlPiece/)
    expect(OperationSql.isForeignLowerings({ aggregateForDialect: () => null })).toBe(false)
  })

  it('L3: Transition.commutes checks both opA and opB claims in same-operation', () => {
    const opGood = Operation.define({
      id: 'rev.commCheck',
      version: 1,
      args: [Uint31, Uint31],
      returns: Uint31,
      nulls: 'strict',
      claims: { commutative: true, associative: true },
    })
    const opBad = Operation.define({
      id: 'rev.commCheck',
      version: 1,
      args: [Uint31, Uint31],
      returns: Uint31,
      nulls: 'strict',
    })
    const State = Schema.Struct({ flags: Uint31 })
    const Input = Schema.Struct({ mask: Uint31 })
    const tGood = Transition.make({
      state: State,
      input: Input,
      apply: ({ state, input }) => [Transition.combine(state.flags, opGood, input.mask)],
    })
    const tBad = Transition.make({
      state: State,
      input: Input,
      apply: ({ state, input }) => [Transition.combine(state.flags, opBad, input.mask)],
    })
    expect(Transition.commutes(tGood, tBad)._tag).not.toBe('True')
  })
})

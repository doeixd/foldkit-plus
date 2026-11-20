import { Option, Result, Schema } from 'effect'
import { Eq, Expr, Null, Num, Ord, Path, Transition } from 'metakit'
import * as Graph from 'metakit/graph'
import * as Machine from 'metakit/machine'
import * as Sql from 'metakit/sql'
import { describe, expect, it } from 'vitest'

const Account = Schema.Struct({
  id: Schema.String,
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
  featureFlag: Schema.Boolean,
  discount: Schema.NullOr(Schema.Int),
})

const AccountMachine = Machine.make({
  state: Account,
  transitions: {
    Withdraw: Transition.make({
      state: Account,
      input: Schema.Struct({ amount: Schema.Int }),
      when: ({ state, input }) =>
        Expr.all(
          Eq.is(state.status, 'open'),
          Num.gt(input.amount, 0),
          Num.lte(input.amount, Num.sub(state.balance, state.reserved)),
        ),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Num.sub(state.balance, input.amount)),
      ],
    }),
    Freeze: Transition.make({
      state: Account,
      input: Schema.Struct({}),
      when: ({ state }) => Eq.is(state.status, 'open'),
      apply: ({ state }) => [Transition.set(state.status, 'frozen')],
    }),
    AuditPing: Transition.make({
      state: Account,
      input: Schema.Struct({}),
      apply: () => [],
    }),
  },
})

describe('metakit/graph', () => {
  it('Graph.analyze computes exact affectedBy, deadBindings, and liveModelPaths without duplicates', () => {
    const $ = Path.from(Account)
    const bindings = {
      availableBalance: Num.sub($.balance, $.reserved),
      statusLabel: Expr.match($.status, { open: 'Open', frozen: 'Frozen' }),
      accountId: $.id,
      summary: Expr.when(Eq.is($.status, 'open'), {
        then: Num.sub($.balance, $.reserved),
        else: 0,
      }),
    }

    const analysis = Graph.analyze(AccountMachine, bindings)

    expect(analysis.affectedBy.Withdraw).toEqual(['availableBalance', 'summary'])
    expect(analysis.affectedBy.Freeze).toEqual(['statusLabel', 'summary'])
    expect(analysis.affectedBy.AuditPing).toEqual([])
    expect(analysis.deadBindings).toEqual(['accountId'])

    expect(Option.isSome(analysis.liveModelPaths)).toBe(true)
    if (Option.isSome(analysis.liveModelPaths)) {
      const formatted = analysis.liveModelPaths.value.map(Path.format).sort()
      // Excludes input.amount; includes all model paths read by bindings or transitions
      expect(formatted).toEqual(['balance', 'id', 'reserved', 'status'])
    }
  })

  it('Graph.analyze treats Path.isPrefix overlap symmetrically (parent <-> child) and handles unbounded Opaque conservatively', () => {
    const Nested = Schema.Struct({
      account: Schema.Struct({
        balance: Schema.Int,
        currency: Schema.String,
      }),
      note: Schema.String,
    })

    const NestedMachine = Machine.make({
      state: Nested,
      transitions: {
        ReplaceAccount: Transition.make({
          state: Nested,
          input: Schema.Struct({
            next: Schema.Struct({ balance: Schema.Int, currency: Schema.String }),
          }),
          apply: ({ state, input }) => [Transition.set(state.account, input.next)],
        }),
        BumpBalance: Transition.make({
          state: Nested,
          input: Schema.Struct({ delta: Schema.Int }),
          apply: ({ state, input }) => [
            Transition.set(state.account.balance, Num.add(state.account.balance, input.delta)),
          ],
        }),
        NoOp: Transition.make({
          state: Nested,
          input: Schema.Struct({}),
          apply: () => [],
        }),
      },
    })

    const $ = Path.from(Nested)
    const bindings = {
      childRead: $.account.balance,
      parentRead: $.account,
      unboundedOpaque: Expr.opaque<typeof Nested.Type, number>(
        { name: 'external' },
        m => m.account.balance,
      ),
      staticNote: $.note,
    }

    const analysis = Graph.analyze(NestedMachine, bindings)

    // Writing parent `account` invalidates child `account.balance` AND parent `account` AND unbounded opaque
    expect(analysis.affectedBy.ReplaceAccount).toEqual([
      'childRead',
      'parentRead',
      'unboundedOpaque',
    ])
    // Writing child `account.balance` invalidates BOTH `childRead` AND `parentRead` AND `unboundedOpaque`
    expect(analysis.affectedBy.BumpBalance).toEqual(['childRead', 'parentRead', 'unboundedOpaque'])
    // No-write transition invalidates nothing (not even unbounded opaque)
    expect(analysis.affectedBy.NoOp).toEqual([])
    expect(analysis.deadBindings).toEqual(['staticNote'])
    expect(Option.isNone(analysis.liveModelPaths)).toBe(true)
  })

  it('Graph.pruneStatic folds static branches and shrinks SSR resumePaths while separating null from Unknown', () => {
    const $ = Path.from(Account)
    const bindings = {
      promoAmount: Expr.when($.featureFlag, {
        then: Num.sub($.balance, $.reserved),
        else: 0,
      }),
      hasDiscount: Null.isNotNull($.discount),
      rawDiscount: $.discount,
      liveStatus: $.status,
    }

    // featureFlag = false folds promoAmount -> 0 (dropping balance & reserved from resumePaths)
    // discount = null is a KNOWN null -> folds to staticValues (not liveBindings!)
    // status is omitted -> Unknown -> stays in liveBindings
    const pruned = Graph.pruneStatic(bindings, {
      featureFlag: false,
      discount: null,
    })

    expect(pruned.staticValues).toEqual({
      promoAmount: 0,
      hasDiscount: false,
      rawDiscount: null,
    })
    expect(Object.hasOwn(pruned.staticValues, 'rawDiscount')).toBe(true)
    expect(Object.keys(pruned.liveBindings)).toEqual(['liveStatus'])
    expect(Option.isSome(pruned.resumePaths)).toBe(true)
    if (Option.isSome(pruned.resumePaths)) {
      expect(pruned.resumePaths.value).toEqual([['status']])
    }
  })

  it('Graph.queryReadiness gates cascading queries and short-circuits satisfied branches', () => {
    const CityRow = Schema.Struct({
      id: Schema.String,
      countryId: Schema.String,
      regionId: Schema.String,
    })
    const QueryParams = Schema.Struct({
      all: Schema.Boolean,
      countryId: Schema.String,
      regionId: Schema.String,
    })

    const cascading = Expr.in({ row: CityRow, params: QueryParams }, ({ row, params }) =>
      Expr.all(Eq.is(row.countryId, params.countryId), Eq.is(row.regionId, params.regionId)),
    )

    const r0 = Graph.queryReadiness(cascading, {})
    expect(r0.ready).toBe(false)
    if (!r0.ready && Option.isSome(r0.missing)) {
      expect(r0.missing.value.map(Path.format)).toEqual(['params.countryId', 'params.regionId'])
    }

    const r1 = Graph.queryReadiness(cascading, { params: { countryId: 'US' } })
    expect(r1.ready).toBe(false)
    if (!r1.ready && Option.isSome(r1.missing)) {
      expect(r1.missing.value.map(Path.format)).toEqual(['params.regionId'])
    }

    const r2 = Graph.queryReadiness(cascading, {
      params: { countryId: 'US', regionId: 'CA' },
    })
    expect(r2.ready).toBe(true)
    // Residual is ready to lower straight to SQL WHERE
    const sqlWhere = Sql.toWhere(r2.residual, {
      dialect: 'postgres',
      rowPrefix: ['row'],
    })
    expect(Result.isSuccess(sqlWhere)).toBe(true)
    if (Result.isSuccess(sqlWhere)) {
      expect(sqlWhere.success.text).toContain('countryId')
      expect(sqlWhere.success.params).toEqual(['US', 'CA'])
    }

    // Short-circuited branch: params.all === true satisfies the query even without countryId
    const shortCircuit = Expr.in({ row: CityRow, params: QueryParams }, ({ row, params }) =>
      Expr.any(Eq.is(params.all, true), Eq.is(row.countryId, params.countryId)),
    )
    const rShort = Graph.queryReadiness(shortCircuit, { params: { all: true } })
    expect(rShort.ready).toBe(true)

    // Unbounded Opaque is never ready
    const opaqueQuery = Expr.opaque<{ readonly row: typeof CityRow.Type }, boolean>(
      { name: 'dyn' },
      () => true,
    )
    const rOpaque = Graph.queryReadiness(opaqueQuery, {})
    expect(rOpaque.ready).toBe(false)
    if (!rOpaque.ready) {
      expect(Option.isNone(rOpaque.missing)).toBe(true)
    }
  })

  describe('Graph.queryReadiness and what SQL can lower', () => {
    const Row = Schema.Struct({ id: Schema.String, rank: Schema.Int })
    const Params = Schema.Struct({ floor: Schema.Finite })

    it('is not ready for an opaque term over the row, which has nothing missing and no SQL', () => {
      const custom = Expr.in({ row: Row }, ({ row }) =>
        Expr.opaque({ name: 'custom', reads: [row.id] }, () => true),
      )
      const readiness = Graph.queryReadiness(custom, {})
      expect(readiness).toEqual({
        ready: false,
        missing: Option.some([]),
        unsupported: Option.some('cannot lower opaque term "custom" to SQL'),
        residual: readiness.residual,
      })
      expect(Result.isFailure(Sql.toWhere(custom))).toBe(true)
    })

    it('is not ready where a bound parameter makes the predicate one SQL refuses', () => {
      const above = Expr.in({ row: Row, params: Params }, ({ row, params }) =>
        Ord.gt(row.rank, params.floor),
      )
      const whole = Graph.queryReadiness(above, { params: { floor: 2 } })
      expect(whole.ready).toBe(true)
      const fraction = Graph.queryReadiness(above, { params: { floor: 2.5 } })
      expect(!fraction.ready && fraction.unsupported).toEqual(
        Option.some(
          'a fraction beside an integer column: declare the column a non-integer number, or scale the constant to an integer',
        ),
      )
      expect(Result.isFailure(Sql.toWhere(above, { env: { params: { floor: 2.5 } } }))).toBe(true)
    })

    it('reads every path as a column under an empty row prefix, as the SQL lowering does', () => {
      const bare = Ord.gt(Path.from(Row).rank, 1)
      expect(Graph.queryReadiness(bare, {}, { rowPrefix: [] }).ready).toBe(true)
      expect(Result.getOrThrow(Sql.toWhere(bare, { rowPrefix: [] })).text).toBe('("rank" > $1)')
    })

    it('names what is missing, and nothing unsupported, while a parameter is unbound', () => {
      const above = Expr.in({ row: Row, params: Params }, ({ row, params }) =>
        Ord.gt(row.rank, params.floor),
      )
      const readiness = Graph.queryReadiness(above, {})
      expect(readiness).toEqual({
        ready: false,
        missing: Option.some([['params', 'floor']]),
        unsupported: Option.none(),
        residual: readiness.residual,
      })
    })
  })
})

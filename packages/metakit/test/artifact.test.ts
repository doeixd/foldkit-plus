import { Effect, Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Arr, Bool, Eq, Expr, Null, Num, Ord, Sets, Str, Time } from '../src/index.js'
import * as Artifact from '../src/artifact.js'
import * as Inspect from '../src/inspect.js'
import * as Language from '../src/language.js'
import * as Operation from '../src/operation.js'
import * as OperationSql from '../src/operationSql.js'
import * as Prove from '../src/prove.js'
import * as Sql from '../src/sql.js'
import * as Transition from '../src/transition.js'

const Item = Schema.Struct({
  sku: Schema.String,
  qty: Schema.Int,
  tags: Schema.Array(Schema.String),
})

const Order = Schema.Struct({
  id: Schema.String,
  total: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['draft', 'open', 'closed']),
  note: Schema.NullOr(Schema.String),
  items: Schema.Array(Item),
})

const Actor = Schema.Struct({
  role: Schema.Literals(['viewer', 'admin']),
  limit: Schema.Int,
})

const ApplyFee = Operation.define({
  id: 'billing.applyFee',
  version: 1,
  args: [Schema.Int, Schema.Int] as const,
  returns: Schema.Int,
  nulls: 'strict',
  claims: { total: true },
})

const BillingLang = Language.make({
  billing: { applyFee: ApplyFee },
})

const billingImpls = BillingLang.implement('billing-js', {
  billing: {
    applyFee: (amount, bps) => amount + Math.trunc((amount * bps) / 10000),
  },
})

const billingSql = OperationSql.lowerings(
  OperationSql.lowering(ApplyFee, {
    postgres: (a, b) => OperationSql.piece`(${a} + ((${a} * ${b}) / 10000))`,
    sqlite: (a, b) => OperationSql.piece`(${a} + ((${a} * ${b}) / 10000))`,
  }),
)

describe('metakit/artifact (#645 P0)', () => {
  it('round-trips core ops, If, Match, nested Rows, and foreign ops identically', async () => {
    const reg = await Effect.runPromise(Artifact.registry(BillingLang))

    const expr = Expr.in({ order: Order, actor: Actor }, ({ order, actor }) =>
      Bool.and(
        Ord.lte(ApplyFee(order.total, 250), actor.limit),
        Bool.and(
          Expr.matchOrElse(
            order.status,
            {
              draft: Bool.not(Null.isNull(order.note)),
              open: Ord.gte(order.total, order.reserved),
            },
            false,
          ),
          Arr.every(order.items, item =>
            Bool.and(
              Ord.gt(item.qty, 0),
              Arr.any(order.items, other => Eq.is(other.sku, item.sku)),
            ),
          ),
        ),
      ),
    )

    const encoded = await Effect.runPromise(Artifact.encodeExpr(expr))
    expect(encoded.codecVersion).toBe(Artifact.CODEC_VERSION)
    expect(
      encoded.requiredOps.some(op => op._tag === 'Foreign' && op.id === 'billing.applyFee'),
    ).toBe(true)

    // Survives JSON wire serialization cleanly.
    const wire: unknown = JSON.parse(JSON.stringify(encoded))
    const decoded = await Effect.runPromise(
      Artifact.decodeExpr(wire, {
        env: { order: Order, actor: Actor },
        result: Schema.Boolean,
        registry: reg,
      }),
    )

    const samples = [
      {
        order: {
          id: 'o1',
          total: 1000,
          reserved: 400,
          status: 'open' as const,
          note: null,
          items: [{ sku: 'A', qty: 2, tags: ['x'] }],
        },
        actor: { role: 'admin' as const, limit: 2000 },
      },
      {
        order: {
          id: 'o2',
          total: 1000,
          reserved: 400,
          status: 'draft' as const,
          note: null,
          items: [{ sku: 'A', qty: 2, tags: [] }],
        },
        actor: { role: 'admin' as const, limit: 2000 },
      },
      {
        order: {
          id: 'o3',
          total: 3000,
          reserved: 100,
          status: 'open' as const,
          note: 'ok',
          items: [{ sku: 'A', qty: 0, tags: [] }],
        },
        actor: { role: 'viewer' as const, limit: 5000 },
      },
    ]

    for (const env of samples) {
      expect(Expr.evaluate(decoded, env, { foreign: billingImpls })).toEqual(
        Expr.evaluate(expr, env, { foreign: billingImpls }),
      )
    }
  })

  it('rejects Opaque nodes and non-portable literals on encode', async () => {
    const opaqueExpr = Expr.opaque({ name: 'secretFn' }, () => true)
    const err1 = await Effect.runPromise(Effect.flip(Artifact.encodeExpr(opaqueExpr)))
    expect(err1._tag).toBe('UnsupportedNodeError')

    const nanExpr = Expr.in({ actor: Actor }, ({ actor }) => Num.add(actor.limit, Number.NaN))
    const err2 = await Effect.runPromise(Effect.flip(Artifact.encodeExpr(nanExpr)))
    expect(err2._tag).toBe('UnsupportedNodeError')

    const negZeroExpr = Expr.in({ actor: Actor }, ({ actor }) => Num.add(actor.limit, -0))
    const err3 = await Effect.runPromise(Effect.flip(Artifact.encodeExpr(negZeroExpr)))
    expect(err3._tag).toBe('UnsupportedNodeError')
  })

  it('rejects conflicting operation registrations in registry', async () => {
    const ConflictingFee = Operation.define({
      id: 'billing.applyFee',
      version: 1,
      args: [Schema.Int] as const,
      returns: Schema.Int,
      nulls: 'strict',
    })
    const err = await Effect.runPromise(Effect.flip(Artifact.registry(ApplyFee, ConflictingFee)))
    expect(err._tag).toBe('DuplicateOperationError')
    expect(err.op).toBe('billing.applyFee@1')

    // Re-registering the same operation is idempotent.
    const ok = await Effect.runPromise(Artifact.registry(ApplyFee, BillingLang))
    expect(Option.isSome(ok.resolve('billing.applyFee', 1))).toBe(true)
  })

  it('enforces codecVersion, schema shape, allowlist, scope, arity, type, and limits on decode', async () => {
    const reg = await Effect.runPromise(Artifact.registry(BillingLang))

    // 1. Unsupported codecVersion
    const badVersion = await Effect.runPromise(
      Effect.flip(
        Artifact.decodeForSchema(
          { codecVersion: 99, node: { _tag: 'Lit', value: true }, requiredOps: [] },
          { schema: Actor, result: Schema.Boolean },
        ),
      ),
    )
    expect(badVersion._tag).toBe('ArtifactDecodeError')
    if (badVersion._tag === 'ArtifactDecodeError') expect(badVersion.phase).toBe('version')

    // 2. Allowlist blocks foreign ops when { foreign: [] }
    const feeExpr = Expr.in({ order: Order }, ({ order }) => Ord.gt(ApplyFee(order.total, 100), 0))
    const encodedFee = await Effect.runPromise(Artifact.encodeExpr(feeExpr))
    const blocked = await Effect.runPromise(
      Effect.flip(
        Artifact.decodeExpr(encodedFee, {
          env: { order: Order },
          result: Schema.Boolean,
          registry: reg,
          allowlist: { foreign: [] },
        }),
      ),
    )
    expect(blocked._tag).toBe('UnknownOperationError')

    // 3. Unregistered foreign op fails with UnknownOperationError
    const unreg = await Effect.runPromise(
      Effect.flip(
        Artifact.decodeExpr(encodedFee, {
          env: { order: Order },
          result: Schema.Boolean,
        }),
      ),
    )
    expect(unreg._tag).toBe('UnknownOperationError')

    // 4. Out-of-scope path rejected
    const badPath = await Effect.runPromise(
      Effect.flip(
        Artifact.decodeForSchema(
          {
            codecVersion: 1,
            node: { _tag: 'Path', segments: ['nonExistentField'] },
            requiredOps: [],
          },
          { schema: Actor, result: Schema.Int },
        ),
      ),
    )
    expect(badPath._tag).toBe('ArtifactDecodeError')
    if (badPath._tag === 'ArtifactDecodeError') expect(badPath.phase).toBe('scope')

    // 5. Wrong arity rejected
    const badArity = await Effect.runPromise(
      Effect.flip(
        Artifact.decodeForSchema(
          {
            codecVersion: 1,
            node: {
              _tag: 'Call',
              op: { _tag: 'Core', id: 'num.add' },
              args: [{ _tag: 'Lit', value: 1 }],
            },
            requiredOps: [],
          },
          { schema: Actor, result: Schema.Number },
        ),
      ),
    )
    expect(badArity._tag).toBe('ArtifactDecodeError')
    if (badArity._tag === 'ArtifactDecodeError') expect(badArity.phase).toBe('arity')

    // 6. Result type mismatch rejected (never fabricates Expr<Env, Boolean> from string)
    const badType = await Effect.runPromise(
      Effect.flip(
        Artifact.decodeForSchema(
          {
            codecVersion: 1,
            node: { _tag: 'Lit', value: 'hello' },
            requiredOps: [],
          },
          { schema: Actor, result: Schema.Boolean },
        ),
      ),
    )
    expect(badType._tag).toBe('ArtifactDecodeError')
    if (badType._tag === 'ArtifactDecodeError') expect(badType.phase).toBe('type')

    // 7. Depth & node limits enforced on both encode and decode
    let deep = Expr.in({ actor: Actor }, ({ actor }) => actor.limit)
    for (let i = 0; i < 8; i++) deep = Num.add(deep, 1)
    const tooDeepEncode = await Effect.runPromise(
      Effect.flip(Artifact.encodeExpr(deep, { limits: { maxDepth: 4 } })),
    )
    expect(tooDeepEncode._tag).toBe('ArtifactLimitError')

    const encodedDeep = await Effect.runPromise(Artifact.encodeExpr(deep))
    const tooSmallDecode = await Effect.runPromise(
      Effect.flip(
        Artifact.decodeExpr(encodedDeep, {
          env: { actor: Actor },
          result: Schema.Number,
          limits: { maxNodes: 5 },
        }),
      ),
    )
    expect(tooSmallDecode._tag).toBe('ArtifactLimitError')
  })

  it('differential round-trip over generated expression trees agrees with reference evaluator', async () => {
    const Row = Schema.Struct({
      a: Schema.Int,
      b: Schema.Int,
      flag: Schema.Boolean,
      name: Schema.String,
      tags: Schema.Array(Schema.String),
    })

    const expressions: ReadonlyArray<Expr.Expr<{ readonly row: typeof Row.Type }, unknown>> = [
      Expr.in({ row: Row }, ({ row }) => Num.add(Num.mul(row.a, 2), Num.neg(row.b))),
      Expr.in({ row: Row }, ({ row }) =>
        Expr.when(row.flag, { then: Str.len(Str.trim(row.name)), else: Num.sub(row.a, row.b) }),
      ),
      Expr.in({ row: Row }, ({ row }) =>
        Bool.or(Sets.subset(row.tags, ['a', 'b']), Ord.gte(Arr.count(row.tags), 2)),
      ),
    ]

    const envs = [
      { row: { a: 10, b: 3, flag: true, name: '  hi  ', tags: ['a'] } },
      { row: { a: -5, b: 7, flag: false, name: '', tags: ['a', 'b', 'c'] } },
      { row: { a: 0, b: 0, flag: true, name: 'x', tags: [] } },
    ]

    for (const expr of expressions) {
      const encoded = await Effect.runPromise(Artifact.encodeExpr(expr))
      const wire: unknown = JSON.parse(JSON.stringify(encoded))
      const decoded = await Effect.runPromise(
        Artifact.decodeExpr(wire, {
          env: { row: Row },
          result: Schema.Unknown,
        }),
      )
      for (const env of envs) {
        expect(Expr.evaluate(decoded, env)).toEqual(Expr.evaluate(expr, env))
      }
    }
  })

  it('vertical slice: inventory reservation rule reused across JS, SQL, Tier 3, Z3, and Inspect', async () => {
    const Inventory = Schema.Struct({
      sku: Schema.String.annotate({ title: 'SKU' }),
      stock: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      reserved: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    }).pipe(
      Expr.refine($ => Ord.lte($.reserved, $.stock), {
        message: 'reserved cannot exceed stock',
      }),
    )

    const reg = await Effect.runPromise(Artifact.registry(BillingLang))

    // Guarded write + invariant rule built once and round-tripped through portable artifact.
    const guardRule = Expr.in({ state: Inventory, amount: Schema.Int }, ({ state, amount }) =>
      Bool.and(Ord.gt(amount, 0), Ord.lte(Num.add(state.reserved, amount), state.stock)),
    )
    const encodedGuard = await Effect.runPromise(Artifact.encodeExpr(guardRule))
    const decodedGuard = await Effect.runPromise(
      Artifact.decodeExpr(JSON.parse(JSON.stringify(encodedGuard)), {
        env: { state: Inventory, amount: Schema.Int },
        result: Schema.Boolean,
        registry: reg,
      }),
    )

    // 1. JS execution via Transition
    const Reserve = Transition.make({
      state: Inventory,
      input: Schema.Struct({ amount: Schema.Int }),
      when: ({ state, input }) =>
        Bool.and(
          Ord.gt(input.amount, 0),
          Ord.lte(Num.add(state.reserved, input.amount), state.stock),
        ),
      apply: ({ state, input }) => [
        Transition.set(state.reserved, Num.add(state.reserved, input.amount)),
      ],
    })
    expect(
      Expr.evaluate(decodedGuard, {
        state: { sku: 'W-1', stock: 10, reserved: 4 },
        amount: 6,
      }),
    ).toBe(true)
    expect(
      Expr.evaluate(decodedGuard, {
        state: { sku: 'W-1', stock: 10, reserved: 4 },
        amount: 7,
      }),
    ).toBe(false)

    // 2. SQL lowering (both core invariant and foreign op lowering)
    const checkSql = Result.getOrThrow(Sql.toCheck(Inventory, { dialect: 'postgres' }))
    expect(checkSql).toContain('"reserved" <= "stock"')

    const feeCheck = Expr.in({ state: Inventory }, ({ state }) =>
      Ord.gte(ApplyFee(state.stock, 100), 0),
    )
    const decodedFee = await Effect.runPromise(
      Artifact.decodeExpr(
        JSON.parse(JSON.stringify(await Effect.runPromise(Artifact.encodeExpr(feeCheck)))),
        {
          env: { state: Inventory },
          result: Schema.Boolean,
          registry: reg,
        },
      ),
    )
    const loweredFee = Sql.toWhere(decodedFee, {
      dialect: 'postgres',
      rowPrefix: ['state'],
      foreign: billingSql,
    })
    expect(Result.isSuccess(loweredFee)).toBe(true)

    // 3. Tier 3 static checking & Z3 proof of Reserve preserving Inventory invariant
    const invExpr = Expr.refinementsOf(Inventory)[0]!
    const tier3 = Abstract.checkInvariant(Inventory, invExpr)
    expect(tier3._tag).toBe('True')
    const proof = await Effect.runPromise(Prove.transition(Inventory, Reserve))
    expect(proof._tag).toBe('True')

    // 4. Agent-readable JSON Schema description
    const specs = Inspect.fieldSpecs(Inventory)
    const skuSpec = specs.find(s => s.name === 'sku')
    expect(skuSpec !== undefined && Option.getOrUndefined(skuSpec.title)).toBe('SKU')
  }, 30_000)
})

describe('metakit/artifact & language (#645 P1)', () => {
  it('computes deterministic fingerprints that alpha-normalize binders without conflating order', async () => {
    const Row = Schema.Struct({
      a: Schema.Int,
      b: Schema.Int,
      c: Schema.Int,
      items: Schema.Array(Schema.Struct({ qty: Schema.Int })),
    })

    const e1 = Expr.in({ row: Row }, ({ row }) => Num.add(Num.add(row.a, row.b), row.c))
    const e2 = Expr.in({ row: Row }, ({ row }) => Num.add(row.a, Num.add(row.b, row.c)))
    const e3 = Expr.in({ row: Row }, ({ row }) => Num.sub(row.a, row.b))
    const e4 = Expr.in({ row: Row }, ({ row }) => Num.sub(row.b, row.a))

    const [fp1, fp1Again, fp2, fp3, fp4] = await Effect.runPromise(
      Effect.all([
        Artifact.fingerprint(e1),
        Artifact.fingerprint(e1),
        Artifact.fingerprint(e2),
        Artifact.fingerprint(e3),
        Artifact.fingerprint(e4),
      ]),
    )
    expect(fp1).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(fp1).toBe(fp1Again)
    // Never reassociates or reorders numeric ops.
    expect(fp1).not.toBe(fp2)
    expect(fp3).not.toBe(fp4)

    // Alpha-equivalent Rows binder names produce the same fingerprint.
    const a1: Artifact.PortableArtifactV1 = {
      codecVersion: 1,
      node: {
        _tag: 'Rows',
        fold: 'every',
        over: { _tag: 'List', list: { _tag: 'Path', segments: ['row', 'items'] } },
        where: {
          _tag: 'Call',
          op: { _tag: 'Core', id: 'ord.gt' },
          args: [
            { _tag: 'Path', segments: ['x', 'qty'] },
            { _tag: 'Lit', value: 0 },
          ],
        },
        set: [],
        each: 'x',
      },
      requiredOps: [{ _tag: 'Core', id: 'ord.gt' }],
    }
    const a2: Artifact.PortableArtifactV1 = {
      codecVersion: 1,
      node: {
        _tag: 'Rows',
        fold: 'every',
        over: { _tag: 'List', list: { _tag: 'Path', segments: ['row', 'items'] } },
        where: {
          _tag: 'Call',
          op: { _tag: 'Core', id: 'ord.gt' },
          args: [
            { _tag: 'Path', segments: ['y', 'qty'] },
            { _tag: 'Lit', value: 0 },
          ],
        },
        set: [],
        each: 'y',
      },
      requiredOps: [{ _tag: 'Core', id: 'ord.gt' }],
    }
    const [fpA1, fpA2] = await Effect.runPromise(
      Effect.all([Artifact.fingerprint(a1), Artifact.fingerprint(a2)]),
    )
    expect(fpA1).toBe(fpA2)
  })

  it('separates EvidenceKey by reader, profile, foreign identity, and returns none for anonymous closures', async () => {
    const expr = Expr.in({ actor: Actor }, ({ actor }) => Ord.gte(actor.limit, 0))
    const fp = await Effect.runPromise(Artifact.fingerprint(expr))

    const kPg = await Effect.runPromise(
      Artifact.evidenceKey({
        fingerprint: fp,
        reader: { id: 'metakit/sql', version: '0.1.0' },
        profile: 'postgres',
        foreignIdentities: { 'billing.applyFee@1': Option.some('sql-v1') },
      }),
    )
    const kSqlite = await Effect.runPromise(
      Artifact.evidenceKey({
        fingerprint: fp,
        reader: { id: 'metakit/sql', version: '0.1.0' },
        profile: 'sqlite',
        foreignIdentities: { 'billing.applyFee@1': Option.some('sql-v1') },
      }),
    )
    const kUnidentified = await Effect.runPromise(
      Artifact.evidenceKey({
        fingerprint: fp,
        reader: { id: 'metakit/js', version: '0.1.0' },
        foreignIdentities: { 'billing.applyFee@1': Option.none() },
      }),
    )

    expect(Option.isSome(kPg)).toBe(true)
    expect(Option.isSome(kSqlite)).toBe(true)
    expect(Option.getOrUndefined(kPg)).not.toBe(Option.getOrUndefined(kSqlite))
    expect(Option.isNone(kUnidentified)).toBe(true)
  })

  it('composes and restricts Languages with conflict checks and reports target readiness', async () => {
    const Discount = Operation.define({
      id: 'billing.discount',
      version: 1,
      args: [Schema.Int, Schema.Int] as const,
      returns: Schema.Int,
      nulls: 'strict',
    })
    const DiscountLang = Language.make({
      billing: { discount: Discount },
    })

    // Compose merges ops inside the shared `billing` family.
    const Combined = await Effect.runPromise(Language.compose(BillingLang, DiscountLang))
    expect(Combined.operations).toHaveLength(2)
    expect(Combined.families.billing.applyFee).toBe(ApplyFee)
    expect(Combined.families.billing.discount).toBe(Discount)

    // Conflicting definition in same slot fails with LanguageConflictError.
    const BadFee = Operation.define({
      id: 'billing.applyFee',
      version: 2,
      args: [Schema.Int] as const,
      returns: Schema.Int,
      nulls: 'strict',
    })
    const ConflictLang = Language.make({ billing: { applyFee: BadFee } })
    const conflict = await Effect.runPromise(
      Effect.flip(Language.compose(BillingLang, ConflictLang)),
    )
    expect(conflict._tag).toBe('LanguageConflictError')

    // Restrict derives a smaller host vocabulary.
    const BrowserLang = Language.restrict(Combined, { billing: ['applyFee'] })
    expect(BrowserLang.operations).toHaveLength(1)
    expect(BrowserLang.families.billing.applyFee).toBe(ApplyFee)

    // Readiness checks distinguish portable vs target support.
    const feeExpr = Expr.in({ order: Order }, ({ order }) => Ord.gt(ApplyFee(order.total, 100), 0))
    const rJsMissing = await Effect.runPromise(Language.readiness(feeExpr, { _tag: 'js' }))
    expect(rJsMissing.portable).toBe(true)
    expect(rJsMissing.supported).toBe(false)
    expect(rJsMissing.requiredForeignOps).toEqual(['billing.applyFee@1'])
    expect(rJsMissing.unsupportedNodes[0]?.kind).toBe('missing-foreign')

    const rJsReady = await Effect.runPromise(
      Language.readiness(feeExpr, { _tag: 'js', foreign: billingImpls }),
    )
    expect(rJsReady.supported).toBe(true)

    const rSqlReady = await Effect.runPromise(
      Language.readiness(feeExpr, { _tag: 'sql', dialect: 'postgres', lowerings: billingSql }),
    )
    expect(rSqlReady.supported).toBe(true)

    const rZ3 = await Effect.runPromise(Language.readiness(feeExpr, { _tag: 'z3' }))
    expect(rZ3.portable).toBe(true)
    expect(rZ3.supported).toBe(false)

    const opaqueExpr = Expr.opaque({ name: 'hostClock' }, () => true)
    const rOpaqueJs = await Effect.runPromise(Language.readiness(opaqueExpr, { _tag: 'js' }))
    expect(rOpaqueJs.portable).toBe(false)
    expect(rOpaqueJs.supported).toBe(true)
    const rOpaqueSql = await Effect.runPromise(
      Language.readiness(opaqueExpr, { _tag: 'sql', dialect: 'postgres' }),
    )
    expect(rOpaqueSql.portable).toBe(false)
    expect(rOpaqueSql.supported).toBe(false)
    expect(rOpaqueSql.unsupportedNodes[0]?.kind).toBe('opaque')
  })

  it('hardens decode (requiredOps, mixed If, -0, __proto__, compatibleOps) and Language checks (compose, readiness)', async () => {
    // 1. Forged requiredOps rejected
    const forged = await Effect.runPromise(
      Effect.flip(
        Artifact.decodeForSchema(
          {
            codecVersion: 1,
            node: {
              _tag: 'Call',
              op: { _tag: 'Core', id: 'num.add' },
              args: [
                { _tag: 'Lit', value: 1 },
                { _tag: 'Lit', value: 2 },
              ],
            },
            requiredOps: [],
          },
          { schema: Actor, result: Schema.Number },
        ),
      ),
    )
    expect(forged._tag).toBe('ArtifactDecodeError')
    if (forged._tag === 'ArtifactDecodeError') expect(forged.path).toBe('$.requiredOps')

    // 2. Mixed-kind If rejected against single-kind result Schema
    const mixedIf = await Effect.runPromise(
      Effect.flip(
        Artifact.decodeForSchema(
          {
            codecVersion: 1,
            node: {
              _tag: 'If',
              cond: { _tag: 'Lit', value: true },
              then: { _tag: 'Lit', value: 'hello' },
              otherwise: { _tag: 'Lit', value: 1 },
            },
            requiredOps: [],
          },
          { schema: Actor, result: Schema.Boolean },
        ),
      ),
    )
    expect(mixedIf._tag).toBe('ArtifactDecodeError')
    if (mixedIf._tag === 'ArtifactDecodeError') expect(mixedIf.phase).toBe('type')

    // 3. -0 rejected on decode
    const negZero = await Effect.runPromise(
      Effect.flip(
        Artifact.decodeForSchema(
          {
            codecVersion: 1,
            node: { _tag: 'Lit', value: -0 },
            requiredOps: [],
          },
          { schema: Actor, result: Schema.Number },
        ),
      ),
    )
    expect(negZero._tag).toBe('ArtifactDecodeError')

    // 4. __proto__ literal key preserved without mutating prototype
    const protoExpr = Expr.in({ actor: Actor }, () =>
      Expr.lit(JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>),
    )
    const encodedProto = await Effect.runPromise(Artifact.encodeExpr(protoExpr))
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
    expect(
      Object.hasOwn((encodedProto.node as { value: Record<string, unknown> }).value, '__proto__'),
    ).toBe(true)

    // 5. compatibleOps rejects same id@version with same arity but different arg Schema
    const StringFee = Operation.define({
      id: 'billing.applyFee',
      version: 1,
      args: [Schema.String, Schema.Int] as const,
      returns: Schema.Int,
      nulls: 'strict',
      claims: { total: true },
    })
    const dupErr = await Effect.runPromise(Effect.flip(Artifact.registry(ApplyFee, StringFee)))
    expect(dupErr._tag).toBe('DuplicateOperationError')

    // 6. Language.compose returns LanguageConflictError when same op appears in two different slots
    const AliasLang = Language.make({ billing: { applyFeeAlias: ApplyFee } })
    const dupSlot = await Effect.runPromise(Effect.flip(Language.compose(BillingLang, AliasLang)))
    expect(dupSlot._tag).toBe('LanguageConflictError')

    // 7. Language.readiness reports unsupported-node for SQL set.union / Rows over List and Z3 time.addMonths
    const setUnionExpr = Expr.in({ tags: Schema.Array(Schema.String) }, ({ tags }) =>
      Sets.union(tags, ['c']),
    )
    const rSqlSet = await Effect.runPromise(
      Language.readiness(setUnionExpr, { _tag: 'sql', dialect: 'postgres' }),
    )
    expect(rSqlSet.supported).toBe(false)
    expect(rSqlSet.unsupportedNodes.some(u => u.kind === 'unsupported-node')).toBe(true)

    const listRowsExpr = Expr.in({ order: Order }, ({ order }) =>
      Arr.any(order.items, item => Ord.gt(item.qty, 0)),
    )
    const rSqlRows = await Effect.runPromise(
      Language.readiness(listRowsExpr, { _tag: 'sql', dialect: 'postgres' }),
    )
    expect(rSqlRows.supported).toBe(false)
    expect(rSqlRows.unsupportedNodes.some(u => u.kind === 'unsupported-node')).toBe(true)

    const timeExpr = Expr.in({ d: Schema.Int }, ({ d }) => Time.addMonths(d, 1))
    const rZ3Time = await Effect.runPromise(Language.readiness(timeExpr, { _tag: 'z3' }))
    expect(rZ3Time.supported).toBe(false)
    expect(rZ3Time.unsupportedNodes.some(u => u.kind === 'unsupported-node')).toBe(true)
  })
})

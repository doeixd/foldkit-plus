/**
 * Example 5: Feature-Flag & Rollout Custom Language
 *
 * Exercises:
 * - `Operation.define` + `Language.make`
 * - `OperationSql.lowering` (Postgres + SQLite scalar & aggregate SQL)
 * - `Conformance.checkOperation` (algebraic claim verification)
 * - `Arr.reduce` over a custom commutative-monoid op in JS and SQL
 * - `Expr.residualize` & `Expr.judge` with `{ foreign }`
 */
import { Schema } from 'effect'
import { Arr, Bool, Eq, Expr, Num } from '@doeixd/metakit'
import { Text } from '@doeixd/metakit/domain'
import * as Language from '@doeixd/metakit/language'
import * as Operation from '@doeixd/metakit/operation'
import { lowering, lowerings, piece } from '@doeixd/metakit/operation/sql'
import * as Relation from '@doeixd/metakit/relation'

export const Bucket = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99 }))
export const Priority = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))

/** Deterministic 0..99 rollout bucket from `(userId, salt)`. */
export const bucket = Operation.define({
  id: 'rollout.bucket',
  version: 1,
  args: [Text.schema, Text.schema],
  returns: Bucket,
  nulls: 'strict',
  claims: { total: true },
})

/** Semver comparison `version >= minVersion` (major.minor.patch). */
export const semverGte = Operation.define({
  id: 'rollout.semverGte',
  version: 1,
  args: [Text.schema, Text.schema],
  returns: Schema.Boolean,
  nulls: 'strict',
  claims: { total: true },
})

/** Commutative monoid `max(a, b)` over `0..100` for combining rule priorities via `Arr.reduce`. */
export const maxPriority = Operation.define({
  id: 'rollout.maxPriority',
  version: 1,
  args: [Priority, Priority],
  returns: Priority,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    idempotent: true,
    identity: { value: 0, side: 'both' },
    absorbing: { value: 100, result: 100, side: 'both' },
    monotone: ['up', 'up'],
  },
})

const hashBucket = (userId: string, salt: string): number => {
  let h = 2166136261
  const text = `${salt}:${userId}`
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 100
}

const parseSemver = (v: string): readonly [number, number, number] => {
  const [maj = 0, min = 0, pat = 0] = v.split('.').map(n => Number.parseInt(n, 10) || 0)
  return [maj, min, pat]
}

const compareSemverGte = (a: string, b: string): boolean => {
  const [aMaj, aMin, aPat] = parseSemver(a)
  const [bMaj, bMin, bPat] = parseSemver(b)
  if (aMaj !== bMaj) return aMaj > bMaj
  if (aMin !== bMin) return aMin > bMin
  return aPat >= bPat
}

export const RolloutLanguage = Language.make({
  rollout: { bucket, semverGte, maxPriority },
})

export const rolloutImpl = RolloutLanguage.implement('edge', {
  rollout: {
    bucket: hashBucket,
    semverGte: compareSemverGte,
    maxPriority: (a, b) => Math.max(a, b),
  },
})

const rolloutLowerings = lowerings(
  lowering(bucket, {
    postgres: (userId, salt) => piece`abs(hashtext(${salt} || ':' || ${userId})) % 100`,
    sqlite: (userId, salt) => piece`(unicode(${userId}) + unicode(${salt})) % 100`,
  }),
  lowering(semverGte, {
    postgres: (v, min) => piece`(${v} >= ${min})`,
    sqlite: (v, min) => piece`(${v} >= ${min})`,
  }),
  lowering(maxPriority, {
    postgres: (a, b) => piece`GREATEST(${a}, ${b})`,
    sqlite: (a, b) => piece`max(${a}, ${b})`,
    aggregate: {
      postgres: v => piece`MAX(${v})`,
      sqlite: v => piece`MAX(${v})`,
    },
  }),
)

export const rolloutPgSql = RolloutLanguage.sql('postgres', rolloutLowerings)
export const rolloutSqliteSql = RolloutLanguage.sql('sqlite', rolloutLowerings)

export const FlagRule = Schema.Struct({
  id: Schema.String,
  flagKey: Schema.String,
  enabled: Schema.Boolean,
  priority: Priority,
})

export const FeatureFlag = Schema.Struct({
  key: Text.schema,
  salt: Text.schema,
  percent: Bucket,
  minAppVersion: Text.schema,
  env: Schema.Literals(['dev', 'staging', 'prod']),
})

export const FlagRules = Relation.make('FlagRule.flagKey', FlagRule)

export const TargetContext = Schema.Struct({
  userId: Text.schema,
  appVersion: Text.schema,
  env: Schema.Literals(['dev', 'staging', 'prod']),
})

/** Targeting expression evaluated at the edge or lowered to SQL. */
export const flagActiveFor = Expr.in({ row: FeatureFlag, ctx: TargetContext }, ({ row, ctx }) =>
  Expr.all(
    Eq.is(row.env, ctx.env),
    semverGte(ctx.appVersion, row.minAppVersion),
    Num.lt(bucket(ctx.userId, row.salt), row.percent),
  ),
)

/** Highest enabled rule priority for a flag via `Relation.reduce` + custom `maxPriority`. */
export const highestRulePriority = Expr.in({ row: FeatureFlag }, ({ row }) =>
  Relation.reduce(
    row,
    FlagRules,
    maxPriority,
    rule => rule.priority,
    rule => rule.enabled,
  ),
)

/** In-memory highest priority over a list of rules via `Arr.reduce`. */
export const listMaxPriority = Expr.in({ rules: Schema.Array(FlagRule) }, ({ rules }) =>
  Arr.reduce(
    rules,
    maxPriority,
    rule => rule.priority,
    rule => Bool.and(rule.enabled, Num.gt(rule.priority, 0)),
  ),
)

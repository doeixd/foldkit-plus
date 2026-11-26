import { Schema } from 'effect'
import { Arr, Expr, Num } from 'metakit'

const Capability = Schema.Literals(['sharding'])

export const DatabaseBuild = Schema.Struct({ shards: Schema.Literals([1, 2, 4, 8]) })
export const databaseDefaults = Schema.decodeUnknownSync(DatabaseBuild)({ shards: 1 })
export const databaseBuildRules = Expr.in(
  { build: DatabaseBuild, unlocks: Schema.Array(Capability) },
  ({ build, unlocks }) => Expr.all(Num.gt(build.shards, 1), Arr.has(unlocks, 'sharding')),
)

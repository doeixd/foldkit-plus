/**
 * Example 2 (module 1 of 3): Tech Tree & Build-Order Catalog Schemas
 *
 * Exercises:
 * - Generic `SchemaOf` helper (#642) without `any` or casts
 * - `title` and `description` annotations both before and after `Expr.refine` (#639)
 */
import { Schema } from 'effect'
import { Arr, Expr, Num, Str, type SchemaOf } from 'metakit'

export const NonEmptyId = Schema.String.annotate({
  title: 'Identifier',
  description: 'Unique non-empty slug',
}).pipe(Expr.refine($ => Num.gt(Str.len($), 0), { message: 'id must not be empty' }))

export const Era = Schema.Struct({
  ordinal: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
    title: 'Era Ordinal',
    description: '1-based progression tier',
  }),
  name: NonEmptyId.pipe(
    Schema.annotate({ title: 'Era Name', description: 'Display title for the era' }),
  ),
})

export const ResearchNode = Schema.Struct({
  id: NonEmptyId,
  era: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
    title: 'Required Era',
    description: 'Era ordinal in which this research unlocks',
  }),
  prereqId: Schema.NullOr(NonEmptyId).annotate({
    title: 'Prerequisite Research',
    description: 'Optional research id that must be completed first',
  }),
  cost: Schema.Int.check(Schema.isGreaterThan(0)).annotate({
    title: 'Science Cost',
    description: 'Science points required to complete research',
  }),
})

export const Building = Schema.Struct({
  id: NonEmptyId,
  tiers: Schema.Array(
    Schema.Struct({
      level: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
      cost: Schema.Int.check(Schema.isGreaterThan(0)).annotate({ title: 'Upgrade Cost' }),
    }),
  ).annotate({ title: 'Upgrade Tiers', description: 'Ordered upgrade levels for the building' }),
})

export const CatalogBase = Schema.Struct({
  eras: Schema.Array(Era).annotate({ title: 'Eras', description: 'Ordered progression eras' }),
  research: Schema.Array(ResearchNode).annotate({
    title: 'Research Tree',
    description: 'Unlockable technologies',
  }),
  buildings: Schema.Array(Building).annotate({
    title: 'Buildings',
    description: 'Constructible structures and upgrade tiers',
  }),
}).annotate({ title: 'Game Catalog', description: 'Validated progression ruleset' })

/** Generic table helper constrained with `SchemaOf` (#642): composes and decodes with zero casts. */
export function defineTable<S extends SchemaOf>(name: string, row: S) {
  const Table = Schema.Struct({
    table: Schema.Literal(name),
    rows: Schema.Array(row),
  }).pipe(Expr.refine($ => Num.gt(Arr.count($.rows), 0), { message: `${name} must not be empty` }))

  return {
    schema: Table,
    decode: (input: unknown) => Schema.decodeUnknownSync(Table)(input),
  }
}

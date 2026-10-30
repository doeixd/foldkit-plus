/**
 * Variants (#357): an Entity whose rows are one of several cases, stored as one
 * row with `_tag` and a nullable column per case field. `Expr.is` compiles to
 * `_tag = case` and what is asked of the case, so an interpreter runs it with
 * the operations it has; these cases pin that a row of another case is false
 * under `Expr.is`, while the stored column is null there and unknown under a
 * comparison.
 */
import { Schema } from 'effect'
import { Entity, Expr, Order, Query } from '../index.js'
import type { ConformanceCase } from './index.js'

/** `cents` is shared by `Priced` and `Held`, so one nullable column serves two cases. */
const Cents = Schema.Int

export const Variant = Entity.defineVariants('Variant', {
  Priced: { id: Schema.String, label: Schema.String, cents: Cents },
  Free: { id: Schema.String, label: Schema.String },
  Held: { id: Schema.String, label: Schema.String, cents: Cents, until: Schema.String },
})

/** A stored row: every field of every case, null where the row is of another. */
export interface VariantRow {
  readonly _tag: 'Priced' | 'Free' | 'Held'
  readonly id: string
  readonly label: string
  readonly cents: number | null
  readonly until: string | null
  readonly [key: string]: unknown
}

export const variantRows: ReadonlyArray<VariantRow> = [
  { _tag: 'Priced', id: 'p1', label: 'Mug', cents: 500, until: null },
  { _tag: 'Priced', id: 'p2', label: 'Lamp', cents: 1500, until: null },
  { _tag: 'Free', id: 'f1', label: 'Sticker', cents: null, until: null },
  { _tag: 'Held', id: 'h1', label: 'Chair', cents: 900, until: '2026-02-01' },
]

const from = Query.from(Variant)
const byId = Query.orderBy(Order.asc(Variant.fields.id))
const cheapPriced = Expr.is(Variant, 'Priced', ({ cents }) => Expr.lt(cents, 1000))

export const variantCases: ReadonlyArray<ConformanceCase> = [
  {
    what: 'is matches the rows of a case',
    body: from.pipe(Query.where(Expr.is(Variant, 'Priced')), byId),
    input: {},
    expected: ['p1', 'p2'],
  },
  {
    what: 'is asks of the case’s fields',
    body: from.pipe(Query.where(cheapPriced), byId),
    input: {},
    expected: ['p1'],
  },
  {
    what: 'not of is holds on every other case, which is false and never unknown',
    body: from.pipe(Query.where(Expr.not(cheapPriced)), byId),
    input: {},
    expected: ['f1', 'h1', 'p2'],
  },
  {
    what: 'a stored case field is null on another case, so a comparison drops that row',
    body: from.pipe(Query.where(Expr.lt(Variant.fields.cents, 1000)), byId),
    input: {},
    expected: ['h1', 'p1'],
  },
  {
    what: 'and so does its not',
    body: from.pipe(Query.where(Expr.not(Expr.lt(Variant.fields.cents, 1000))), byId),
    input: {},
    expected: ['p2'],
  },
  {
    what: 'a case field is never null within its case',
    body: from.pipe(
      Query.where(Expr.is(Variant, 'Priced', ({ cents }) => Expr.isNull(cents))),
      byId,
    ),
    input: {},
    expected: [],
  },
  {
    what: 'a field of one case is read within it',
    body: from.pipe(
      Query.where(Expr.is(Variant, 'Held', ({ until }) => Expr.eq(until, '2026-02-01'))),
      byId,
    ),
    input: {},
    expected: ['h1'],
  },
  {
    what: 'several cases are an in over _tag',
    body: from.pipe(Query.where(Expr.in(Variant.fields._tag, ['Free', 'Held'])), byId),
    input: {},
    expected: ['f1', 'h1'],
  },
  {
    what: 'cases combine under or',
    body: from.pipe(
      Query.where(
        Expr.or(
          Expr.is(Variant, 'Free'),
          Expr.is(Variant, 'Priced', ({ cents }) => Expr.gt(cents, 1000)),
        ),
      ),
      byId,
    ),
    input: {},
    expected: ['f1', 'p2'],
  },
]

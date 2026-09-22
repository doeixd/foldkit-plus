/**
 * Which space a body is evaluated in, and why getting it wrong is quiet.
 *
 * local-execution-DESIGN §9.2. A store holds **encoded** values — wire shapes,
 * decoded at read — while a `QueryRef`'s input and a body's literals are
 * written in **domain** terms. Anything that runs a body over stored rows has
 * to reconcile the two, and until the conformance suite gained a column whose
 * two forms differ, nothing could tell whether it had.
 *
 * The part worth a test of its own is the failure mode rather than the success:
 * passing a decoded value is **not uniformly detectable**. Here it matches
 * nothing. Through `foldkit-remote-drizzle` the same mistake raises SQLite's
 * `datatype mismatch`. An empty result that reads exactly like a correct one is
 * the worse of the two, and it is the one the reference interpreter gives — so
 * the encoding has to be right at the boundary, not caught downstream.
 */
import { Schema, SchemaGetter } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, Order, Query, evaluate, type Row } from '../src/index.js'

const Timestamp = Schema.Date.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.transform((iso: string) => new Date(iso)),
    encode: SchemaGetter.transform((at: Date) => at.toISOString()),
  }),
)

const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, at: Timestamp }))

/** As a store holds them: encoded. */
const rows: ReadonlyArray<Row> = [
  { id: 'a', at: '2026-01-01T00:00:00.000Z' },
  { id: 'b', at: '2026-01-02T00:00:00.000Z' },
]

const at = Expr.input('at', Timestamp)
const byAt = Query.from(Post).pipe(
  Query.where(Expr.eq(Post.fields.at, at)),
  Query.orderBy(Order.asc(Post.fields.id)),
)

const ids = (input: Record<string, unknown>) =>
  evaluate(byAt, input, rows).map(row => (row as { id: string }).id)

describe('A body is evaluated in the space the rows are in', () => {
  it('matches when the input is encoded, as a store’s rows are', () => {
    expect(ids({ at: '2026-01-02T00:00:00.000Z' })).toEqual(['b'])
  })

  it('matches nothing when the input is decoded, and says nothing about it', () => {
    // The trap: a `Date` is simply not equal to the string beside it, so there
    // is no error to notice — only an answer that is wrong and looks fine.
    expect(ids({ at: new Date('2026-01-02T00:00:00.000Z') })).toEqual([])
  })

  it('is the same mistake with a literal, which is written in domain terms too', () => {
    const decodedLiteral = Query.from(Post).pipe(
      Query.where(Expr.eq(Post.fields.at, new Date('2026-01-02T00:00:00.000Z'))),
      Query.orderBy(Order.asc(Post.fields.id)),
    )
    const encodedLiteral = Query.from(Post).pipe(
      Query.where(Expr.eq(Post.fields.at, '2026-01-02T00:00:00.000Z' as never)),
      Query.orderBy(Order.asc(Post.fields.id)),
    )

    expect(evaluate(decodedLiteral, {}, rows)).toEqual([])
    expect(evaluate(encodedLiteral, {}, rows).map(r => (r as { id: string }).id)).toEqual(['b'])
  })

  it('leaves the columns whose two forms are the same indistinguishable, which is the point', () => {
    // A string column encodes to itself, so no test over one can tell whether
    // an interpreter respects the distinction. That is why the conformance
    // fixture grew a column whose forms differ.
    const Plain = Entity.define('Plain', Schema.Struct({ id: Schema.String }))
    const byId = Query.from(Plain).pipe(
      Query.where(Expr.eq(Plain.fields.id, Expr.input('id', Schema.String))),
    )

    expect(evaluate(byId, { id: 'a' }, rows)).toHaveLength(1)
  })
})

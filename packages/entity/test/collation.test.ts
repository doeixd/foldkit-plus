/**
 * How text orders when a query says so, and whether a client can match the
 * server's order: `Collation`, the reference evaluator's comparison, and
 * `Query.placement`.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Collation, Entity, Expr, Order, Query, evaluate } from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, name: Schema.String, rank: Schema.Number }),
)
const Named = Item.pipe(Entity.annotateMembers({ name: Collation.of(Collation.asciiFold) }))

/** A character past U+FFFF, and one just below it, built rather than written. */
const astral = String.fromCodePoint(0x1f600)
const high = String.fromCodePoint(0xfffd)

const ids = (body: ReturnType<typeof Query.from>, rows: ReadonlyArray<Record<string, unknown>>) =>
  evaluate(body, {}, rows).map(row => row.id)

describe('the reference evaluator orders text as a byte-ordered backend does', () => {
  it('by code point, putting a character past U+FFFF after U+FFFD', () => {
    const rows = [
      { id: 'a', name: astral, rank: 1 },
      { id: 'b', name: high, rank: 1 },
    ]
    const byName = Query.from(Item).pipe(
      Query.orderBy(Order.asc(Item.fields.name, { collation: Collation.binary })),
    )
    // JavaScript's `<` compares the first UTF-16 unit, 0xD83D, and would put it first.
    expect(ids(byName, rows)).toEqual(['b', 'a'])
  })

  it('with ASCII folded, and no other letter, under asciiFold', () => {
    const rows = [
      { id: 'a', name: 'B', rank: 1 },
      { id: 'b', name: 'a', rank: 1 },
      { id: 'c', name: 'É', rank: 1 },
      { id: 'd', name: 'e', rank: 1 },
    ]
    const byName = Query.from(Named).pipe(Query.orderBy(Order.asc(Named.fields.name)))
    // Folded, 'B' is 'b', after 'a'; by code point alone it would come first.
    // 'É' does not fold, and sorts after every ASCII letter.
    expect(ids(byName, rows)).toEqual(['b', 'a', 'd', 'c'])
  })

  it('refuses a locale collation, which only its backend has', () => {
    const byName = Query.from(Item).pipe(
      Query.orderBy(Order.asc(Item.fields.name, { collation: Collation.locale('en-US') })),
    )
    const rows = [
      { id: 'a', name: 'x', rank: 1 },
      { id: 'b', name: 'y', rank: 1 },
    ]
    expect(() => ids(byName, rows)).toThrow(/locale collation/)
  })
})

describe('a collation is the field’s, unless a term says otherwise', () => {
  it('is read from the field’s metadata, and an id is binary by default', () => {
    expect(Order.asc(Named.fields.name).collation).toEqual(Option.some(Collation.asciiFold))
    expect(Order.asc(Item.fields.name).collation).toEqual(Option.none())
    expect(Order.asc(Item.fields.id).collation).toEqual(Option.some(Collation.binary))
  })

  it('is overridden by the term', () => {
    expect(Order.asc(Named.fields.name, { collation: Collation.binary }).collation).toEqual(
      Option.some(Collation.binary),
    )
  })

  it('names a locale only in a collation name’s characters', () => {
    expect(Collation.locale('en_US.utf8')).toEqual({ _tag: 'Locale', locale: 'en_US.utf8' })
    expect(() => Collation.locale('C" ; drop table x; --')).toThrow(/not a collation name/)
  })
})

describe('Query.placement says whether a client can order as the server does', () => {
  const sort = Expr.input(
    'sort',
    Schema.NullOr(
      Schema.Struct({
        by: Schema.Literals(['name', 'rank']),
        direction: Schema.Literals(['asc', 'desc']),
      }),
    ),
  )
  const placement = (body: ReturnType<typeof Query.from>, input = {}) =>
    Query.placement(body, input)._tag

  it('is placeable over numbers, and over text with a portable collation', () => {
    expect(placement(Query.from(Item).pipe(Query.orderBy(Order.asc(Item.fields.rank))))).toBe(
      'Placeable',
    )
    expect(placement(Query.from(Named).pipe(Query.orderBy(Order.asc(Named.fields.name))))).toBe(
      'Placeable',
    )
    // The id the order ends on is binary, so it never stands in the way.
    expect(placement(Query.from(Item).pipe(Query.orderBy(Order.desc(Item.fields.id))))).toBe(
      'Placeable',
    )
  })

  it('is not over text with no collation, or a locale one, or with no order at all', () => {
    expect(
      Query.placement(Query.from(Item).pipe(Query.orderBy(Order.asc(Item.fields.name))), {}),
    ).toEqual({
      _tag: 'NotPlaceable',
      reason: 'it orders by Item.name, text with no declared collation',
    })
    expect(
      placement(
        Query.from(Item).pipe(
          Query.orderBy(Order.asc(Item.fields.name, { collation: Collation.locale('en-US') })),
        ),
      ),
    ).toBe('NotPlaceable')
    expect(placement(Query.from(Item))).toBe('NotPlaceable')
  })

  it('is judged for the order the input chose', () => {
    const chosen = Query.from(Item).pipe(
      Query.orderBy(Order.chosen(sort, { name: Item.fields.name, rank: Item.fields.rank })),
    )
    expect(placement(chosen, { sort: { by: 'rank', direction: 'asc' } })).toBe('Placeable')
    expect(placement(chosen, { sort: { by: 'name', direction: 'asc' } })).toBe('NotPlaceable')
  })
})

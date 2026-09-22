/**
 * A query body run against the rows the client already holds.
 *
 * local-execution-DESIGN phase 3. Two claims, and the first is the one that
 * makes the second worth anything:
 *
 * 1. **It agrees with the conformance suite.** The same 27 cases the four
 *    interpreters are checked against, run over rows written into a store
 *    rather than rows in an array or a table. A body means one thing.
 * 2. **It refuses what it cannot judge**, rather than answering anyway — §9.1's
 *    partial rows, and §9.2's encoding, which no runtime error would catch.
 */
import { Schema, SchemaGetter } from 'effect'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Subject, cases, rows, type ConformanceCase } from 'foldkit-entity/conformance'
import { describe, expect, it } from 'vitest'
import {
  Query,
  emptyStore,
  entityKey,
  matching,
  tombstone,
  writeEntity,
  type EntityStore,
} from '../src/index.js'

/** The conformance rows, as a store holds them: encoded values, by key. */
const conformanceStore = (): EntityStore =>
  rows.reduce<EntityStore>(
    (store, row) => writeEntity(store, entityKey('Subject', row.id), { ...row }),
    emptyStore,
  )

/** A descriptor around one conformance body, since `matching` takes a descriptor. */
const descriptorFor = (
  body: ConformanceCase['body'],
  input: Readonly<Record<string, unknown>>,
) => ({
  ...Query.make('Case', {
    Input: Object.fromEntries(Object.keys(input).map(key => [key, Schema.Unknown])),
    Result: Query.connection(Subject),
  }),
  body,
})

describe('It agrees with the conformance suite, over a store', () => {
  it.each(cases.map((one): ConformanceCase & { name: string } => ({ ...one, name: one.what })))(
    '$name',
    ({ body, input, expected }: ConformanceCase) => {
      const judged = matching(conformanceStore(), descriptorFor(body, input) as never, input)

      expect(judged.matched).toEqual(expected.map(id => entityKey('Subject', id)))
      expect(judged.skipped).toEqual([])
    },
  )
})

// A domain of its own for the refusals, so they are not tangled with the suite.
const Doc = DomainEntity.define(
  'Doc',
  Schema.Struct({ id: Schema.String, title: Schema.String, rank: Schema.Number }),
)
const ByTitle = Query.define('ByTitle', { title: Schema.String }, ({ input }) =>
  Query.from(Doc).pipe(
    Query.where(Expr.eq(Doc.fields.title, input.title)),
    Query.orderBy(Order.asc(Doc.fields.id)),
  ),
)
const key = (id: string) => entityKey('Doc', id)

describe('What it will not judge', () => {
  it('skips a row missing a field the body reads, rather than calling it a non-match', () => {
    // `b` was fetched for a list that never asked for `title`. Whether it
    // matches is unknown, and "unknown" is not "no".
    let store = writeEntity(emptyStore, key('a'), { id: 'a', title: 'Intro', rank: 1 })
    store = writeEntity(store, key('b'), { id: 'b', rank: 2 })

    const judged = matching(store, ByTitle, { title: 'Intro' })

    expect(judged.matched).toEqual([key('a')])
    expect(judged.skipped).toEqual([key('b')])
  })

  it('skips a row missing a field only the ordering reads', () => {
    const ByRank = Query.define('ByRank', { title: Schema.String }, ({ input }) =>
      Query.from(Doc).pipe(
        Query.where(Expr.eq(Doc.fields.title, input.title)),
        Query.orderBy(Order.asc(Doc.fields.rank)),
      ),
    )
    let store = writeEntity(emptyStore, key('a'), { id: 'a', title: 'Intro', rank: 1 })
    store = writeEntity(store, key('b'), { id: 'b', title: 'Intro' })

    const judged = matching(store, ByRank, { title: 'Intro' })

    expect(judged.matched).toEqual([key('a')])
    expect(judged.skipped).toEqual([key('b')])
  })

  it('never needs `id` fetched, because the key is the id', () => {
    // Nothing wrote `id` as a field here, and the body orders by it.
    const store = writeEntity(emptyStore, key('a'), { title: 'Intro', rank: 1 })

    const judged = matching(store, ByTitle, { title: 'Intro' })

    expect(judged.matched).toEqual([key('a')])
    expect(judged.skipped).toEqual([])
  })

  it('is not fooled by an id containing the separator', () => {
    // Two ids that are identical up to the first colon, so anything that reads
    // the id by splitting on colons sees one value for both and cannot order
    // them. `ByTitle` orders by id, so the order is what catches it.
    let store = writeEntity(emptyStore, key('a:z'), { title: 'Intro' })
    store = writeEntity(store, key('a:b'), { title: 'Intro' })

    expect(matching(store, ByTitle, { title: 'Intro' }).matched).toEqual([key('a:b'), key('a:z')])
  })

  it('treats a tombstone as no row at all, neither matched nor skipped', () => {
    let store = writeEntity(emptyStore, key('a'), { id: 'a', title: 'Intro', rank: 1 })
    store = tombstone(store, key('a'))

    const judged = matching(store, ByTitle, { title: 'Intro' })

    expect(judged.matched).toEqual([])
    expect(judged.skipped).toEqual([])
  })

  it('ignores rows of other entities sharing the store', () => {
    let store = writeEntity(emptyStore, key('a'), { id: 'a', title: 'Intro', rank: 1 })
    store = writeEntity(store, entityKey('Other', 'a'), { title: 'Intro' })

    expect(matching(store, ByTitle, { title: 'Intro' }).matched).toEqual([key('a')])
  })

  it('judges only the keys it is given, when it is given some', () => {
    // `among` is how a caller narrows to a connection's own edges rather than
    // every row of the Entity the store happens to hold.
    let store = writeEntity(emptyStore, key('a'), { title: 'Intro' })
    store = writeEntity(store, key('b'), { title: 'Intro' })

    expect(matching(store, ByTitle, { title: 'Intro' }, { among: [key('b')] }).matched).toEqual([
      key('b'),
    ])
  })

  it('ignores a key of another entity handed to it in `among`', () => {
    // The caller narrows the population; it does not get to widen it to rows
    // the body was never about. A `Other:a` that happens to have a `title` is
    // not a `Doc`.
    let store = writeEntity(emptyStore, key('a'), { title: 'Intro' })
    store = writeEntity(store, entityKey('Other', 'a'), { title: 'Intro' })

    const judged = matching(
      store,
      ByTitle,
      { title: 'Intro' },
      {
        among: [key('a'), entityKey('Other', 'a')],
      },
    )

    expect(judged.matched).toEqual([key('a')])
    expect(judged.skipped).toEqual([])
  })

  it('skips a key in `among` that the store does not hold', () => {
    // An earlier version dropped this silently, reasoning that `skipped` meant
    // "held but not judgeable" and this was never held at all. That is the
    // wrong reading: `skipped` is what a caller must not treat as answered, and
    // both cases are the same from where it stands — *I could not tell you
    // about this one*. Dropping it lets an answer built from the result claim
    // to have considered a row it never saw.
    const store = writeEntity(emptyStore, key('a'), { title: 'Intro' })

    const judged = matching(
      store,
      ByTitle,
      { title: 'Intro' },
      {
        among: [key('a'), key('gone')],
      },
    )

    expect(judged.matched).toEqual([key('a')])
    expect(judged.skipped).toEqual([key('gone')])
  })

  it('refuses a descriptor with no body, by name', () => {
    const declared = Query.make('Declared', {
      Input: { title: Schema.String },
      Result: Query.connection(Doc),
    })

    expect(() => matching(emptyStore, declared, { title: 'x' })).toThrow(
      'query "Declared" carries no body',
    )
  })
})

describe('An id the store holds is the id, and the key is only a fallback', () => {
  // `Entity.ref` stringifies ids, so a numeric id is `7` in the store and `"7"`
  // in the key. Overwriting the encoded value with the key's makes `eq(id, 7)`
  // false and sorts ids lexicographically — both without any error.
  const Ticket = DomainEntity.define(
    'Ticket',
    Schema.Struct({ id: Schema.Number, title: Schema.String }),
  )
  const numbered = (id: number) => entityKey('Ticket', String(id))

  const ById = Query.define('ById', { id: Schema.Number }, ({ input }) =>
    Query.from(Ticket).pipe(
      Query.where(Expr.eq(Ticket.fields.id, input.id)),
      Query.orderBy(Order.asc(Ticket.fields.id)),
    ),
  )
  const Every = Query.define('EveryTicket', {}, () =>
    Query.from(Ticket).pipe(Query.orderBy(Order.asc(Ticket.fields.id))),
  )

  const tickets = (): EntityStore =>
    [2, 9, 10, 100].reduce<EntityStore>(
      (store, id) => writeEntity(store, numbered(id), { id, title: `T${id}` }),
      emptyStore,
    )

  it('matches a numeric id against the number the request gave', () => {
    expect(matching(tickets(), ById, { id: 10 }).matched).toEqual([numbered(10)])
  })

  it('orders numeric ids as numbers, not as text', () => {
    // Lexicographically this is 10, 100, 2, 9.
    expect(matching(tickets(), Every, {}).matched).toEqual([2, 9, 10, 100].map(numbered))
  })

  it('still supplies an id from the key when the store never fetched one', () => {
    const store = writeEntity(emptyStore, key('a'), { title: 'Intro' })

    expect(matching(store, ByTitle, { title: 'Intro' }).matched).toEqual([key('a')])
  })
})

describe('Which space the comparison happens in', () => {
  // §9.2: the store holds encoded values; an application writes decoded ones.
  // Nothing at runtime catches the mismatch — the answer is simply empty — so
  // `matching` encodes the input itself rather than trusting its caller.
  const Timestamp = Schema.Date.pipe(
    Schema.encodeTo(Schema.String, {
      decode: SchemaGetter.transform((iso: string) => new Date(iso)),
      encode: SchemaGetter.transform((at: Date) => at.toISOString()),
    }),
  )
  const Event = DomainEntity.define('Event', Schema.Struct({ id: Schema.String, at: Timestamp }))
  const At = Query.define('At', { at: Timestamp }, ({ input }) =>
    Query.from(Event).pipe(
      Query.where(Expr.eq(Event.fields.at, input.at)),
      Query.orderBy(Order.asc(Event.fields.id)),
    ),
  )

  it('takes the input decoded, as an application writes it, and matches anyway', () => {
    const store = writeEntity(emptyStore, entityKey('Event', 'a'), {
      at: '2026-01-02T00:00:00.000Z',
    })

    const judged = matching(store, At, { at: new Date('2026-01-02T00:00:00.000Z') })

    expect(judged.matched).toEqual([entityKey('Event', 'a')])
  })
})

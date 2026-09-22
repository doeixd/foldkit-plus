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

  it('says nothing about a key in `among` that the store does not hold', () => {
    // Not skipped: skipped means "held but not judgeable", and this was never
    // held at all. Conflating the two would make `skipped` mean two things.
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
    expect(judged.skipped).toEqual([])
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

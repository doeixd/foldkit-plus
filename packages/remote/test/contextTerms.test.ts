/**
 * A list body over the write's context, judged by the client: `Expr.viewer`
 * reads `Remote.make`'s `viewer`, and `Expr.now`, which the client has no
 * reading of for a list, leaves the row to the server. ops-2-context-terms-DESIGN.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order, QueryEvaluateError } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, entityKey, matching, writeEntity, emptyStore } from '../src/index.js'

const User = DomainEntity.define('User', Schema.Struct({ id: Schema.String }))
const Note = DomainEntity.define(
  'Note',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, dueAt: Schema.Number }),
)
const Card = DomainEntity.select(Note, { id: true, ownerId: true })

const Mine = Query.define('Mine', {}, () =>
  Query.from(Note).pipe(
    Query.where(Expr.eq(Note.fields.ownerId, Expr.viewer(User))),
    Query.orderBy(Order.asc(Note.fields.id)),
  ),
)
const Due = Query.define('Due', {}, () =>
  Query.from(Note).pipe(
    Query.where(Expr.lte(Note.fields.dueAt, Expr.now)),
    Query.orderBy(Order.asc(Note.fields.id)),
  ),
)

const Model = Schema.Struct({ remote: Remote.Model, me: Schema.String })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Note],
  queries: [Mine, Due],
  viewer: model => Option.some(Remote.ref(User, model.me)),
})

const key = (id: string) => entityKey('Note', id)
const notes = [
  { id: 'n1', ownerId: 'ada', dueAt: 1 },
  { id: 'n2', ownerId: 'bo', dueAt: 1 },
  { id: 'n3', ownerId: 'ada', dueAt: 1 },
]

/** `query`'s list holding `n1`, every note read, and `id` inserted live at its head. */
const inserted = (query: typeof Mine | typeof Due, id: string): ReadonlyArray<string> => {
  const list = Data.query(query, {}, { select: Card, first: 25 })
  const merged = Data.reduce(
    { remote: Remote.initial, me: 'ada' },
    {
      _tag: 'ConnectionMerged',
      connection: list.ref.identity,
      page: {
        edges: [{ key: key('n1'), ref: { entity: 'Note', id: 'n1' } }],
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      },
    },
  )
  const read: Model = Data.reduce(merged, {
    _tag: 'ReadReceived',
    requests: notes.map(note => ({
      entity: 'Note',
      id: note.id,
      fields: ['id', 'ownerId', 'dueAt'],
    })),
    result: {
      settled: [],
      entities: notes.map(note => ({ entity: 'Note', id: note.id, values: note })),
    },
    now: 0,
  })
  const after = Data.reduce(read, {
    _tag: 'LiveReceived',
    stream: 's',
    event: {
      _tag: 'ConnectionInsert',
      cursor: 1,
      connection: list.ref.identity,
      edge: { key: key(id), ref: { entity: 'Note', id } },
      position: 'prepend',
    },
    now: 0,
  })
  return Data.visibleItems(after.remote, list.ref.identity).map(edge => edge.ref.id)
}

describe("a list over Expr.viewer, judged with Remote.make's viewer", () => {
  it("leaves out a live insert of someone else's row", () => {
    expect(inserted(Mine, 'n2')).toEqual(['n1'])
  })

  it('places a live insert of the viewer’s own row', () => {
    expect(inserted(Mine, 'n3')).toEqual(['n1', 'n3'])
  })
})

describe('a list over Expr.now', () => {
  it('is the server’s: the client has no reading of the time it judged at', () => {
    // Not judged, so the declared policy shows the row the server sent.
    expect(inserted(Due, 'n2')).toEqual(['n1', 'n2'])
  })
})

describe('matching, given no context', () => {
  it('refuses a body over the viewer rather than reading a visitor', () => {
    const store = notes.reduce(
      (held, note) => writeEntity(held, key(note.id), { ...note }),
      emptyStore,
    )
    expect(() => matching(store, Mine, {})).toThrow(QueryEvaluateError)
    const ada = { viewer: Option.some({ entity: 'User', id: 'ada' }), now: Option.none() }
    expect(matching(store, Mine, {}, { context: ada }).matched).toEqual([key('n1'), key('n3')])
  })
})

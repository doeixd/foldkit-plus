/**
 * `verifyPredictions`' `Gap`: a mutation settles as usual, and each row its answer left
 * without fields the client showed while it was pending is kept, so the
 * refetch (and the `Loading` frame) it causes is named rather than sampled.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  ConnectionChange,
  Query,
  PredictionPart,
  Remote,
  type PredictionMismatch,
  type RemoteMessage,
} from '../src/index.js'

const Post = DomainEntity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    editedAt: Schema.Number,
    body: Schema.String,
    likes: Schema.Number,
  }),
)
const Feed = Query.define('Feed', {}, () =>
  Query.from(Post).pipe(Query.orderBy(Order.asc(Post.fields.id))),
)
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })

/** A domain whose active Surface lists the feed, reading each post's title and editedAt. */
const make = (verifyPredictions: boolean) => {
  const Data = Remote.make({
    model: App.model.remote,
    entities: [Post],
    queries: [Feed],
    verifyPredictions,
  })
  const feed = Data.query(
    Feed,
    {},
    { select: DomainEntity.select(Post, { title: true, editedAt: true }), first: 25 },
  )
  Data.subscriptions({ feed: App.surface('Feed', { model: () => ({ feed }) }) })
  return Data
}
const feed = Feed.ref({}).identity

/** The feed loaded with p1, whose title and editedAt the store holds. */
const loaded = (Data: ReturnType<typeof make>): Model =>
  Data.reduce(
    Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Post', id: 'p1', fields: ['id', 'title', 'editedAt'] }],
        result: {
          settled: [],
          entities: [{ entity: 'Post', id: 'p1', values: { id: 'p1', title: 'One', editedAt: 1 } }],
        },
        now: 0,
      },
    ),
    {
      _tag: 'ConnectionMerged',
      connection: feed,
      page: {
        edges: [{ key: 'Post:p1', ref: { entity: 'Post', id: 'p1' } }],
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      },
    },
  )

const p2 = { entity: 'Post', id: 'p2' }

/** p2 created: shown at the feed's front with its title until the answer, which carries `values`. */
const created = (
  Data: ReturnType<typeof make>,
  values: Readonly<Record<string, unknown>>,
): Model => {
  const started = Data.reduce(loaded(Data), {
    _tag: 'MutationStarted',
    requestId: 'r1',
    optimistic: [{ ...p2, values: { id: 'p2', title: 'Two' } }, ConnectionChange.prepend(feed, p2)],
  })
  return Data.reduce(started, answered(values))
}

/** The answer gaps a Model records, as the facts each names. */
const gaps = (model: Model) =>
  model.remote.diagnostics
    .filter(
      (diagnostic): diagnostic is PredictionMismatch => diagnostic._tag === 'PredictionMismatch',
    )
    .map(diagnostic => diagnostic.part)
    .filter(PredictionPart.$is('Gap'))
    .map(({ requestId, entity, id, fields }) => ({ requestId, entity, id, fields }))

const answered = (values: Readonly<Record<string, unknown>>): RemoteMessage => ({
  _tag: 'MutationSucceeded',
  requestId: 'r1',
  entities: [{ ...p2, values }],
  connections: [ConnectionChange.prepend(feed, p2)],
  now: 2,
})

describe('verifyPredictions, its Gap', () => {
  it('keeps the fields a list reads of a created row that its answer left out', () => {
    const Data = make(true)
    const model = created(Data, { id: 'p2', title: 'Two' })
    expect(gaps(model)).toEqual([
      { requestId: 'r1', entity: 'Post', id: 'p2', fields: ['editedAt'] },
    ])
    expect(Data.inspect(model).diagnostics).toEqual(model.remote.diagnostics)
  })

  it('records a warning naming the mutation, the row and the fields', () => {
    const Data = make(true)
    const started = Data.reduce(loaded(Data), {
      _tag: 'MutationStarted',
      requestId: 'r1',
      optimistic: [
        { ...p2, values: { id: 'p2', title: 'Two' } },
        ConnectionChange.prepend(feed, p2),
      ],
      write: { mutation: 'CreatePost', input: { title: 'Two' } },
    })
    expect(Data.reduce(started, answered({ id: 'p2', title: 'Two' })).remote.diagnostics).toEqual([
      {
        _tag: 'PredictionMismatch',
        source: 'foldkit-remote',
        level: 'error',
        message:
          'CreatePost (request r1) answered Post:p2 without editedAt, which the client showed while it was pending. They are read again, so the row reads Loading meanwhile: answer with them, or select fewer.',
        part: PredictionPart.Gap({
          requestId: 'r1',
          mutation: Option.some('CreatePost'),
          entity: 'Post',
          id: 'p2',
          fields: ['editedAt'],
        }),
      },
    ])
  })

  it('keeps the patched fields its answer left out that no Surface reads', () => {
    const Data = make(true)
    const started = Data.reduce(loaded(Data), {
      _tag: 'MutationStarted',
      requestId: 'r1',
      optimistic: [{ ...p2, values: { body: 'Text' }, adds: { likes: 1 } }],
    })
    const settled = Data.reduce(started, answered({ id: 'p2', title: 'Two', editedAt: 2 }))
    expect(gaps(settled)).toEqual([
      { requestId: 'r1', entity: 'Post', id: 'p2', fields: ['body', 'likes'] },
    ])
  })

  it('keeps the fields a list reads of a row the request only listed', () => {
    const Data = make(true)
    const started = Data.reduce(loaded(Data), {
      _tag: 'MutationStarted',
      requestId: 'r1',
      optimistic: [ConnectionChange.prepend(feed, p2)],
    })
    const settled = Data.reduce(started, answered({ id: 'p2' }))
    expect(gaps(settled)).toEqual([
      { requestId: 'r1', entity: 'Post', id: 'p2', fields: ['title', 'editedAt'] },
    ])
  })

  it('keeps nothing when the answer carries what was shown', () => {
    const model = created(make(true), { id: 'p2', title: 'Two', editedAt: 2 })
    expect(gaps(model)).toEqual([])
  })

  it('keeps nothing for a field the store already holds', () => {
    const Data = make(true)
    const started = Data.reduce(loaded(Data), {
      _tag: 'MutationStarted',
      requestId: 'r1',
      optimistic: [{ entity: 'Post', id: 'p1', values: { title: 'Renamed' } }],
    })
    const settled = Data.reduce(started, {
      _tag: 'MutationSucceeded',
      requestId: 'r1',
      entities: [{ entity: 'Post', id: 'p1', values: { id: 'p1' } }],
      now: 2,
    })
    expect(gaps(settled)).toEqual([])
  })

  it('keeps nothing for a temporary row the answer replaced, or a row it deleted', () => {
    const Data = make(true)
    const started = Data.reduce(loaded(Data), {
      _tag: 'MutationStarted',
      requestId: 'r1',
      optimistic: [
        { entity: 'Post', id: 'r1.tmp', values: { title: 'Two' } },
        ConnectionChange.prepend(feed, { entity: 'Post', id: 'r1.tmp' }),
        { entity: 'Post', id: 'p1', values: { title: 'Gone' } },
      ],
    })
    const settled = Data.reduce(started, {
      _tag: 'MutationSucceeded',
      requestId: 'r1',
      entities: [{ ...p2, values: { id: 'p2', title: 'Two', editedAt: 2 } }],
      connections: [ConnectionChange.prepend(feed, p2)],
      deleted: [{ entity: 'Post', id: 'p1' }],
      now: 2,
    })
    expect(gaps(settled)).toEqual([])
  })

  it('keeps the gaps of every answer', () => {
    const Data = make(true)
    const p3 = { entity: 'Post', id: 'p3' }
    const started = Data.reduce(created(Data, { id: 'p2', title: 'Two' }), {
      _tag: 'MutationStarted',
      requestId: 'r2',
      optimistic: [{ ...p3, values: { title: 'Three' } }],
    })
    const settled = Data.reduce(started, {
      _tag: 'MutationSucceeded',
      requestId: 'r2',
      entities: [{ ...p3, values: { id: 'p3' } }],
      now: 3,
    })
    // The answer places p3 in the feed by its order, so the feed reads it too.
    expect(gaps(settled)).toEqual([
      { requestId: 'r1', entity: 'Post', id: 'p2', fields: ['editedAt'] },
      { requestId: 'r2', entity: 'Post', id: 'p3', fields: ['title', 'editedAt'] },
    ])
  })

  it('checks an answer once', () => {
    const Data = make(true)
    const once = created(Data, { id: 'p2', title: 'Two' })
    expect(Data.reduce(once, answered({ id: 'p2', title: 'Two' })).remote.diagnostics).toBe(
      once.remote.diagnostics,
    )
  })

  it('changes nothing else, and without it keeps nothing', () => {
    const checked = created(make(true), { id: 'p2', title: 'Two' })
    const unchecked = created(make(false), { id: 'p2', title: 'Two' })
    expect(gaps(unchecked)).toEqual([])
    expect({ ...checked.remote, diagnostics: [] }).toEqual(unchecked.remote)
  })
})

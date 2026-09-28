/**
 * A Message that changes nothing returns the Model it was given. Foldkit renders
 * only when the root Model changes identity, so an equal copy renders the page.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Remote,
  entityKey,
  initialRemoteModel,
  terminal,
  updateRemote,
  type LiveEvent,
  type RemoteMessage,
  type RemoteModel,
} from '../src/index.js'

const edge = (id: string) => ({ key: entityKey('User', id), ref: { entity: 'User', id } })
const page = { edges: [edge('u1')], start: terminal, end: terminal }
const live = (stream: string, event: LiveEvent): RemoteMessage => ({
  _tag: 'LiveReceived',
  stream,
  event,
  now: 0,
})
const asking = [{ entity: 'User', id: 'u1', fields: ['name'] }]

/**
 * A user read and listed in `c1`, a live insert pending in `c2`, a tombstoned
 * `u9`, a gapped stream, and a read in flight.
 */
const base = [
  {
    _tag: 'ReadReceived',
    requests: asking,
    result: { settled: [], entities: [{ entity: 'User', id: 'u1', values: { name: 'ada' } }] },
    now: 0,
  },
  { _tag: 'ConnectionMerged', connection: 'c1', page },
  live('s1', {
    _tag: 'EntityPatched',
    ref: edge('u1').ref,
    values: { name: 'grace' },
    changed: ['name'],
    cursor: 1,
  }),
  live('s1', {
    _tag: 'ConnectionInsert',
    connection: 'c2',
    position: 'prepend',
    edge: edge('u2'),
    cursor: 2,
  }),
  live('s1', { _tag: 'EntityDeleted', ref: edge('u9').ref, cursor: 3 }),
  {
    _tag: 'ReadFailed',
    requests: [],
    error: { _tag: 'Transport', message: 'x' },
    stream: 'gapped',
  },
  { _tag: 'ReadStarted', requests: [{ entity: 'User', id: 'u2', fields: ['name'] }] },
].reduce<RemoteModel>(
  (model, message) => updateRemote(model, message as RemoteMessage),
  initialRemoteModel,
)

const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))],
})

describe('A Message that changes nothing', () => {
  it.each<[string, RemoteMessage]>([
    [
      'a live event already applied',
      live('s1', { _tag: 'EntityDeleted', ref: edge('u1').ref, cursor: 1 }),
    ],
    [
      'a read already in flight',
      { _tag: 'ReadStarted', requests: [{ entity: 'User', id: 'u2', fields: ['name'] }] },
    ],
    ['lifting an overlay nobody showed', { _tag: 'OverlayLifted', id: 'nobody' }],
    ['refreshing a connection already fresh', { _tag: 'ConnectionRefreshed', connection: 'c1' }],
    ['hydrating an empty snapshot', { _tag: 'Hydrated', entities: {}, merge: 'replace' }],
    [
      'a gap already recorded',
      {
        _tag: 'ReadFailed',
        requests: [],
        error: { _tag: 'Transport', message: 'x' },
        stream: 'gapped',
      },
    ],
    [
      'retention that keeps everything',
      {
        _tag: 'RetentionChanged',
        roots: {
          requirements: [
            ...asking,
            { entity: 'User', id: 'u2', fields: ['name'] },
            { entity: 'User', id: 'u9', fields: ['name'] },
          ],
          connections: [{ identity: 'c1' }, { identity: 'c2' }],
        },
      },
    ],
  ])('returns the Model: %s', (_name, message) => {
    expect(updateRemote(base, message)).toBe(base)
  })

  it('keeps the parts a change did not touch', () => {
    const started = updateRemote(base, { _tag: 'MutationStarted', requestId: 'm1' })
    // Nothing optimistic was asked for.
    expect(started.optimistic).toBe(base.optimistic)
    // A request that patches an entity shows no row.
    expect(
      updateRemote(base, {
        _tag: 'MutationStarted',
        requestId: 'm2',
        optimistic: [{ entity: 'User', id: 'u1', values: { name: 'ada' } }],
      }).optimistic.overlays,
    ).toBe(base.optimistic.overlays)
    // A success with no connection changes confirms nothing.
    expect(
      updateRemote(started, { _tag: 'MutationSucceeded', requestId: 'm1', entities: [], now: 0 })
        .optimistic,
    ).toBe(base.optimistic)
    // A failure of a request that showed nothing has nothing to release.
    expect(
      updateRemote(started, {
        _tag: 'MutationFailed',
        requestId: 'm1',
        error: { _tag: 'Transport', message: 'x' },
      }).optimistic,
    ).toBe(base.optimistic)
    // A page of `c1` covers no overlay, which is on `c2`.
    expect(
      updateRemote(base, { _tag: 'ConnectionMerged', connection: 'c1', page }).optimistic,
    ).toBe(base.optimistic)
    // Another stream deleting what is already deleted.
    expect(
      updateRemote(base, live('s2', { _tag: 'EntityDeleted', ref: edge('u9').ref, cursor: 1 }))
        .entities,
    ).toBe(base.entities)
    // A read of `u1` settles no mark of the `u2` read in flight.
    expect(
      updateRemote(base, {
        _tag: 'ReadReceived',
        requests: asking,
        result: { settled: [], entities: [] },
        now: 0,
      }).loading,
    ).toBe(base.loading)
    // A remove of an edge the pending insert does not carry leaves that insert as it is.
    const removed = updateRemote(
      base,
      live('s1', { _tag: 'ConnectionRemove', connection: 'c2', edge: edge('u3'), cursor: 4 }),
    )
    expect(removed.optimistic.overlays[0]).toBe(base.optimistic.overlays[0])
  })

  it('drops an insert a live remove emptied once a page of its connection lands', () => {
    const inserted = updateRemote(
      base,
      live('s3', {
        _tag: 'ConnectionInsert',
        connection: 'c1',
        position: 'append',
        edge: edge('u5'),
        cursor: 1,
      }),
    )
    const removed = updateRemote(
      inserted,
      live('s3', { _tag: 'ConnectionRemove', connection: 'c1', edge: edge('u5'), cursor: 2 }),
    )
    const paged = updateRemote(removed, { _tag: 'ConnectionMerged', connection: 'c1', page })
    // The insert and the remove are both settled evidence about `c1`; a page of it
    // is newer than either, and an empty insert shows nothing.
    expect(paged.optimistic.overlays.filter(overlay => overlay.connection === 'c1')).toEqual([
      expect.objectContaining({ position: 'remove' }),
    ])
  })

  it('keeps the application root through Data.reduce', () => {
    const model = { remote: base }
    expect(Data.reduce(model, { _tag: 'OverlayLifted', id: 'nobody' })).toBe(model)
  })

  it('keeps the visible store while only the overlays change', () => {
    const pending = updateRemote(base, {
      _tag: 'MutationStarted',
      requestId: 'm3',
      optimistic: [{ entity: 'User', id: 'u1', values: { name: 'pending' } }],
    })
    const inserted = updateRemote(
      pending,
      live('s1', {
        _tag: 'ConnectionInsert',
        connection: 'c2',
        position: 'append',
        edge: edge('u4'),
        cursor: 4,
      }),
    )
    expect(Data.storeOf({ remote: inserted })).toBe(Data.storeOf({ remote: pending }))
  })
})

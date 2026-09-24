/**
 * What of Remote's state a server render hands the browser: exactly what the
 * active projections read, each connection with its boundaries, and the live
 * cursors those entities follow; nothing else of the store.
 */
import { Effect, Layer, Result, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Entity, Query, Remote, RemoteClient, tombstone } from '../src/index.js'
import { captureRemote, restoreRemote } from '../src/resume.js'

const User = Entity.make(
  'User',
  Schema.Struct({ id: Schema.String, name: Schema.String, email: Schema.String }),
)
const Project = Entity.make(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, owner: Entity.ref(User) }),
)
const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: { ownerId: Schema.String },
  Result: Project,
})

const Model = Schema.Struct({ route: Schema.String, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Project],
  queries: [ProjectsByOwner],
})
const initial: Model = { route: '/', remote: Remote.initial }

const detail = Data.get(Project.select({ name: true, owner: User.select({ name: true }) }), 'p1')
const list = Data.query(
  ProjectsByOwner,
  { ownerId: 'u1' },
  { select: Project.select({ name: true }), first: 1 },
)
const identity = ProjectsByOwner.ref({ ownerId: 'u1' }).identity
const watched = Data.live(Project.select({ name: true }), 'p1')

/** A page showing the detail, the list, and the project live. */
const Page = App.surface('Page', { model: () => ({ detail, list, watched }) })
const subscriptions = Data.subscriptions({ page: Surface.at(Page, undefined) })

/** A server's store after its reads: two projects, their owner with an email, a page, and live cursors. */
const served: Model = (() => {
  const read = Data.reduce(initial, {
    _tag: 'ReadReceived',
    requests: [
      { entity: 'Project', id: 'p1', fields: ['name', 'owner'] },
      { entity: 'Project', id: 'p2', fields: ['name'] },
      { entity: 'User', id: 'u1', fields: ['name', 'email'] },
    ],
    result: {
      settled: [],
      entities: [
        { entity: 'Project', id: 'p1', values: { name: 'Atlas', owner: 'User:u1' } },
        { entity: 'Project', id: 'p2', values: { name: 'Unrelated' } },
        { entity: 'User', id: 'u1', values: { name: 'Ada', email: 'ada@example.test' } },
      ],
    },
    now: 5,
  })
  const paged = Data.reduce(read, {
    _tag: 'ConnectionMerged',
    connection: identity,
    page: {
      edges: [{ key: 'Project:p1', ref: { entity: 'Project', id: 'p1' } }],
      start: { _tag: 'Terminal' },
      end: { _tag: 'Cursor', cursor: 'after:p1' },
    },
  })
  return {
    ...paged,
    remote: {
      ...paged.remote,
      live: {
        'Project:p1:name': { cursor: 7, boundary: {} },
        'Project:p2:name': { cursor: 3, boundary: {} },
      },
    },
  }
})()

describe('captureRemote', () => {
  const capture = captureRemote(served.remote, [detail, list])

  it('takes the fields the projections read, through their relations, and no others', () => {
    expect(Object.keys(capture.entities).sort()).toEqual(['Project:p1', 'User:u1'])
    expect(capture.entities['Project:p1']?.values).toEqual({ name: 'Atlas', owner: 'User:u1' })
    // The owner's email is in the server's store, and no projection reads it.
    expect(capture.entities['User:u1']?.values).toEqual({ name: 'Ada' })
    expect(JSON.stringify(capture)).not.toContain('ada@example.test')
  })

  it('takes a connection whole, with the boundary where the server stopped', () => {
    expect(capture.connections[identity]?.segments[0]?.end).toEqual({
      _tag: 'Cursor',
      cursor: 'after:p1',
    })
  })

  it('takes the live cursors of captured entities, and no others', () => {
    expect(capture.live).toEqual({ 'Project:p1:name': { cursor: 7, boundary: {} } })
  })

  it("takes what a connection's selection reads of each item", () => {
    const listed = captureRemote(served.remote, [list])
    expect(listed.entities['Project:p1']?.values).toEqual({ name: 'Atlas' })
  })

  it('takes an entity the server knows is gone, so the browser does not fetch it', () => {
    const gone = { ...served.remote, entities: tombstone(served.remote.entities, 'Project:p1') }
    const capture = captureRemote(gone, [detail])
    expect(capture.entities['Project:p1']).toMatchObject({ tombstone: true, values: {} })
    const resumed = { ...initial, remote: restoreRemote(initial.remote, capture) }
    expect(detail.read(resumed)).toEqual(detail.read({ ...served, remote: gone }))
    expect(Data.plan(resumed, detail)).toEqual([])
  })

  it('keeps a field marked stale, so the browser revalidates it', () => {
    const entry = served.remote.entities['Project:p1']
    if (entry === undefined) throw new Error('the server read no Project:p1')
    const stale = { ...entry, stale: new Set(['name']) }
    const remote = {
      ...served.remote,
      entities: { ...served.remote.entities, 'Project:p1': stale },
    }
    expect(captureRemote(remote, [detail]).entities['Project:p1']?.stale).toEqual(['name'])
  })
})

describe('restoreRemote', () => {
  const restored = {
    ...initial,
    remote: restoreRemote(initial.remote, captureRemote(served.remote, [detail, list])),
  }

  it('reads as the server read, and plans no request', () => {
    expect(detail.read(restored)).toEqual(detail.read(served))
    expect(detail.read(restored)).toMatchObject({ _tag: 'Ready' })
    expect(Data.plan(restored, detail)).toEqual([])
    expect(Data.plan(restored, list)).toEqual([])
  })

  it('restores the live cursors, so a subscription resumes where the server left off', () => {
    expect(restored.remote.live).toEqual({ 'Project:p1:name': { cursor: 7, boundary: {} } })
  })

  it("hands the live subscription the server's cursor, so it asks from there", async () => {
    // The server's live subscription receives one event, keyed by the library.
    const entry = subscriptions['page.live']
    const publishing = Layer.succeed(RemoteClient, {
      read: () => Effect.die('unused'),
      query: () => Effect.die('unused'),
      mutate: () => Effect.die('unused'),
      live: () =>
        Stream.make({
          _tag: 'EntityPatched' as const,
          ref: { entity: 'Project', id: 'p1' },
          values: { name: 'Atlas' },
          changed: ['name'],
          cursor: 1,
        }),
    })
    const received = await Effect.runPromise(
      Stream.runCollect(entry.dependenciesToStream(entry.modelToDependencies(served))).pipe(
        Effect.provide(publishing),
      ),
    )
    const watching = [...received].reduce((model, message) => Data.reduce(model, message), served)
    const resumed = {
      ...initial,
      remote: restoreRemote(
        initial.remote,
        captureRemote(watching.remote, [detail, list, watched]),
      ),
    }
    expect(entry.modelToDependencies(resumed).cursor).toBe(1)
    expect(entry.modelToDependencies(initial).cursor).toBe(0)
  })

  it('keeps what retention finds reachable, so nothing resumed is collected', () => {
    const roots = subscriptions.retain.modelToDependencies(restored)
    const retained = Data.reduce(restored, { _tag: 'RetentionChanged', roots })
    expect(detail.read(retained)).toEqual(detail.read(served))
    expect(list.read(retained)).toEqual(list.read(served))
  })

  it('keeps "load more": the page knows there is a next one', () => {
    expect(list.read(restored)).toMatchObject({ _tag: 'Ready', value: { hasNext: true } })
  })

  it('leaves loading, failures, the ledger and the rest at their initial values', () => {
    const { entities: _e, connections: _c, live: _l, ...rest } = restored.remote
    const { entities: _ie, connections: _ic, live: _il, ...initialRest } = Remote.initial
    expect(rest).toEqual(initialRest)
  })
})

describe('Remote.resume', () => {
  const part = Remote.resume(Data)

  it('is a resume part whose capture survives JSON and restores what the projections read', () => {
    expect(part.id).toBe('remote')
    expect(part.covers).toEqual(['remote', 'remote.connection'])
    const wire = JSON.parse(JSON.stringify(part.capture(served, [detail, list])))
    const restored = Result.getOrThrow(part.restore(initial, wire))
    expect(detail.read(restored)).toEqual(detail.read(served))
  })

  it('refuses a value that is not a capture, saying so', () => {
    const refused = part.restore(initial, { entities: 'nope' })
    expect(Result.isFailure(refused)).toBe(true)
    expect(Result.isFailure(refused) && refused.failure).toContain("Remote's state does not decode")
  })

  it('takes an id, for a second domain in one application', () => {
    expect(Remote.resume(Data, { id: 'catalog' }).id).toBe('catalog')
  })
})

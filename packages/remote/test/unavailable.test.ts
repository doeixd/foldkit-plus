import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Query,
  REMOTE_CACHE_VERSION,
  Remote,
  RemotePersistence,
  emptyStore,
  entityKey,
  isFieldUnavailable,
  missingFields,
  plan,
  readField,
  setUnavailable,
  writeEntity,
  type Boundary,
  type RemoteMessage,
} from '../src/index.js'
import { captureRemote, restoreRemote } from '../src/resume.js'

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Project = Entity.make(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    privateNotes: Schema.String,
    owner: Entity.ref(User),
  }),
)
const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: { ownerId: Schema.String },
  Result: Project,
})

const Model = Schema.Struct({ route: Schema.String, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, Ping: {} })
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Project],
  queries: [ProjectsByOwner],
})
const initial: Model = { route: '/', remote: Remote.initial }

const p1 = entityKey('Project', 'p1')
const request = { entity: 'Project', id: 'p1', fields: ['name', 'privateNotes'] }
const withNotes = Project.select({ name: true, privateNotes: true })
const nameOnly = Project.select({ name: true })

/** The server returns the project without its notes, and says so. */
const withheld = (model: Model, now = 0): Model =>
  Data.reduce(model, {
    _tag: 'ReadReceived',
    requests: [request],
    result: {
      entities: [{ entity: 'Project', id: 'p1', values: { name: 'Apollo' } }],
      settled: [{ entity: 'Project', id: 'p1', fields: ['privateNotes'] }],
    },
    now,
  })

describe('a field the server settled without a value', () => {
  it('is not missing, so the planner does not ask for it again', () => {
    const store = withheld(initial).remote.entities
    expect(isFieldUnavailable(store, p1, 'privateNotes')).toBe(true)
    expect(missingFields(store, p1, ['name', 'privateNotes'])).toEqual([])
    expect(plan(store, [request])).toEqual([])
  })

  it('is asked for by a forced plan, as a tombstone is', () => {
    expect(plan(withheld(initial).remote.entities, [request], { force: true })).toEqual([request])
  })

  it('does not tombstone the entity: what the store holds of it stays', () => {
    // The two-read shape that used to wipe the name: a second read asking for
    // the withheld field alone gets an answer with no entity in it.
    const first = Data.reduce(initial, {
      _tag: 'ReadReceived',
      requests: [request],
      result: {
        entities: [{ entity: 'Project', id: 'p1', values: { name: 'Apollo' } }],
        settled: [],
      },
      now: 0,
    })
    const second = Data.reduce(first, {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Project', id: 'p1', fields: ['privateNotes'] }],
      result: {
        entities: [],
        settled: [{ entity: 'Project', id: 'p1', fields: ['privateNotes'] }],
      },
      now: 1,
    })
    expect(readField(second.remote.entities, p1, 'name')).toEqual(Option.some('Apollo'))
    expect(Data.get(nameOnly, 'p1').read(second)).toEqual({
      _tag: 'Ready',
      value: { name: 'Apollo' },
    })
  })

  it('still tombstones an id the server neither returned nor settled', () => {
    const absent = Data.reduce(initial, {
      _tag: 'ReadReceived',
      requests: [request],
      result: { entities: [], settled: [] },
      now: 0,
    })
    expect(Data.get(nameOnly, 'p1').read(absent)).toEqual({ _tag: 'NotFound' })
  })

  it('never marks a field the same answer carries', () => {
    const store = Remote.writeRead(emptyStore, [request], {
      entities: [{ entity: 'Project', id: 'p1', values: { name: 'Apollo' } }],
      settled: [{ entity: 'Project', id: 'p1', fields: ['name', 'privateNotes'] }],
    })
    expect(isFieldUnavailable(store, p1, 'name')).toBe(false)
    expect(isFieldUnavailable(store, p1, 'privateNotes')).toBe(true)
  })

  it('is cleared by a later write of the field', () => {
    const store = withheld(initial).remote.entities
    const written = writeEntity(store, p1, { privateNotes: 'now visible' }, 1)
    expect(isFieldUnavailable(written, p1, 'privateNotes')).toBe(false)
    expect(readField(written, p1, 'privateNotes')).toEqual(Option.some('now visible'))
  })

  it('leaves a present field alone when marked, and a tombstone alone', () => {
    const present = writeEntity(emptyStore, p1, { name: 'Apollo' })
    expect(setUnavailable(present, [[p1, ['name']]], true)).toBe(present)
    const gone = Remote.writeRead(emptyStore, [request], { entities: [], settled: [] })
    expect(setUnavailable(gone, [[p1, ['name']]], true)).toBe(gone)
  })

  it('is forgotten by a refresh, so the field reads Loading while asked again', () => {
    const refreshed = Data.refresh(withheld(initial), Data.get(withNotes, 'p1'))
    expect(isFieldUnavailable(refreshed.remote.entities, p1, 'privateNotes')).toBe(false)
    expect(Data.plan(refreshed, Data.get(withNotes, 'p1'))).toEqual([request])
    const started = Data.reduce(refreshed, {
      _tag: 'ReadStarted',
      requests: [request],
    })
    expect(Data.get(withNotes, 'p1').read(started)).toEqual({ _tag: 'Loading' })
  })
})

describe('reading a Selection that names a settled field', () => {
  it('is Failed with an Unavailable error naming the field, not Loading or Initial', () => {
    const read = Data.get(withNotes, 'p1').read(withheld(initial))
    expect(read._tag).toBe('Failed')
    if (read._tag !== 'Failed') return
    expect(read.error._tag).toBe('Unavailable')
    expect(read.error.message).toContain('Project:p1.privateNotes')
    expect(read).not.toHaveProperty('previous')
  })

  it('reads Ready through a Selection that does not name it', () => {
    expect(Data.get(nameOnly, 'p1').read(withheld(initial))).toEqual({
      _tag: 'Ready',
      value: { name: 'Apollo' },
    })
  })

  it('is found through a relation', () => {
    const model = Data.reduce(initial, {
      _tag: 'ReadReceived',
      requests: [
        { entity: 'Project', id: 'p1', fields: ['owner'] },
        { entity: 'User', id: 'u1', fields: ['name'] },
      ],
      result: {
        entities: [{ entity: 'Project', id: 'p1', values: { owner: 'User:u1' } }],
        settled: [{ entity: 'User', id: 'u1', fields: ['name'] }],
      },
      now: 0,
    })
    const read = Data.get(Project.select({ owner: User.select({ name: true }) }), 'p1').read(model)
    expect(read._tag).toBe('Failed')
    if (read._tag === 'Failed') expect(read.error.message).toContain('User:u1.name')
  })

  it('fails a list whose row names it', () => {
    const identity = ProjectsByOwner.ref({ ownerId: 'u1' }).identity
    const terminal: Boundary = { _tag: 'Terminal' }
    const merged: RemoteMessage = {
      _tag: 'ConnectionMerged',
      connection: identity,
      page: {
        edges: [{ key: 'Project:p1', ref: { entity: 'Project', id: 'p1' } }],
        start: terminal,
        end: terminal,
      },
    }
    const model = withheld(Data.reduce(initial, merged))
    const list = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: withNotes, first: 1 })
    const read = list.read(model)
    expect(read._tag).toBe('Failed')
    if (read._tag === 'Failed') expect(read.error._tag).toBe('Unavailable')
    const named = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: nameOnly, first: 1 })
    expect(named.read(model)._tag).toBe('Ready')
  })

  it('is explained by Data.why', () => {
    const why = Data.why(withheld(initial), Data.get(withNotes, 'p1'))
    expect(why.state).toBe('Failed')
    expect(why.message).toContain('Select without it, or Data.refresh asks again.')
  })
})

describe('the mark survives', () => {
  const store = withheld(initial).remote.entities

  it('a persistence round trip, under a new cache version', () => {
    const text = RemotePersistence.dehydrate({ entities: store, connections: {} })
    expect(JSON.parse(text).version).toBe(REMOTE_CACHE_VERSION)
    expect(JSON.parse(text).entities[p1].unavailable).toEqual(['privateNotes'])
    expect(RemotePersistence.hydrate(text)?.entities).toEqual(store)
  })

  it('is refused from a snapshot that lacks it', () => {
    const text = RemotePersistence.dehydrate({ entities: store, connections: {} })
    const older = JSON.parse(text)
    delete older.entities[p1].unavailable
    expect(RemotePersistence.hydrate(JSON.stringify(older))).toBeUndefined()
  })

  it('a server render, so the browser does not ask once more', () => {
    const detail = Data.get(withNotes, 'p1')
    const capture = captureRemote(withheld(initial).remote, [detail])
    expect(capture.entities[p1]?.unavailable).toEqual(['privateNotes'])
    const resumed = { ...initial, remote: restoreRemote(initial.remote, capture) }
    expect(Data.plan(resumed, detail)).toEqual([])
    expect(detail.read(resumed)).toEqual(detail.read(withheld(initial)))
  })
})

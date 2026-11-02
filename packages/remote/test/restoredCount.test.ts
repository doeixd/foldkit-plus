/**
 * A restored durable create counted once (#410, #457). A create predicts the
 * counts of the rows it points at. When a reload's store already holds the
 * row it makes (the server ran it and its answer was lost), a count read
 * after the write includes it, so the restored write adds nothing to it. A
 * count read before the write may predate the row, and still takes the
 * increment.
 */
import { Effect, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { defineMessageUnion } from 'foldkit/message'
import { Derived, Entity, Relation, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Remote, RemoteData, type NormalizedPatch } from '../src/index.js'
import { outbox, outboxStatus } from '../src/outbox.js'
import { storedOf, storedText } from '../src/outboxStore.js'

const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const NoteFields = Entity.define('Note', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Notes = Entity.relate(
  { User: UserFields, Note: NoteFields },
  { Note: { author: Relation.one(UserFields) } },
)
const Member = Notes.User.pipe(
  Entity.derived({ noteCount: Derived.count(Notes.Note.relations.author) }),
)
const AddNote = Mutation.write(
  'AddNote',
  Write.insert(
    Entity.input(
      Notes.Note,
      Schema.Struct({ id: Schema.String, body: Schema.String, authorId: Schema.String }),
      { authorId: 'author' },
    ),
    { id: 'id' },
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Member, Notes.Note],
  mutations: [AddNote],
})
const durable = outbox(Data, { key: () => 'outbox:hopper', scope: () => 'hopper' })

const Counted = Entity.select(Member, { noteCount: true })
const count = (model: Model) =>
  RemoteData.match(Data.get(Counted, 'hopper').read(model), {
    Initial: () => 'Initial',
    Loading: () => 'Loading',
    Ready: member => String(member.noteCount),
    Refreshing: member => String(member.noteCount),
    Failed: () => 'Failed',
    NotFound: () => 'NotFound',
  })

/** The store holding `rows`, as a server render or a read sends them, read at `now`. */
const reading = (model: Model, rows: ReadonlyArray<NormalizedPatch>, now = 0): Model =>
  Data.reduce(model, {
    _tag: 'ReadReceived',
    requests: rows.map(row => ({
      entity: row.entity,
      id: row.id,
      fields: Object.keys(row.values),
    })),
    result: { settled: [], entities: rows },
    now,
  })

const hopper = (noteCount: number): NormalizedPatch => ({
  entity: 'User',
  id: 'hopper',
  values: { id: 'hopper', name: 'Hopper', noteCount },
})
const note: NormalizedPatch = {
  entity: 'Note',
  id: 'n1',
  values: { id: 'n1', body: 'hi', author: 'User:hopper' },
}

const memory = () =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* KeyValueStore.KeyValueStore
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )
const restore = (kv: KeyValueStore.KeyValueStore, model: Model) =>
  Effect.runPromise(
    durable.restore(model).pipe(Effect.provideService(KeyValueStore.KeyValueStore, kv)),
  )

const adding = (model: Model) =>
  Data.mutate(
    model,
    AddNote,
    { id: 'n1', body: 'hi', authorId: 'hopper' },
    { durable: true, now: 1 },
  ).model

/** A store holding a page's note added while its answer was lost, and the page's Model. */
const leftPending = async () => {
  const kv = memory()
  const pending = adding(await restore(kv, reading({ remote: Remote.initial }, [hopper(0)])))
  expect(count(pending)).toBe('1')
  Effect.runSync(
    kv.set('outbox:hopper', storedText(storedOf(Data.store.get(pending).outbox), 'hopper')),
  )
  return kv
}

describe('A durable create restored after a reload', () => {
  it('counts its note once, over a server render that already counts it', async () => {
    const kv = await leftPending()
    const reloaded = await restore(kv, reading({ remote: Remote.initial }, [hopper(1), note], 2))
    expect(outboxStatus(Data, reloaded).waiting).toBe(1)
    expect(count(reloaded)).toBe('1')
  })

  it('counts its note over a store whose count predates the create', async () => {
    const kv = await leftPending()
    const reloaded = await restore(kv, reading({ remote: Remote.initial }, [hopper(0), note]))
    expect(count(reloaded)).toBe('1')
  })

  it('counts its note over a count read before the write and a row read after it', async () => {
    const kv = await leftPending()
    const stored = reading(reading({ remote: Remote.initial }, [hopper(0)]), [note], 2)
    expect(count(await restore(kv, stored))).toBe('1')
  })

  it('counts its note over a count read after the write and a row read before it', async () => {
    const kv = await leftPending()
    const stored = reading(reading({ remote: Remote.initial }, [note]), [hopper(1)], 2)
    expect(count(await restore(kv, stored))).toBe('1')
  })

  it('counts its note over a store that does not hold it', async () => {
    const kv = await leftPending()
    expect(count(await restore(kv, reading({ remote: Remote.initial }, [hopper(0)])))).toBe('1')
  })

  it('counts its note over a store that holds it deleted', async () => {
    const kv = await leftPending()
    const deleted = Data.reduce(reading({ remote: Remote.initial }, [hopper(0)], 2), {
      _tag: 'MutationSucceeded',
      requestId: 'elsewhere',
      entities: [],
      deleted: [{ entity: 'Note', id: 'n1' }],
      now: 1,
    })
    expect(count(await restore(kv, deleted))).toBe('1')
  })
})

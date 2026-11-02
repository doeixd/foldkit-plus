/**
 * A restored durable create counted once (#410). A create predicts the
 * counts of the rows it points at. When a reload's store already holds the
 * row it makes (the server ran it and its answer was lost), the counts the
 * page read include it, so the restored write adds nothing to them.
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

/** The store holding `rows`, as a server render or a read sends them. */
const reading = (model: Model, rows: ReadonlyArray<NormalizedPatch>): Model =>
  Data.reduce(model, {
    _tag: 'ReadReceived',
    requests: rows.map(row => ({
      entity: row.entity,
      id: row.id,
      fields: Object.keys(row.values),
    })),
    result: { settled: [], entities: rows },
    now: 0,
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
    const reloaded = await restore(kv, reading({ remote: Remote.initial }, [hopper(1), note]))
    expect(outboxStatus(Data, reloaded).waiting).toBe(1)
    expect(count(reloaded)).toBe('1')
  })

  it('counts its note over a store that does not hold it', async () => {
    const kv = await leftPending()
    expect(count(await restore(kv, reading({ remote: Remote.initial }, [hopper(0)])))).toBe('1')
  })

  it('counts its note over a store that holds it deleted', async () => {
    const kv = await leftPending()
    const deleted = Data.reduce(reading({ remote: Remote.initial }, [hopper(0)]), {
      _tag: 'MutationSucceeded',
      requestId: 'elsewhere',
      entities: [],
      deleted: [{ entity: 'Note', id: 'n1' }],
      now: 1,
    })
    expect(count(await restore(kv, deleted))).toBe('1')
  })
})

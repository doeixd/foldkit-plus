/**
 * The Message history's types: each step's input is the version before, a
 * step that returns the wrong shape is refused where it is written, and the
 * contract's Message is the history's last Schema.
 */
import { Match, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { Sync, documentId, type Migrations, type Replica } from '../src/index.js'

const Cleared = Schema.TaggedStruct('Cleared', {})
const RenamedV1 = Schema.TaggedStruct('Renamed', { title: Schema.String })
const NoteMessageV1 = Schema.Union([RenamedV1, Cleared])
const Renamed = Schema.TaggedStruct('Renamed', { name: Schema.String })
const NoteMessage = Schema.Union([Renamed, Cleared])

const NoteHistory = Sync.migrations(NoteMessageV1).next(NoteMessage, previous =>
  Match.valueTags(previous, {
    Renamed: ({ title }) => ({ _tag: 'Renamed' as const, name: title }),
    Cleared: cleared => cleared,
  }),
)

const Shared = Schema.Struct({ count: Schema.Number })
const notes = Sync.define({
  documentId: documentId('notes'),
  migrations: NoteHistory,
  shared: Shared,
  empty: { count: 0 },
  durable: () => true,
  // The Message is the history's current one, inferred where it is used.
  replay: (shared, message) =>
    Match.valueTags(message, {
      Renamed: ({ name }) => ({ count: shared.count + name.length }),
      Cleared: () => ({ count: 0 }),
    }),
})
declare const replica: Replica<typeof NoteMessage.Type, typeof Shared.Type>
replica.submit(Renamed.make({ name: 'Groceries' }))
// @ts-expect-error version 1's `Renamed` is not the current Message
replica.submit(RenamedV1.make({ title: 'Groceries' }))
export const openNotes = notes.openReplica

Sync.define({
  documentId: documentId('notes'),
  migrations: NoteHistory,
  shared: Shared,
  empty: { count: 0 },
  durable: () => true,
  replay: (shared, message) =>
    Match.valueTags(message, {
      // @ts-expect-error `title` is version 1's field, not the current Message's
      Renamed: ({ title }) => ({ count: shared.count + title.length }),
      Cleared: () => ({ count: 0 }),
    }),
})

// A step that returns the previous shape is refused where it is written.
Sync.migrations(NoteMessageV1).next(NoteMessage, previous =>
  // @ts-expect-error `title` is not a field of version 2's `Renamed`
  Match.valueTags(previous, {
    Renamed: ({ title }) => ({ _tag: 'Renamed' as const, title }),
    Cleared: cleared => cleared,
  }),
)

// A step's input is the version before it, encoded.
Sync.migrations(NoteMessageV1).next(NoteMessage, previous =>
  Match.valueTags(previous, {
    // @ts-expect-error version 1's `Renamed` has no `name`
    Renamed: ({ name }) => ({ _tag: 'Renamed' as const, name }),
    Cleared: cleared => cleared,
  }),
)

// A history is typed by its last Schema; one that stops short is not the current Message's.
declare const takes: (
  migrations: Migrations<typeof NoteMessage.Type, typeof NoteMessage.Encoded>,
) => void
takes(NoteHistory)
// @ts-expect-error a history that stops short of the current Schema
takes(Sync.migrations(NoteMessageV1))

// `message` and `migrations` are two ways to name the Message, so one or the other.
// @ts-expect-error not both
Sync.define({
  documentId: documentId('notes'),
  message: NoteMessage,
  migrations: NoteHistory,
  shared: Shared,
  empty: { count: 0 },
  durable: () => true,
  replay: shared => shared,
})

// `forApplication(App).make` takes a history typed by the application's own Message.
const Model = Schema.Struct({ names: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Named: { name: Schema.String } })
type Message = typeof Message.Type
const App = Surface.application({
  Model,
  Message,
  initial: { names: [] },
  update: (model: Model, message: Message): Update.Return<Model, Message> => ({
    model: { names: [...model.names, message.name] },
  }),
})
const NamedV1 = Schema.Union([Schema.TaggedStruct('Named', { title: Schema.String })])
const options = {
  documentId: documentId('names'),
  shared: Projection.pick(App.model.names),
  durable: MessageSet.make(App, [Message.Named]),
}
Sync.forApplication(App).make({
  ...options,
  migrations: Sync.migrations(NamedV1).next(App.Message, ({ title }) => ({
    _tag: 'Named' as const,
    name: title,
  })),
})
Sync.forApplication(App).make({
  ...options,
  // @ts-expect-error a history that ends at version 1 is not the application's Message
  migrations: Sync.migrations(NamedV1),
})

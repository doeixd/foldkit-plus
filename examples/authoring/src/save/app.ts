/**
 * The editor's save. The title is the Model's own field; saving is a Remote
 * mutation, so what became of each save (pending, applied, failed, refused)
 * is Remote's ledger, read from the Model and kept nowhere else. The Model
 * lists the request ids it started, in order, and nothing more: the ledger
 * answers for each.
 */
import { Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Entity, Mutation, Refusal, Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

export const NOTE = 'note-1'

export const Note = Entity.make('Note', Schema.Struct({ id: Schema.String, title: Schema.String }))

/** Why the server refused a title: the one field, and the words to show beside it. */
export const Refused = Schema.Union([Refusal.field('title', Schema.String)])

export const SaveNote = Mutation.make('SaveNote', {
  Input: { id: Schema.String, title: Schema.String },
  Output: { id: Schema.String },
  Refusal: Refused,
})

export const Model = Schema.Struct({
  remote: Remote.Model,
  draft: Schema.String,
  requests: Schema.Array(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Remote.messages,
  ChangedDraft: { text: Schema.String },
  // A person's click names no id and takes Remote's next; an agent's call is given its invocation's.
  RequestedSave: { requestId: Schema.Option(Schema.String) },
})
export type Message = typeof Message.Type

export const App = Surface.application({
  Model,
  Message,
  initial: { remote: Remote.initial, draft: '', requests: [] },
  update: (model, message) => update(model, message),
})

export const Data = Remote.make({
  model: App.model.remote,
  entities: [Note],
  mutations: [SaveNote],
  verifyPredictions: true,
})

export const update = (
  model: Model,
  message: Message,
): Update.Return<Model, Message, RemoteClient> => {
  if (Remote.reduces(message)) return { model: Data.reduce(model, message) }
  return Match.valueTags(message, {
    ChangedDraft: ({ text }) => ({ model: modifyFields(model, { draft: () => text }) }),
    RequestedSave: ({ requestId }) => {
      const started = Data.mutate(
        model,
        SaveNote,
        { id: NOTE, title: model.draft },
        {
          optimistic: [Remote.patch(Note, NOTE, { title: model.draft })],
          ...Option.match(requestId, { onNone: () => ({}), onSome: id => ({ requestId: id }) }),
        },
      )
      return {
        model: modifyFields(started.model, {
          requests: requests => [...requests, started.requestId],
        }),
        commands: [started.command],
      }
    },
  })
}

export const initial = () => ({ model: App.initial })

/** What became of one save, from Remote's ledger. */
export interface Save {
  readonly requestId: string
  readonly status: 'Pending' | 'Applied' | 'Failed' | 'Unknown'
  /** The server's reason, when it refused the title rather than failing. */
  readonly refusal: Option.Option<string>
}

export interface State {
  readonly draft: string
  readonly saves: ReadonlyArray<Save>
}

/** The state every driver reads: the Model's field, and each started save's status. */
export const stateOf = (model: Model): State => ({
  draft: model.draft,
  saves: model.requests.map(requestId => {
    const status = Data.mutation(model, requestId)
    return {
      requestId,
      status: status._tag,
      refusal: Option.map(Data.refusal(model, requestId, SaveNote), refusal => refusal.reason),
    }
  }),
})

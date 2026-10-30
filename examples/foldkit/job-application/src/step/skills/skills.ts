import { BrowserCrypto } from '@effect/platform-browser'
import { Array, Effect, Schema } from 'effect'
import { SecureRandom } from 'effect/crypto'
import { Command, Update } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import * as Entry from './entry/index.js'

// MODEL

export const Model = Schema.Struct({
  entries: Schema.Array(Entry.Model),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedAddEntry: {},
  CompletedGenerateEntryId: { entryId: Schema.String },
  RemovedEntry: { entryId: Schema.String },
  GotEntryMessage: {
    entryId: Schema.String,
    message: Entry.Message,
  },
})

export type Message = typeof Message.Type

// INIT

export const init = (initialEntryId: string): Model => ({
  entries: [Entry.init(initialEntryId)],
})

// COMMAND

export const GenerateEntryId = Command.define('GenerateEntryId', {
  messages: [Message.CompletedGenerateEntryId],
  execute: Effect.gen(function* () {
    const secureRandom = yield* SecureRandom.SecureRandom
    const entryId = yield* secureRandom.uuidV4()
    return Message.CompletedGenerateEntryId({ entryId })
  }).pipe(Effect.provide(BrowserCrypto.layerSecureRandom)),
})

// UPDATE

const foldEntryOutMessage: (
  entryId: string,
) => (outMessage: Entry.OutMessage) => Update.Step<Model, Message> = entryId =>
  Entry.OutMessage.match<Update.Step<Model, Message>>({
    Removed: () => model => ({
      model: modifyFields(model, {
        entries: Array.filter(entry => entry.id !== entryId),
      }),
    }),
  })

const entryFold = (entryId: string) => ({
  read: (model: Model) => Array.findFirst(model.entries, entry => entry.id === entryId),
  // An entry left as it was leaves the Model as it was.
  write: (model: Model, nextEntry: Entry.Model) =>
    model.entries.includes(nextEntry)
      ? model
      : modifyFields(model, {
          entries: Array.map(entry => (entry.id === entryId ? nextEntry : entry)),
        }),
  toParentMessage: (message: Entry.Message) => Message.GotEntryMessage({ entryId, message }),
})

const foldEntry = (entryId: string) =>
  Update.foldChild({
    update: Entry.update,
    ...entryFold(entryId),
    foldOutMessage: foldEntryOutMessage(entryId),
  })

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedAddEntry: () => ({ model, commands: [GenerateEntryId()] }),

    CompletedGenerateEntryId: ({ entryId }) => ({
      model: modifyFields(model, {
        entries: Array.append(Entry.init(entryId)),
      }),
    }),

    RemovedEntry: ({ entryId }) => ({
      model: modifyFields(model, {
        entries: Array.filter(entry => entry.id !== entryId),
      }),
    }),

    GotEntryMessage: ({ entryId, message }) => foldEntry(entryId)(model, message),
  })

// VALIDATION SUMMARY

export const hasErrors = (model: Model): boolean => Array.some(model.entries, Entry.hasErrors)

export const isComplete = (model: Model): boolean =>
  Array.isReadonlyArrayNonEmpty(model.entries) && Array.every(model.entries, Entry.isComplete)

export const revealErrors = (model: Model): Update.Return<Model, Message> =>
  Update.combine(
    model,
    Array.map(model.entries, ({ id }) =>
      Update.foldChildStep({ update: Entry.revealErrors, ...entryFold(id) }),
    ),
  )

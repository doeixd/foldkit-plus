/**
 * A search field and a save form for the UI bridge.
 *
 * The search part is one application id mounted twice. The save form's
 * operation lives on the Model: Requested, then Accepted, then Pending, then
 * the correlated Saved or SaveFailed. `toggle` is an exposed capability and a
 * button, and it is not a part.
 */
import { Effect, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Projection } from 'foldkit-surface'
import { Agent } from '../src/index.js'

export const Save = defineTaggedUnion({
  Requested: { requestId: Schema.String, title: Schema.String },
  Accepted: { requestId: Schema.String, title: Schema.String },
  Pending: { requestId: Schema.String, title: Schema.String },
  Succeeded: { requestId: Schema.String, title: Schema.String },
  Failed: { requestId: Schema.String, title: Schema.String, reason: Schema.String },
})
export type Save = typeof Save.Type

export const Model = Schema.Struct({
  role: Schema.Literals(['viewer', 'editor']),
  query: Schema.String,
  draft: Schema.String,
  token: Schema.String,
  toggled: Schema.Boolean,
  operations: Schema.Array(Save),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Typed: { value: Schema.String },
  Cleared: {},
  Toggled: {},
  DraftChanged: { value: Schema.String },
  RequestedSave: { requestId: Schema.String, title: Schema.String },
  AcceptedSave: { requestId: Schema.String, title: Schema.String },
  StartedSave: { requestId: Schema.String, title: Schema.String },
  Saved: { requestId: Schema.String, title: Schema.String },
  SaveFailed: { requestId: Schema.String, reason: Schema.String },
})
export type Message = typeof Message.Type

export interface Principal {
  readonly id: string
  readonly editor: boolean
}

export interface SaveResult {
  readonly ok: boolean
  readonly title?: string | undefined
  readonly reason?: string | undefined
}

const Shown = Schema.Struct({
  query: Schema.String,
  draft: Schema.String,
})

const DraftAgent = Agent.forModel<Model, Principal>()

export const definition = DraftAgent.make({
  context: Projection.fromReader(Shown, model => ({ query: model.query, draft: model.draft })),
  messages: DraftAgent.expose(Message, {
    Typed: {
      name: 'set_query',
      description: 'Set the search query',
      input: Schema.Struct({ value: Schema.String }),
      toMessage: ({ value }) => ({ value }),
    },
    Cleared: {
      name: 'clear_search',
      description: 'Clear the search query',
      available: model => model.query !== '',
      input: Schema.Struct({}),
      toMessage: () => ({}),
    },
    Toggled: {
      name: 'toggle',
      description: 'Toggle a flag the bridge does not bind',
    },
    RequestedSave: Agent.variant({
      name: 'save_draft',
      description: 'Save the draft',
      available: model => model.role === 'editor',
      authorize: ({ principal }) => principal.editor,
      input: Schema.Struct({ requestId: Schema.String, title: Schema.String }),
      toMessage: ({ requestId, title }) => ({ requestId, title }),
      completion: {
        success: Message.Saved,
        failure: Message.SaveFailed,
        correlate: (request, result) => request.requestId === result.requestId,
        timeout: '5 seconds',
      },
    }),
  }),
})

export const partCatalog = Agent.Ui.catalog([
  {
    id: 'search',
    label: 'Search',
    capability: 'set_query',
    fields: ['query'],
  },
  {
    id: 'search.clear',
    label: 'Clear search',
    capability: 'clear_search',
    fields: ['query'],
  },
  {
    id: 'draft.save',
    label: 'Save',
    capability: 'save_draft',
    fields: ['draft'],
  },
])

export const initial = (role: 'viewer' | 'editor' = 'editor'): Model => ({
  role,
  query: 'q-value',
  draft: 'draft-secret',
  token: 'sekret-token',
  toggled: false,
  operations: [],
})

export const operationOf = (model: Model, requestId: string): Save | undefined =>
  model.operations.find(item => item.requestId === requestId)

const put = (model: Model, save: Save): Model =>
  modifyFields(model, {
    operations: operations => [
      ...operations.filter(item => item.requestId !== save.requestId),
      save,
    ],
  })

export interface DraftApp {
  readonly events: Array<{ readonly requestId: string; readonly tag: string }>
  readonly messages: string[]
  readonly init: () => { readonly model: Model }
  readonly update: (model: Model, message: Message) => Update.Return<Model, Message>
  readonly settle: (requestId: string, result: SaveResult) => void
}

/** A fresh Model, update, and the gates the save command waits on. */
export const makeDraftApp = (role: 'viewer' | 'editor' = 'editor'): DraftApp => {
  const events: DraftApp['events'] = []
  const messages: string[] = []
  const waiting = new Map<string, Promise<SaveResult>>()
  const resume = new Map<string, (result: SaveResult) => void>()
  const model0 = initial(role)

  const Accept = Command.define('AcceptSave', {
    args: { requestId: Schema.String, title: Schema.String },
    messages: [Message.AcceptedSave],
    execute: ({ requestId, title }) => Effect.succeed(Message.AcceptedSave({ requestId, title })),
  })
  const Start = Command.define('StartSave', {
    args: { requestId: Schema.String, title: Schema.String },
    messages: [Message.StartedSave],
    execute: ({ requestId, title }) => Effect.succeed(Message.StartedSave({ requestId, title })),
  })
  const Finish = Command.define('FinishSave', {
    args: { requestId: Schema.String, title: Schema.String },
    messages: [Message.Saved, Message.SaveFailed],
    execute: ({ requestId, title }) =>
      Effect.flatMap(
        Effect.promise(() => {
          const pending = waiting.get(requestId)
          if (pending === undefined) return Promise.resolve({ ok: false, reason: 'missing' })
          return pending
        }),
        result =>
          Effect.succeed(
            result.ok
              ? Message.Saved({ requestId, title: result.title ?? title })
              : Message.SaveFailed({ requestId, reason: result.reason ?? 'failed' }),
          ),
      ),
  })

  const stage = (requestId: string, tag: string, model: Model): Model => {
    events.push({ requestId, tag })
    return model
  }

  const update = (model: Model, message: Message): Update.Return<Model, Message> => {
    messages.push(message._tag)
    return Message.match(message, {
      Typed: ({ value }) =>
        value === model.query ? { model } : { model: modifyFields(model, { query: () => value }) },
      Cleared: () =>
        model.query === '' ? { model } : { model: modifyFields(model, { query: () => '' }) },
      Toggled: () => ({ model: modifyFields(model, { toggled: value => !value }) }),
      DraftChanged: ({ value }) =>
        value === model.draft ? { model } : { model: modifyFields(model, { draft: () => value }) },
      RequestedSave: ({ requestId, title }) => ({
        model: stage(requestId, 'Requested', put(model, Save.Requested({ requestId, title }))),
        commands: [Accept({ requestId, title })],
      }),
      AcceptedSave: ({ requestId, title }) => ({
        model: stage(requestId, 'Accepted', put(model, Save.Accepted({ requestId, title }))),
        commands: [Start({ requestId, title })],
      }),
      StartedSave: ({ requestId, title }) => {
        let settle: (result: SaveResult) => void = () => {}
        const pending = new Promise<SaveResult>(resolve => {
          settle = resolve
        })
        waiting.set(requestId, pending)
        resume.set(requestId, settle)
        return {
          model: stage(requestId, 'Pending', put(model, Save.Pending({ requestId, title }))),
          commands: [Finish({ requestId, title })],
        }
      },
      Saved: ({ requestId, title }) => ({
        model: stage(requestId, 'Succeeded', put(model, Save.Succeeded({ requestId, title }))),
      }),
      SaveFailed: ({ requestId, reason }) => {
        const current = model.operations.find(item => item.requestId === requestId)
        return {
          model: stage(
            requestId,
            'Failed',
            put(model, Save.Failed({ requestId, title: current?.title ?? '', reason })),
          ),
        }
      },
    })
  }

  return {
    events,
    messages,
    init: () => ({ model: model0 }),
    update,
    settle: (requestId, result) => {
      const settle = resume.get(requestId)
      if (settle === undefined) throw new Error(`no save is waiting for ${requestId}`)
      settle(result)
    },
  }
}

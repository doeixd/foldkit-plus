/**
 * The shared Todo document: the contract both sides of an exchange test use.
 * Pure application code — no storage, no journal, no Node modules — so a
 * worker bundle served by miniflare can import it too.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { Sync, documentId } from '../../src/index.js'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.NonEmptyString })
const Model = Schema.Struct({ todos: Schema.Array(Todo) })
type Model = typeof Model.Type
export const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.NonEmptyString },
})
export type Message = typeof Message.Type
const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    CreatedTodo: ({ id, title }) => ({ model: { todos: [...model.todos, { id, title }] } }),
  })
export const App = Surface.application({ Model, Message, initial: { todos: [] }, update })
export const Todos: Sync<Message, Model> = Sync.forApplication(App).make({
  documentId: documentId('todos'),
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo]),
})

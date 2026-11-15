/**
 * A law is typed over the shared fields alone, and its id is a key of
 * `contract.laws`. Type-checked but not executed.
 */
import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { documentId, forApplication, type DeclaredLaw } from '../src/index.js'
import { reaction } from '../src/journal.js'

const Model = Schema.Struct({ todos: Schema.Array(Schema.String), filter: Schema.String })
const Message = defineMessageUnion({ CreatedTodo: { id: Schema.String } })
const update = (model: typeof Model.Type, _message: typeof Message.Type) => ({ model })
const App = Surface.application({ Model, Message, initial: { todos: [], filter: '' }, update })
const options = {
  documentId: documentId('todos'),
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo]),
}

const Capped = forApplication(App).make({
  ...options,
  laws: {
    atMost100: {
      holds: ({ before, after }) => after.todos.length <= Math.max(100, before.todos.length),
      message: 'A list holds 100 todos',
      path: ['todos'],
    },
  },
})
const _law: DeclaredLaw<'atMost100'> = Capped.laws.atMost100
const _judged: Option.Option<DeclaredLaw<'atMost100'>> = Capped.judge({ todos: [] }, { todos: [] })
// @ts-expect-error no law of that id was declared
void Capped.laws.atMost50

// No laws: none to name.
const Plain = forApplication(App).make(options)
// @ts-expect-error a contract without laws names none
void Plain.laws.atMost100

forApplication(App).make({
  ...options,
  laws: {
    // @ts-expect-error `filter` is a local field: a law reads the shared fields alone
    reads: { holds: ({ after }) => after.filter === '', message: 'm' },
  },
})

forApplication(App).make({
  ...options,
  laws: {
    // @ts-expect-error a path names shared fields only
    names: { holds: () => true, message: 'm', path: ['filter'] },
  },
})

forApplication(App).make({
  ...options,
  laws: {
    // @ts-expect-error `holds` answers a boolean
    answers: { holds: () => 'yes', message: 'm' },
  },
})

// A contract with laws is one a reaction takes.
void reaction(Capped, { name: 'r', on: options.durable, run: () => Effect.void })
void _law
void _judged

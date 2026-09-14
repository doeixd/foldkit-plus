/**
 * `Sync` is a value namespace and a type of the same name, the way
 * `Effect.Effect` is. Type-checked but not executed.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, Sync } from '../src/index.js'

const Model = Schema.Struct({ todos: Schema.Array(Schema.String) })
const Message = defineMessageUnion({ CreatedTodo: { id: Schema.String } })
const App = Surface.application({
  Model,
  Message,
  initial: { todos: [] },
  update: (model: typeof Model.Type) => ({ model }),
})

// The namespace carries the exported functions, so inference is unchanged by it.
const TodoSync = Sync.forApplication(App).make({
  documentId: DocumentId.make('todos'),
  shared: Projection.pick(App.fields.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo]),
})

const Renamed = Schema.Struct({ _tag: Schema.Literal('Renamed'), title: Schema.String })
const Shared = Schema.Struct({ titles: Schema.Array(Schema.String) })

// `Sync` the type names what `Sync.define` returns.
const contract: Sync<typeof Renamed.Type, typeof Shared.Type> = Sync.define({
  documentId: DocumentId.make('todos'),
  message: Renamed,
  shared: Shared,
  empty: { titles: [] },
  durable: () => true,
  replay: (shared, message) => ({ titles: [...shared.titles, message.title] }),
})

// @ts-expect-error a branded id is not a bare string
const _bad: DocumentId = 'todos'

Sync.define({
  documentId: DocumentId.make('todos'),
  message: Renamed,
  shared: Shared,
  empty: { titles: [] },
  durable: () => true,
  // @ts-expect-error `replay` must return the shared shape
  replay: shared => ({ titles: shared.titles.length }),
})

void TodoSync
void contract
void _bad

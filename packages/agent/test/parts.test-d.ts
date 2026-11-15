/**
 * Compile-time expectations for parts. Type-checked, not executed: every
 * `@ts-expect-error` must stay an error.
 */
import { Schema } from 'effect'
import { Agent } from '../src/index.js'
import { Projection, Surface } from 'foldkit-surface'
import { Message, Model } from './todoApp.js'

const App = Surface.application({ Model, Message })
const TodoAgent = Agent.forApplication(App)

const AppAgent = TodoAgent.make({
  context: Projection.pick(App.model.todos, App.model.selectedTodoId),
  messages: TodoAgent.expose(Message, {
    RequestedCreateTodo: 'Create a todo',
    RequestedDeleteTodo: 'Delete a todo',
  }),
})

const Parts = TodoAgent.parts(AppAgent, {
  selected: Agent.part({ label: 'Selected todo', role: 'status', field: 'selectedTodoId' }),
  create: Agent.part({ label: 'New todo', role: 'button', invokes: Message.RequestedCreateTodo }),
  remove: Agent.part({
    role: 'button',
    invokes: Message.RequestedDeleteTodo,
    // The projected context, typed from the definition.
    each: context => context.todos,
    key: todo => todo.id,
    label: todo => `Delete ${todo.title}`,
    input: todo => ({ id: todo.id }),
  }),
})

// The free function infers the same from the definition.
Agent.parts(AppAgent, {
  create: Agent.part({ label: 'New todo', role: 'button', invokes: Message.RequestedCreateTodo }),
})

TodoAgent.parts(AppAgent, {
  // @ts-expect-error `RequestedRenameTodo` is not exposed.
  rename: Agent.part({ label: 'Rename', role: 'button', invokes: Message.RequestedRenameTodo }),
})

TodoAgent.parts(AppAgent, {
  // @ts-expect-error the context does not project `lastError`.
  error: Agent.part({ label: 'Error', role: 'alert', field: 'lastError' }),
})

TodoAgent.parts(AppAgent, {
  remove: Agent.part({
    role: 'button',
    invokes: Message.RequestedDeleteTodo,
    each: context => context.todos,
    key: todo => todo.id,
    label: 'Delete',
    // @ts-expect-error the capability takes `{ id }`, not `{ todoId }`.
    input: todo => ({ todoId: todo.id }),
  }),
})

TodoAgent.parts(AppAgent, {
  remove: Agent.part({
    role: 'button',
    each: context => context.todos,
    // @ts-expect-error a todo has no `name`.
    key: todo => todo.name,
    label: 'Delete',
  }),
})

TodoAgent.parts(AppAgent, {
  // @ts-expect-error `sets` names the capability that changes a `field`, so it needs one.
  create: Agent.part({ label: 'New', role: 'textbox', sets: Message.RequestedCreateTodo }),
})

TodoAgent.parts(AppAgent, {
  // @ts-expect-error a label is text unless the part is repeated.
  create: Agent.part({ label: () => 'New', role: 'button', invokes: Message.RequestedCreateTodo }),
})

TodoAgent.parts(AppAgent, {
  // @ts-expect-error a role is an ARIA role.
  create: Agent.part({ label: 'New', role: 'clicky', invokes: Message.RequestedCreateTodo }),
})

declare const h: Parameters<typeof Parts.attributes>[0]
Parts.attributes(h, 'create')
Parts.attributes(h, 'remove', 't1')
// @ts-expect-error a repeated part's occurrence needs its key.
Parts.attributes(h, 'remove')
// @ts-expect-error a part drawn once has no occurrence key.
Parts.attributes(h, 'create', 't1')
// @ts-expect-error no part is declared `rename`.
Parts.attributes(h, 'rename')

// A definition without a context has no field to name.
const NoContext = Agent.forModel<Model>()
const Bare = NoContext.make({ messages: NoContext.expose(Message, { ClearedSelection: 'Clear' }) })
NoContext.parts(Bare, {
  // @ts-expect-error there is no context, so no field.
  todos: Agent.part({ label: 'Todos', role: 'list', field: 'todos' }),
})
NoContext.parts(Bare, {
  // @ts-expect-error there is no context, so nothing to repeat over.
  rows: Agent.part({
    role: 'row',
    each: (model: Model) => model.todos,
    key: (todo: { readonly id: string }) => todo.id,
    label: 'Row',
  }),
})

TodoAgent.bind({
  definition: AppAgent,
  host: {
    model: () => Schema.decodeUnknownSync(Model)({ todos: [], selectedTodoId: { _tag: 'None' } }),
    dispatch: () => {},
  },
  parts: Parts,
})

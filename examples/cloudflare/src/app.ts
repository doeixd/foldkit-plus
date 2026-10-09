/**
 * The page: a Remote list of todos, a form to add one, and an editor to
 * rename one. Writes are Remote mutations. Each one paints before the request
 * returns (`Data.mutate`'s optimistic layers). The list's own view says
 * "Loading…" until the first page arrives.
 *
 * Sync still owns the Durable Object journal. This page does not speak it.
 */
import { Effect, Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import { Crud } from 'foldkit-crud'
import { Style } from 'foldkit-mixins'
import { FieldSlots, FormSlots, FormView, type FieldInput } from 'foldkit-mixins-form'
import { ticks } from 'foldkit-primitives/time'
import { ConnectionChange, Remote, type RemoteClient } from 'foldkit-remote'
import * as Subscription from 'foldkit/subscription'
import { modifyFields } from 'foldkit/struct'
import { Surface } from 'foldkit-surface'
import { Todo, TodoRow } from './domain.js'
import { AddTodoForm, RenameTodoForm } from './forms.js'
import { AllTodos, CreateTodo, DeleteTodo, RenameTodo, ToggleTodo } from './operations.js'

const field = Style.attach(
  Style.forSlots(FieldSlots)({
    root: Style.class('field'),
    text: Style.whenInput<FieldInput>(input => input.invalid, Style.class('is-invalid')),
    error: Style.class('field-error'),
  }),
)
const form = Style.attach(Style.forSlots(FormSlots)({ root: Style.class('form') }))

const AddView = FormView.define(AddTodoForm, {
  field: FormView.field(AddTodoForm).pipe(field),
}).pipe(form)
const RenameView = FormView.define(RenameTodoForm, {
  field: FormView.field(RenameTodoForm).pipe(field),
}).pipe(form)

const AddBundle = AddTodoForm.bundle.pipe(Bundle.withView(FormView.submodel(AddTodoForm, AddView)))

const Editor = Crud.editor('TodoEditor', { form: RenameTodoForm, mutation: RenameTodo })
const EditorBundle = Editor.bundle.pipe(
  Bundle.withView(Crud.editorView(FormView.submodel(RenameTodoForm, RenameView))),
)

/** The name sent as `x-actor`. One tab, one stored name. */
export const ACTOR_KEY = 'foldkit-actor'

const Base = Bundle.compose({
  remote: Remote.Model,
  notice: Schema.Option(Schema.String),
  actor: Schema.String,
  actorDraft: Schema.String,
}).pipe(
  Bundle.withMessages({
    ...Remote.messages,
    OpenedTodo: { id: Schema.String },
    ClosedEditor: {},
    ToggledTodo: { id: Schema.String, title: Schema.String, done: Schema.Literals([0, 1]) },
    RemovedTodo: { id: Schema.String },
    RequestedMoreTodos: {},
    RetriedTodos: {},
    CompletedFocusTodos: {},
    Ticked: {},
    DismissedNotice: {},
    ActorEdited: { name: Schema.String },
    ActorCommitted: {},
  }),
  Bundle.withChild('add', AddBundle),
  Bundle.withChild('rename', EditorBundle),
)

export const Model = Base.Model
export type Model = typeof Model.Type
export const Message = Base.Message
export type Message = typeof Message.Type

export const App = Surface.application(Base)

export const Data = Remote.make({
  model: App.model.remote,
  entities: [Todo],
  queries: [AllTodos],
  mutations: [CreateTodo, RenameTodo, ToggleTodo, DeleteTodo],
})

const Listed = Crud.list('Todos', { query: AllTodos, selection: TodoRow, pageSize: 100 })
export type TodoItem = typeof Listed.Row
export const Todos = Listed.at({
  data: Data,
  input: () => Option.some({}),
})

export const Rename = Editor.at({ data: Data, model: App.model.rename })

const remoteWiring = Data.wiring(Crud.actives({ todos: Todos, editor: Rename }))

/**
 * Remote's wiring reduces its own Messages, so the page's `update` never sees
 * them. A successful write is asked for again: the list is ordered by title,
 * and the optimistic insert only sat at the front until the server answered.
 * A failure keeps the server's words. Pending overlays stay through the refresh.
 */
const routeRemote = (model: Model, message: Message) => {
  if (!Remote.reduces(message)) return Option.none()
  const route = remoteWiring.route
  if (route === undefined) return Option.none()
  const reduced = route(model, message)
  if (Option.isNone(reduced)) return reduced
  switch (message._tag) {
    case 'MutationSucceeded':
      return Option.some({
        ...reduced.value,
        model: Todos.refresh(modifyFields(reduced.value.model, { notice: () => Option.none() })),
      })
    case 'MutationFailed':
      return Option.some({
        ...reduced.value,
        model: modifyFields(reduced.value.model, {
          notice: () => Option.some(message.error.message),
        }),
      })
    default:
      return reduced
  }
}

const Page = Base.pipe(
  Bundle.withServices<RemoteClient>(),
  Bundle.configure('add', {
    onOut:
      ({ value }) =>
      model => {
        const id = crypto.randomUUID()
        const started = Data.mutate(
          model,
          CreateTodo,
          { id, title: value.title },
          {
            optimistic: [
              Remote.patch(Todo, id, { id, title: value.title, done: 0 }),
              ConnectionChange.prepend(AllTodos.ref({}), Remote.ref(Todo, id)),
            ],
          },
        )
        return {
          model: modifyFields(started.model, {
            add: () => AddTodoForm.initial,
            notice: () => Option.none(),
          }),
          commands: [started.command],
        }
      },
  }),
  Bundle.configure('rename', {
    // The editor's own `onOut` mutates without an optimistic patch. This one
    // paints the new title, then remembers the request so `status` reads Saving.
    onOut:
      ({ value }) =>
      model => {
        const started = Data.mutate(model, RenameTodo, value, {
          optimistic: [Remote.patch(Todo, value.id, { id: value.id, title: value.title })],
        })
        return {
          model: modifyFields(started.model, {
            rename: editor => ({ ...editor, requestId: started.requestId }),
            notice: () => Option.none(),
          }),
          commands: [started.command],
        }
      },
  }),
  Bundle.withWiring({ ...remoteWiring, route: routeRemote }),
)

export const AddForm = Page.children.add
export const RenameForm = Page.children.rename
export const placements = Page.placements

/** Focus the list once a retry has taken the button off the page. */
const FocusTodos = Command.define('FocusTodos', {
  messages: [Message.CompletedFocusTodos],
  execute: Dom.focus('#Todos', { makeFocusable: true }).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusTodos()),
  ),
})

const storedActor = (name: string): string => {
  const trimmed = name.trim()
  return trimmed.length === 0 ? 'anon' : trimmed
}

// Child Messages and Remote's Messages are routed before this runs. What
// remains is the page's own.
export const update = Rename.after(
  placements.update((model, message) => {
    switch (message._tag) {
      case 'OpenedTodo':
        return RenameForm.helpers.open(message.id)(model)
      case 'ClosedEditor':
        return RenameForm.helpers.close()(model)
      case 'ToggledTodo': {
        const done = message.done === 1 ? 0 : 1
        const started = Data.mutate(
          model,
          ToggleTodo,
          { id: message.id, done },
          {
            optimistic: [
              Remote.patch(Todo, message.id, { id: message.id, title: message.title, done }),
            ],
          },
        )
        return {
          model: modifyFields(started.model, { notice: () => Option.none() }),
          commands: [started.command],
        }
      }
      case 'RemovedTodo': {
        const started = Data.mutate(
          model,
          DeleteTodo,
          { id: message.id },
          {
            optimistic: [ConnectionChange.remove(AllTodos.ref({}), Remote.ref(Todo, message.id))],
          },
        )
        const closed =
          Rename.target(started.model) === message.id
            ? RenameForm.helpers.close()(started.model).model
            : started.model
        return {
          model: modifyFields(closed, { notice: () => Option.none() }),
          commands: [started.command],
        }
      }
      case 'RequestedMoreTodos':
        return { model: Option.getOrElse(Todos.more(model), () => model) }
      case 'RetriedTodos':
        return { model: Todos.refresh(model), commands: [FocusTodos()] }
      case 'Ticked':
        return { model: Todos.refresh(model) }
      case 'DismissedNotice':
        return { model: modifyFields(model, { notice: () => Option.none() }) }
      case 'ActorEdited':
        return { model: modifyFields(model, { actorDraft: () => message.name }) }
      case 'ActorCommitted': {
        const actor = storedActor(model.actorDraft)
        if (actor === model.actor) {
          return { model: modifyFields(model, { actorDraft: () => actor }) }
        }
        sessionStorage.setItem(ACTOR_KEY, actor)
        return {
          model: Todos.refresh(
            Data.forget(
              modifyFields(model, {
                actor: () => actor,
                actorDraft: () => actor,
                notice: () => Option.none(),
              }),
            ),
          ),
        }
      }
      default:
        return { model }
    }
  }),
)

/**
 * The other tab's new rows. A query subscription is not live, and the worker
 * can only patch ids that this request already subscribed to, so the list
 * asks again on a clock. The first tick is one interval after start.
 */
export const subscriptions = Subscription.make<Model, Message>()(() => ({
  refresh: ticks({
    intervalMs: () => Option.some(1000),
    onTick: () => Message.Ticked(),
  }),
}))

export const initial = (actor: string): Model =>
  placements.initial({
    remote: Remote.initial,
    notice: Option.none(),
    actor,
    actorDraft: actor,
  }).model

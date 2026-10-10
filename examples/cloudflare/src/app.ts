/**
 * The page: a Remote list of todos, a form to add one, and an editor to
 * rename one. Writes are Remote mutations. Each one paints before the request
 * returns (`Data.mutate`'s optimistic layers). The first visit says
 * "Loading…" until the page arrives. A later visit paints the rows stored
 * for this actor, then asks again.
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
import { ConnectionChange, Remote, type RemoteClient } from 'foldkit-remote'
import { modifyFields } from 'foldkit/struct'
import { Surface, type Projection } from 'foldkit-surface'
import { LIST_WATCH, cacheKey, snapshotFor } from './cache.js'
import { Todo, TodoRow } from './domain.js'
import { AddTodoForm, RenameTodoForm } from './forms.js'
import {
  AllTodos,
  CreateTodo,
  DeleteTodo,
  RenameTodo,
  TODO_PAGE_SIZE,
  ToggleTodo,
} from './operations.js'

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

const Listed = Crud.list('Todos', {
  query: AllTodos,
  selection: TodoRow,
  pageSize: TODO_PAGE_SIZE,
})
export type TodoItem = typeof Listed.Row
export const Todos = Listed.at({
  data: Data,
  input: () => Option.some({}),
})

export const Rename = Editor.at({ data: Data, model: App.model.rename })

/**
 * One stable row the live stream subscribes to. The id is not a todo, and the
 * requirements do not follow the list, so a local edit does not restart the
 * stream. A restart that invalidated the list was the blink. The worker diffs
 * the list inside that one request.
 */
const sentinel: Projection<Model, unknown> = {
  Model: Schema.Unknown,
  dependencies: [],
  metadata: Data.live(TodoRow, LIST_WATCH).metadata,
  read: () => undefined,
}
const LiveRows = Data.active('TodoLive', () => Option.some(sentinel))

const remoteWiring = Data.wiring({
  ...Crud.actives({ todos: Todos, editor: Rename }),
  live: LiveRows,
})

/**
 * The list kept in the browser, one snapshot per actor. A later visit paints
 * those rows and asks again. An unsent edit is not in it: Remote has no outbox.
 */
export const persistence = Data.persistence({
  key: model => cacheKey(model.actor),
  scope: model => model.actor,
  snapshot: snapshotFor,
})

/**
 * Remote's wiring reduces its own Messages, so the page's `update` never sees
 * them. A successful write's patches are the row. Asking for the list again
 * marked it busy, and that was the blink. A failure keeps the server's words.
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
        model: modifyFields(reduced.value.model, { notice: () => Option.none() }),
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
    // The editor's own save: a declared write, so it shows the new title before
    // the server answers. A rename also clears the page's notice.
    onOut: submitted => model => {
      const started = Rename.onOut(submitted)(model)
      return { ...started, model: modifyFields(started.model, { notice: () => Option.none() }) }
    },
  }),
  Bundle.withWiring({ ...remoteWiring, route: routeRemote }, persistence),
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
        // A declared write: Remote shows the new value until the server answers.
        const started = Data.mutate(model, ToggleTodo, { id: message.id, done })
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
        // The persistence wiring restores the other actor's stored rows, and
        // saves nothing for them until it has.
        return {
          model: Data.forget(
            modifyFields(model, {
              actor: () => actor,
              actorDraft: () => actor,
              notice: () => Option.none(),
            }),
          ),
        }
      }
      default:
        return { model }
    }
  }),
)

export const initial = (actor: string): Model =>
  placements.initial({
    remote: Remote.initial,
    notice: Option.none(),
    actor,
    actorDraft: actor,
  }).model

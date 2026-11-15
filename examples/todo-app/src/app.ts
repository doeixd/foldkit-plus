/**
 * The one application. Everything else in this example is derived from it.
 *
 * A human clicking a checkbox, an agent calling a tool, and a peer's committed
 * operation arriving over sync all become a `Message` and run through `update`.
 * There is no second reducer anywhere: the replica's replay, the server
 * journal's reducer, and the agent's dispatch are all this function.
 *
 * Three kinds of Message live here, and the distinction is the whole design:
 *
 * - **Durable facts** change the replicated slice (`todos`, `listTitle`). They
 *   must be state-only and deterministic, because the replica replays them and
 *   the server reduces them independently. Every nondeterministic input (an id,
 *   a timestamp) is *inside* the Message, never computed in `update`.
 *   `Sync.forApplication` enforces this: a durable Message whose transition
 *   returns a Command or touches a local field is refused at `submit`.
 * - **Effectful intents** are local Messages whose `update` returns a Command.
 *   The Command does the impure work (mint an id, read the clock) and emits the
 *   durable fact. `RequestedTodo` -> `SubmittedTodo` is the pattern.
 * - **Local Messages** change per-device UI state (draft, filter, editing) and
 *   never leave the tab.
 */
import { Clock, Effect, Option, Schema } from 'effect'
import * as Dom from 'foldkit/dom'
import { modifyFields } from 'foldkit/struct'
import { Url } from 'foldkit/url'
import { Mirror } from 'foldkit-mirror'
import { fact } from 'foldkit-sync'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'

export const Priority = Schema.Union([
  Schema.Literal('low'),
  Schema.Literal('normal'),
  Schema.Literal('high'),
])
export type Priority = typeof Priority.Type

export const Todo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  completed: Schema.Boolean,
  priority: Priority,
  /** Milliseconds since the epoch, minted by the Command that created the todo. */
  createdAt: Schema.Number,
})
export type Todo = typeof Todo.Type

/**
 * The replicated slice. Two features contribute to it (`sync.ts` declares them
 * as fragments): the list itself, and the list's own metadata.
 */
export const Shared = Schema.Struct({
  listTitle: Schema.String,
  todos: Schema.Array(Todo),
})
export type Shared = typeof Shared.Type

export const Filter = Schema.Union([
  Schema.Literal('all'),
  Schema.Literal('active'),
  Schema.Literal('completed'),
])
export type Filter = typeof Filter.Type

/** The whole Model: the shared slice plus per-device UI state. */
export const Model = Schema.Struct({
  ...Shared.fields,
  draft: Schema.String,
  filter: Filter,
  editingId: Schema.OptionFromNullOr(Schema.String),
  editDraft: Schema.String,
  lastError: Schema.OptionFromNullOr(Schema.String),
  /** The sandbox's "go offline" switch: this tab's connection, not shared state. */
  offline: Schema.Boolean,
  /** Edits the replica holds that the server has not confirmed. */
  pending: Schema.Number,
  /** The last exchange failed; the replica retries on its own. */
  syncFailed: Schema.Boolean,
  /** The todo just deleted, offered back until it expires or another is deleted. */
  undo: Schema.OptionFromNullOr(Todo),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  // --- mirrors (surface.ts): the URL and a store read back into the Model ----
  ...Mirror.messages,
  /** The browser's URL changed (a link, back, forward); the filter is read from it. */
  UrlChanged: { url: Url },
  // --- effectful intents: local, and their Command emits a durable fact -----
  /**
   * The composer was submitted. It names no title: the view's draft is the one
   * last drawn, and a key pressed before the next frame would send that older
   * draft, so `update` reads the draft from the Model it is given.
   */
  DraftSubmitted: {},
  /**
   * An agent asked for a todo. The Command mints the id and
   * the timestamp; `requestId` is the call that waits for the fact (an agent's
   * invocation), carried onto it so two requests for one title are told apart.
   * Messages cross ports and the journal as they are, so it is a plain optional
   * key rather than an `Option`.
   */
  RequestedTodo: { title: Schema.String, requestId: Schema.optionalKey(Schema.String) },
  /** The inline editor lost focus. The Command emits `RenamedTodo`; focus stays where the person went. */
  EditingCommitted: {},
  /** Enter in the inline editor: as `EditingCommitted`, and focus returns to the title. */
  EditingSubmitted: {},
  /** A row's delete: the todo is kept to offer back, and its neighbour takes focus. */
  DeleteRequested: { id: Schema.String },
  /** Puts the last deleted todo back. */
  UndoRequested: {},

  // --- durable facts: replicated, replayed, journaled ----------------------
  SubmittedTodo: {
    id: Schema.String,
    title: Schema.String,
    createdAt: Schema.Number,
    /** The request it answers, where a call waits; a fact journaled before lacks it. */
    requestId: Schema.optionalKey(Schema.String),
  },
  ToggledTodo: { id: Schema.String },
  RenamedTodo: { id: Schema.String, title: Schema.String },
  PrioritySet: { id: Schema.String, priority: Priority },
  DeletedTodo: { id: Schema.String },
  /** Undo of a delete: the todo as it was, with its id, so a retry puts it back once. */
  RestoredTodo: { todo: Todo },
  ClearedCompleted: {},
  RenamedList: { title: Schema.String },

  // --- local: this device only ---------------------------------------------
  DraftChanged: { value: Schema.String },
  FilterSelected: { filter: Filter },
  EditingStarted: { id: Schema.String },
  EditDraftChanged: { value: Schema.String },
  EditingStopped: {},
  UndoExpired: { id: Schema.String },
  OfflineSet: { offline: Schema.Boolean },
  SyncStatusChanged: { pending: Schema.Number, failed: Schema.Boolean },
  /** A focus Command finished; nothing to do. */
  CompletedFocus: {},
})
export type Message = typeof Message.Type

export const initialModel: Model = {
  listTitle: 'Todos',
  todos: [],
  draft: '',
  filter: 'all',
  editingId: Option.none(),
  editDraft: '',
  lastError: Option.none(),
  offline: false,
  pending: 0,
  syncFailed: false,
  undo: Option.none(),
}

type Return = Update.Return<Model, Message>

/** Mints what a durable fact needs and cannot compute itself: an id and a time. */
const mintTodo = (title: string, request: { readonly requestId?: string }) => ({
  name: 'MintTodo',
  effect: Effect.map(Clock.currentTimeMillis, createdAt =>
    Message.SubmittedTodo({ id: crypto.randomUUID(), title, createdAt, ...request }),
  ),
})

const focusSelector = (selector: string) => ({
  name: 'Focus',
  effect: Dom.focus(selector).pipe(Effect.ignore, Effect.as(Message.CompletedFocus())),
})

/** The title button's id: where focus returns after an edit, a delete or an undo. */
export const titleId = (id: string): string => `todo-title-${id}`
export const COMPOSER_ID = 'new-todo'
const focusTitle = (id: string) => focusSelector(`[id="${titleId(id)}"]`)

/** How long a deleted todo stays offered back. */
const UNDO_FOR = '8 seconds'

const nextPriority: Record<Priority, Priority> = { low: 'normal', normal: 'high', high: 'low' }

/**
 * What the mirrors do with their two Messages. They live in `surface.ts`,
 * beside the `App` they are declared over, so `update` takes them as an
 * argument instead of importing them: the Model, the Message union, and the
 * reducer stay the leaves of the import graph.
 */
export type MirrorReducer = (model: Model, message: Message) => Model

export const makeUpdate =
  (mirrors: MirrorReducer) =>
  (model: Model, message: Message): Return =>
    Message.match<Return>(message, {
      // Mirrors: the URL and the store are read back into the Model.
      UrlChanged: () => ({ model: mirrors(model, message) }),
      MirrorRestored: () => ({ model: mirrors(model, message) }),
      // Intents. Note that each one clears its *local* state here, in the local
      // transition; the durable fact it causes never touches local fields.
      DraftSubmitted: () =>
        model.draft.trim() === ''
          ? { model }
          : {
              model: modifyFields(model, { draft: () => '' }),
              commands: [mintTodo(model.draft.trim(), {})],
            },
      // An agent's request leaves the person's draft as it is.
      RequestedTodo: ({ title, requestId }) =>
        title.trim() === ''
          ? { model }
          : {
              model,
              commands: [mintTodo(title.trim(), requestId === undefined ? {} : { requestId })],
            },
      EditingCommitted: () => commitEdit(model),
      EditingSubmitted: () => {
        const committed = commitEdit(model)
        return Option.match(model.editingId, {
          onNone: () => committed,
          onSome: id => ({
            ...committed,
            commands: [...(committed.commands ?? []), focusTitle(id)],
          }),
        })
      },
      DeleteRequested: ({ id }) => {
        const todo = model.todos.find(candidate => candidate.id === id)
        if (todo === undefined) return { model }
        const rows = visibleTodos(model)
        const at = rows.findIndex(row => row.id === id)
        const neighbour = rows[at + 1] ?? rows[at - 1]
        return {
          model: modifyFields(model, { undo: () => Option.some(todo) }),
          commands: [
            fact(Message.DeletedTodo({ id })),
            neighbour === undefined ? focusSelector(`#${COMPOSER_ID}`) : focusTitle(neighbour.id),
            {
              name: 'ExpireUndo',
              effect: Effect.sleep(UNDO_FOR).pipe(Effect.as(Message.UndoExpired({ id }))),
            },
          ],
        }
      },
      // The fact is applied within this transition (`fact`), so the todo is
      // drawn again before focus looks for it.
      UndoRequested: () =>
        Option.match(model.undo, {
          onNone: () => ({ model }),
          onSome: todo => ({
            model: modifyFields(model, { undo: () => Option.none() }),
            commands: [fact(Message.RestoredTodo({ todo })), focusTitle(todo.id)],
          }),
        }),

      // Durable facts: pure over the shared slice, idempotent where a retry could
      // deliver one twice.
      SubmittedTodo: ({ id, title, createdAt }) => ({
        model: modifyFields(model, {
          todos: () =>
            model.todos.some(todo => todo.id === id)
              ? model.todos
              : [...model.todos, { id, title, completed: false, priority: 'normal', createdAt }],
        }),
      }),
      RestoredTodo: ({ todo }) =>
        model.todos.some(({ id }) => id === todo.id)
          ? { model }
          : { model: modifyFields(model, { todos: () => [...model.todos, todo] }) },
      ToggledTodo: ({ id }) => ({
        model: modifyFields(model, {
          todos: () =>
            model.todos.map(todo =>
              todo.id === id ? { ...todo, completed: !todo.completed } : todo,
            ),
        }),
      }),
      RenamedTodo: ({ id, title }) => ({
        model: modifyFields(model, {
          todos: () => model.todos.map(todo => (todo.id === id ? { ...todo, title } : todo)),
        }),
      }),
      PrioritySet: ({ id, priority }) => ({
        model: modifyFields(model, {
          todos: () => model.todos.map(todo => (todo.id === id ? { ...todo, priority } : todo)),
        }),
      }),
      DeletedTodo: ({ id }) => ({
        model: modifyFields(model, { todos: () => model.todos.filter(todo => todo.id !== id) }),
      }),
      ClearedCompleted: () => ({
        model: modifyFields(model, { todos: () => model.todos.filter(todo => !todo.completed) }),
      }),
      RenamedList: ({ title }) =>
        title.trim() === ''
          ? { model }
          : { model: modifyFields(model, { listTitle: () => title.trim() }) },

      // Local.
      DraftChanged: ({ value }) => ({ model: modifyFields(model, { draft: () => value }) }),
      FilterSelected: ({ filter }) => ({ model: modifyFields(model, { filter: () => filter }) }),
      EditingStarted: ({ id }) => ({
        model: modifyFields(model, {
          editingId: () => Option.some(id),
          editDraft: () => model.todos.find(todo => todo.id === id)?.title ?? '',
        }),
      }),
      EditDraftChanged: ({ value }) => ({ model: modifyFields(model, { editDraft: () => value }) }),
      EditingStopped: () => ({
        model: modifyFields(model, { editingId: () => Option.none(), editDraft: () => '' }),
        commands: Option.match(model.editingId, {
          onNone: () => [],
          onSome: id => [focusTitle(id)],
        }),
      }),
      UndoExpired: ({ id }) =>
        Option.exists(model.undo, todo => todo.id === id)
          ? { model: modifyFields(model, { undo: () => Option.none() }) }
          : { model },
      OfflineSet: ({ offline }) =>
        offline === model.offline
          ? { model }
          : { model: modifyFields(model, { offline: () => offline }) },
      SyncStatusChanged: ({ pending, failed }) =>
        pending === model.pending && failed === model.syncFailed
          ? { model }
          : { model: modifyFields(model, { pending: () => pending, syncFailed: () => failed }) },
      CompletedFocus: () => ({ model }),
    })

/** An edit's end: the title is renamed through a fact unless it came out empty or the todo is gone. */
const commitEdit = (model: Model): Return => {
  if (Option.isNone(model.editingId)) return { model }
  const id = model.editingId.value
  const title = model.editDraft.trim()
  const stopped = modifyFields(model, { editingId: () => Option.none(), editDraft: () => '' })
  if (title === '' || model.todos.every(todo => todo.id !== id)) return { model: stopped }
  return {
    model: stopped,
    commands: [{ name: 'Rename', effect: Effect.succeed(Message.RenamedTodo({ id, title })) }],
  }
}

export type SyncState = 'synced' | 'saving' | 'offline' | 'retrying'

/** What the connection strip says: where the replica stands against the server. */
export const syncState = (model: Pick<Model, 'offline' | 'pending' | 'syncFailed'>): SyncState => {
  if (model.offline) return 'offline'
  if (model.syncFailed) return 'retrying'
  return model.pending > 0 ? 'saving' : 'synced'
}

/** The priority a click on the badge moves to. Derived, so the view stays dumb. */
export const bumpPriority = (priority: Priority): Priority => nextPriority[priority]

const rank: Record<Priority, number> = { high: 0, normal: 1, low: 2 }

/** The todos under the filter, highest priority first, then oldest first. */
export const visibleTodos = (model: Pick<Model, 'todos' | 'filter'>): ReadonlyArray<Todo> => {
  const wanted = model.filter === 'all' ? undefined : model.filter === 'completed'
  return model.todos
    .filter(todo => wanted === undefined || todo.completed === wanted)
    .sort((a, b) => rank[a.priority] - rank[b.priority] || a.createdAt - b.createdAt)
}

/** Counts for the header, the footer, and the agent. */
export const counts = (
  model: Pick<Model, 'todos'>,
): { readonly total: number; readonly active: number; readonly completed: number } => ({
  total: model.todos.length,
  active: model.todos.filter(todo => !todo.completed).length,
  completed: model.todos.filter(todo => todo.completed).length,
})

/**
 * What each Message writes to the Model, and the records it emits for the
 * Commands `update` (`app.ts`) runs: every Message of the application is
 * declared here. `update` runs these Transitions, so each change is written
 * once, and `foldkit-surface/writes` reads the same declaration to draw a
 * Surface again only when a Message writes a field it reads.
 *
 * - List edits are ways of writing a list: `Transition.insert` adds a todo
 *   unless one has its id, `patch` changes the todo with an id, `remove` and
 *   `removeWhere` take todos out. A key no todo has changes nothing, and the
 *   step gives back the Model it was given.
 * - A path to an `Option` field reads as its value or null, and a write of
 *   null stores `Option.none()`.
 * - `emits` lists the records a step hands to `update`, read over the Model
 *   before the step; `app.ts` turns each into its Command (a focus, a timer,
 *   a durable fact).
 * - A new todo's id and time are `supplied`: made once when its Message runs
 *   (`surface.ts`) and sent on in the durable `SubmittedTodo` fact, so a
 *   replay and the server see the same values.
 * - `UrlChanged` and `MirrorRestored` are the mirrors' own steps (`surface.ts`
 *   passes them in): ordinary code, declared by what it reads and writes
 *   (`Transition.opaque`).
 */
import { Schema } from 'effect'
import { Arr, Bool, Eq, Null, Str, Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import type { MirrorRestored } from 'foldkit-mirror'
import type { Url } from 'foldkit/url'
import { Message, Model } from './app.js'

/** What a new todo is supplied when its Message runs (`surface.ts` makes them): its id and time. */
const newTodo = { id: Schema.String, now: Schema.Number }

/** Whether `text` holds anything once its edges are trimmed. */
const filled = (text: Parameters<typeof Str.trim>[0]) => Eq.isNot(Str.trim(text), '')

/**
 * An edit's end, where one is going on (otherwise nothing changes). The
 * rename reads the edit the same step ends: a todo still there, a title not
 * empty once trimmed. With `focus`, focus returns to the title.
 */
const endsEdit = <I extends Schema.Top>(input: I, focus: boolean) =>
  Transition.make({
    state: Model,
    input,
    when: ({ state }) => Eq.isNot(state.editingId, null),
    apply: ({ state }) => [
      Transition.set(state.editingId, null),
      Transition.set(state.editDraft, ''),
    ],
    emits: ({ state }) => [
      Transition.emit(
        'Rename',
        { id: state.editingId, title: Str.trim(state.editDraft) },
        {
          when: Bool.and(
            filled(state.editDraft),
            Arr.any(state.todos, todo => Eq.equals(state.editingId, todo.id)),
          ),
        },
      ),
      Transition.emit('Focus', { id: state.editingId }, { when: focus }),
    ],
  })

export const transitions = {
  DraftChanged: Transition.make({
    state: Model,
    input: Message.DraftChanged,
    apply: ({ state, input }) => [Transition.set(state.draft, input.value)],
  }),
  FilterSelected: Transition.make({
    state: Model,
    input: Message.FilterSelected,
    apply: ({ state, input }) => [Transition.set(state.filter, input.filter)],
  }),
  EditDraftChanged: Transition.make({
    state: Model,
    input: Message.EditDraftChanged,
    apply: ({ state, input }) => [Transition.set(state.editDraft, input.value)],
  }),
  OfflineSet: Transition.make({
    state: Model,
    input: Message.OfflineSet,
    apply: ({ state, input }) => [Transition.set(state.offline, input.offline)],
  }),
  SyncStatusChanged: Transition.make({
    state: Model,
    input: Message.SyncStatusChanged,
    apply: ({ state, input }) => [
      Transition.set(state.pending, input.pending),
      Transition.set(state.syncFailed, input.failed),
    ],
  }),
  // The inline editor lost focus: focus stays where the person went.
  EditingCommitted: endsEdit(Message.EditingCommitted, false),
  // Enter in the inline editor: focus returns to the title.
  EditingSubmitted: endsEdit(Message.EditingSubmitted, true),
  // Unlike the two above it clears whatever is there, even with nothing edited.
  EditingStopped: Transition.make({
    state: Model,
    input: Message.EditingStopped,
    apply: ({ state }) => [
      Transition.set(state.editingId, null),
      Transition.set(state.editDraft, ''),
    ],
    emits: ({ state }) => [
      Transition.emit('Focus', { id: state.editingId }, { when: Null.isNotNull(state.editingId) }),
    ],
  }),
  EditingStarted: Transition.make({
    state: Model,
    input: Message.EditingStarted,
    apply: ({ state, input }) => [
      Transition.set(state.editingId, input.id),
      Transition.set(
        state.editDraft,
        Null.coalesce(
          Arr.find(
            state.todos,
            todo => Eq.is(todo.id, input.id),
            todo => todo.title,
          ),
          '',
        ),
      ),
    ],
  }),
  // The composer's draft becomes a todo, with the id and time it is supplied.
  DraftSubmitted: Transition.make({
    state: Model,
    input: Message.DraftSubmitted,
    supplied: newTodo,
    when: ({ state }) => filled(state.draft),
    apply: ({ state }) => [Transition.set(state.draft, '')],
    emits: ({ state, supplied }) => [
      Transition.emit('Submit', {
        id: supplied.id,
        title: Str.trim(state.draft),
        createdAt: supplied.now,
        requestId: null,
      }),
    ],
  }),
  // An agent's request leaves the person's draft as it is.
  RequestedTodo: Transition.make({
    state: Model,
    input: Message.RequestedTodo,
    supplied: newTodo,
    when: ({ input }) => filled(input.title),
    apply: () => [],
    emits: ({ input, supplied }) => [
      Transition.emit('Submit', {
        id: supplied.id,
        title: Str.trim(input.title),
        createdAt: supplied.now,
        requestId: input.requestId,
      }),
    ],
  }),
  DeleteRequested: Transition.make({
    state: Model,
    input: Message.DeleteRequested,
    when: ({ state, input }) => Arr.any(state.todos, todo => Eq.is(todo.id, input.id)),
    apply: ({ state, input }) => [
      Transition.set(
        state.undo,
        Arr.find(state.todos, todo => Eq.is(todo.id, input.id)),
      ),
    ],
    // Focus goes to the row after it in the order shown, which the Command sorts.
    emits: ({ state, input }) => [
      Transition.emit('Delete', { id: input.id }),
      Transition.emit('FocusNeighbour', { id: input.id, todos: state.todos, filter: state.filter }),
      Transition.emit('ExpireUndo', { id: input.id }),
    ],
  }),
  UndoRequested: Transition.make({
    state: Model,
    input: Message.UndoRequested,
    when: ({ state }) => Null.isNotNull(state.undo),
    apply: ({ state }) => [Transition.set(state.undo, null)],
    emits: ({ state }) => [
      Transition.emit('Restore', { todo: state.undo }),
      Transition.emit('Focus', { id: state.undo.id }),
    ],
  }),
  UndoExpired: Transition.make({
    state: Model,
    input: Message.UndoExpired,
    // Another delete since replaced the todo offered back: this timer is stale.
    when: ({ state, input }) => Eq.equals(state.undo.id, input.id),
    apply: ({ state }) => [Transition.set(state.undo, null)],
  }),

  // Durable facts: pure over the shared slice, and a retry delivered twice changes nothing.
  SubmittedTodo: Transition.make({
    state: Model,
    input: Message.SubmittedTodo,
    apply: ({ state, input }) => [
      Transition.insert(state.todos, {
        id: input.id,
        title: input.title,
        completed: false,
        priority: 'normal',
        createdAt: input.createdAt,
      }),
    ],
  }),
  RestoredTodo: Transition.make({
    state: Model,
    input: Message.RestoredTodo,
    apply: ({ state, input }) => [Transition.insert(state.todos, input.todo)],
  }),
  ToggledTodo: Transition.make({
    state: Model,
    input: Message.ToggledTodo,
    apply: ({ state, input }) => [
      Transition.patch(state.todos, input.id, todo => ({ completed: Bool.not(todo.completed) })),
    ],
  }),
  RenamedTodo: Transition.make({
    state: Model,
    input: Message.RenamedTodo,
    apply: ({ state, input }) => [
      Transition.patch(state.todos, input.id, () => ({ title: input.title })),
    ],
  }),
  PrioritySet: Transition.make({
    state: Model,
    input: Message.PrioritySet,
    apply: ({ state, input }) => [
      Transition.patch(state.todos, input.id, () => ({ priority: input.priority })),
    ],
  }),
  DeletedTodo: Transition.make({
    state: Model,
    input: Message.DeletedTodo,
    apply: ({ state, input }) => [Transition.remove(state.todos, input.id)],
  }),
  ClearedCompleted: Transition.make({
    state: Model,
    input: Message.ClearedCompleted,
    apply: ({ state }) => [Transition.removeWhere(state.todos, todo => todo.completed)],
  }),
  // A blank title is refused here, so no durable `RenamedList` is submitted for the journal to refuse.
  ListRenameRequested: Transition.make({
    state: Model,
    input: Message.ListRenameRequested,
    when: ({ input }) => filled(input.title),
    apply: () => [],
    emits: ({ input }) => [Transition.emit('RenameList', { title: Str.trim(input.title) })],
  }),
  RenamedList: Transition.make({
    state: Model,
    input: Message.RenamedList,
    when: ({ input }) => filled(input.title),
    apply: ({ state, input }) => [Transition.set(state.listTitle, Str.trim(input.title))],
  }),
  // Only Commands: the Model never changes.
  CompletedFocus: Transition.make({ state: Model, input: Message.CompletedFocus, apply: () => [] }),
}

/** The mirrors' own steps (`surface.ts`): the filter read from a URL, the draft from a store. */
export interface Mirrors {
  readonly url: (model: Model, url: Url) => Model
  readonly restored: (model: Model, message: MirrorRestored) => Model
}

/** The application's machine: its transitions, and the mirrors' steps declared by their footprints. */
export const makeMachine = (mirrors: Mirrors) =>
  Machine.make({
    state: Model,
    transitions: {
      ...transitions,
      UrlChanged: Transition.opaque({
        name: 'UrlChanged',
        state: Model,
        input: Message.UrlChanged,
        reads: ({ input }) => [input.url],
        writes: ({ state }) => [state.filter],
        run: (state, input) => mirrors.url(state, input.url),
      }),
      MirrorRestored: Transition.opaque({
        name: 'MirrorRestored',
        state: Model,
        input: Message.MirrorRestored,
        reads: ({ input }) => [input.name, input.keys],
        writes: ({ state }) => [state.draft],
        run: (state, input) => mirrors.restored(state, input),
      }),
    },
  })

export type TodoMachine = ReturnType<typeof makeMachine>

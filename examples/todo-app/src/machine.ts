/**
 * What each Message writes to the Model, for the Messages whose change today's
 * `metakit` can state: the writes go to fixed paths, and each value is a
 * field of the Model or of the Message, or a constant.
 *
 * `update` (`app.ts`) runs these Transitions for those Messages, so the change
 * is written once, and `foldkit-surface/writes` reads the same declaration to
 * draw a Surface again only when a Message writes a field it reads. A Message
 * that names no Transition here keeps its hand-written arm in `update` and
 * draws every Surface, as before.
 *
 * Not declared, and why (the kernel is missing what each needs):
 * - `UrlChanged`, `MirrorRestored`: the mirror's reducer reads a URL and a
 *   record of stored strings by a key.
 * - `DraftSubmitted`, `RenamedList`: they test `trim()` of text, and there is
 *   no `Str.trim`.
 * - `SubmittedTodo`, `RestoredTodo`: append to a list unless an element has
 *   the id.
 * - `ToggledTodo`, `RenamedTodo`, `PrioritySet`: change the element with an id.
 * - `DeletedTodo`, `ClearedCompleted`: keep the elements that a test passes.
 * - `EditingStarted`: wraps the Message's id in an `Option` and reads the title of
 *   the element with that id.
 * - `DeleteRequested`: reads the element with an id into an `Option`.
 * - `UndoExpired`: tests a field of the todo inside an `Option`.
 */
import { Option, Schema } from 'effect'
import { Eq, Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import { Message, Model, type Todo } from './app.js'

// `Transition.set(path, Option.none())` does not infer the type of the empty Option.
const noId = Option.none<string>()
const noTodo = Option.none<Todo>()

const stopsEditing = Transition.make({
  state: Model,
  input: Schema.Struct({}),
  // Nothing is being edited: nothing changes, as the hand-written arm had it.
  when: ({ state }) => Eq.isNot(state.editingId, noId),
  apply: ({ state }) => [
    Transition.set(state.editingId, noId),
    Transition.set(state.editDraft, ''),
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
  // Ends an edit. The Commands (a rename, a focus) read the Model it ended, so
  // they stay in `update`; the Model's side is this.
  EditingCommitted: stopsEditing,
  EditingSubmitted: stopsEditing,
  // Unlike the two above it clears whatever is there, even with nothing edited.
  EditingStopped: Transition.make({
    state: Model,
    input: Message.EditingStopped,
    apply: ({ state }) => [
      Transition.set(state.editingId, noId),
      Transition.set(state.editDraft, ''),
    ],
  }),
  UndoRequested: Transition.make({
    state: Model,
    input: Message.UndoRequested,
    apply: ({ state }) => [Transition.set(state.undo, noTodo)],
  }),
  // Only Commands: the Model never changes.
  RequestedTodo: Transition.make({ state: Model, input: Message.RequestedTodo, apply: () => [] }),
  CompletedFocus: Transition.make({ state: Model, input: Message.CompletedFocus, apply: () => [] }),
}

export const todoMachine = Machine.make({ state: Model, transitions })
export type TodoMachine = typeof todoMachine

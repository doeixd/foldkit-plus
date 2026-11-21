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
 * - `DraftSubmitted`, `RenamedList`: they test `trim()` of text (`Str.trim`)
 *   and are not declared yet.
 * - `SubmittedTodo`, `RestoredTodo`: append to a list unless an element has
 *   the id.
 * - `ToggledTodo`, `RenamedTodo`, `PrioritySet`: change the element with an id.
 * - `DeletedTodo`, `ClearedCompleted`: keep the elements that a test passes.
 * - `EditingStarted`: reads the title of the element with the Message's id.
 * - `DeleteRequested`: reads the element with an id.
 * - `UndoExpired`: tests a field of the todo in `undo` (read as nullable) and
 *   is not declared yet.
 *
 * A path to an `Option` field reads as its value or null, and a write of null
 * stores `Option.none()`.
 */
import { Schema } from 'effect'
import { Eq, Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import { Message, Model } from './app.js'

const stopsEditing = Transition.make({
  state: Model,
  input: Schema.Struct({}),
  // Nothing is being edited: nothing changes, as the hand-written arm had it.
  when: ({ state }) => Eq.isNot(state.editingId, null),
  apply: ({ state }) => [
    Transition.set(state.editingId, null),
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
      Transition.set(state.editingId, null),
      Transition.set(state.editDraft, ''),
    ],
  }),
  UndoRequested: Transition.make({
    state: Model,
    input: Message.UndoRequested,
    apply: ({ state }) => [Transition.set(state.undo, null)],
  }),
  // Only Commands: the Model never changes.
  RequestedTodo: Transition.make({ state: Model, input: Message.RequestedTodo, apply: () => [] }),
  CompletedFocus: Transition.make({ state: Model, input: Message.CompletedFocus, apply: () => [] }),
}

export const todoMachine = Machine.make({ state: Model, transitions })
export type TodoMachine = typeof todoMachine

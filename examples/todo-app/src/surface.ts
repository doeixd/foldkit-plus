/**
 * Feature Surfaces: what each part of the UI observes and what it may cause.
 *
 * `Surface.application` turns the Model Schema into a reference tree
 * (`App.fields.todos`), and every projection below is a selection over it. A
 * Surface is a pure contract, not a component: the view renders it, the agent
 * reads it, `Module` inspects it, and the tests check it, from one declaration.
 *
 * The Message list of a Surface is a capability boundary. A renderer bound to
 * `Board` cannot emit `RequestedTodo`; only `Composer` can. That is enforced by
 * the builder's type, not by convention.
 */
import { Projection, Surface, type Surface as SurfaceType } from 'foldkit-surface'
import { Message, Model, initialModel, update } from './app.js'

export const App = Surface.application({ Model, Message, initial: initialModel, update })

// --- the writable projections the sync contract replicates (see sync.ts) ------

/** The list itself. */
export const Todos = Projection.pick(App.fields.todos)
/** The list's own metadata; a second feature that shares the same document. */
export const ListMeta = Projection.pick(App.fields.listTitle)

// --- the read-only Surfaces the view renders -----------------------------------
// `App.surface` lifts an object of field refs to `Projection.struct`; the
// explicit `Surface.make(App, name, { model: () => Projection.struct(…) })` is
// the same contract, written out.

export const Header = App.surface('Header', {
  model: ({ model }) => ({ listTitle: model.listTitle, todos: model.todos }),
  messages: [Message.RenamedList],
})

export const Composer = App.surface('Composer', {
  model: ({ model }) => ({ draft: model.draft }),
  messages: [Message.DraftChanged, Message.RequestedTodo],
})

export const Board = App.surface('Board', {
  model: ({ model }) => ({
    todos: model.todos,
    filter: model.filter,
    editingId: model.editingId,
    editDraft: model.editDraft,
  }),
  messages: [
    Message.FilterSelected,
    Message.ToggledTodo,
    Message.PrioritySet,
    Message.DeletedTodo,
    Message.EditingStarted,
    Message.EditDraftChanged,
    Message.EditingCommitted,
    Message.EditingStopped,
  ],
})

export const Footer = App.surface('Footer', {
  model: ({ model }) => ({ todos: model.todos, lastError: model.lastError }),
  messages: [Message.ClearedCompleted],
})

/**
 * What an agent may see: the board without the per-device composer and editor
 * state. It is a Surface like the others, so `Agent.make({ context: Overview })`
 * and `Module` describe it the same way.
 */
export const Overview = App.surface('Overview', {
  model: ({ model }) => ({ listTitle: model.listTitle, todos: model.todos, filter: model.filter }),
})

/** The Messages a Surface may emit, for typing a Behavior against it. */
export type MessageOf<S> = S extends SurfaceType<any, any, infer M, any> ? M : never
export type BoardMessage = MessageOf<typeof Board>

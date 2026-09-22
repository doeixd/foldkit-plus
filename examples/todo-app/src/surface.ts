/**
 * Feature Surfaces: what each part of the UI observes and what it may cause.
 *
 * `Surface.application` turns the Model Schema into a reference tree
 * (`App.model.todos`), and every projection below is a selection over it. A
 * Surface is a pure contract, not a component: the view renders it, the agent
 * reads it, `Module` inspects it, and the tests check it, from one declaration.
 *
 * The Message list of a Surface is a capability boundary. A renderer bound to
 * `Board` cannot emit `RequestedTodo`; only `Composer` can. That is enforced by
 * the builder's type, not by convention.
 */
import type { KeyValueStore } from 'effect/unstable/persistence'
import { Bundle } from 'foldkit-bundle'
import { Mirror } from 'foldkit-mirror'
import { Projection, Surface, type Surface as SurfaceType } from 'foldkit-surface'
import type * as Update from 'foldkit/update'
import { Message, Model, initialModel, makeUpdate } from './app.js'

/**
 * The application's own transitions. The assembly routes the mirrors'
 * Messages before `own` ever sees them, so the fallback only sees another
 * mirror's `MirrorRestored`, which is correctly ignored.
 */
const ownUpdate = makeUpdate(model => model)

export const App = Surface.application({
  Model,
  Message,
  initial: initialModel,
  // The assembly below; invoked only after this module finishes loading.
  update: (model, message) => update(model, message),
})

// --- the mirrors: local state the URL shows and a store remembers ------------

/** The filter is linkable: `?filter=active`. Reduced from the URL on load and on navigation. */
export const Filters = Mirror.url(App, { name: 'filters', fields: [App.model.filter] })
/** The composer's draft survives a reload; restored only while the draft is still empty. */
export const Prefs = Mirror.kv(App, { key: 'todo/prefs', fields: [App.model.draft] })

const Page = Bundle.parent({ Model, Message })

/**
 * The one list of what joins the application: each mirror brings its routing,
 * its startup Command, its Subscriptions, and its contract. `update`,
 * `initial`, `subscriptions`, and `url` below all derive from it, so a missed
 * step is a type error rather than a silent no-op.
 */
export const wiring = Page.assemble(Filters.wiring('UrlChanged'), Prefs.wiring())

/**
 * The mirrors' Messages go to their mirror; every other Message goes to `own`.
 * Annotated to break the inference cycle: `App` above is built from this
 * update, which is built from the mirrors, which are built over `App`. The
 * `KeyValueStore` requirement rides along from the key-value mirror's wiring;
 * only its startup Command uses the store, and the runtime provides it.
 */
export const update: (
  model: Model,
  message: Message,
) => Update.Return<Model, Message, KeyValueStore.KeyValueStore> = wiring.update(ownUpdate)

// --- the writable projections the sync contract replicates (see sync.ts) ------

/** The list itself. */
export const Todos = Projection.pick(App.model.todos)
/** The list's own metadata; a second feature that shares the same document. */
export const ListMeta = Projection.pick(App.model.listTitle)

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

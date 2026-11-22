/**
 * Feature Surfaces: what each part of the UI observes and what it may cause.
 *
 * `Surface.application` turns the Model Schema into a reference tree
 * (`App.model.todos`), and every projection below is a selection over it. A
 * Surface is a pure contract, not a component: the view renders it, the agent
 * reads it, `Module` inspects it, and the tests check it, from one declaration.
 *
 * The Message list of a Surface is a capability boundary. A renderer bound to
 * `Board` cannot emit `DraftSubmitted`; only `Composer` can. That is enforced by
 * the builder's type, not by convention.
 */
import type { KeyValueStore } from 'effect/persistence'
import { Bundle } from 'foldkit-bundle'
import { Mirror } from 'foldkit-mirror'
import { Projection, Surface, type Surface as SurfaceType } from 'foldkit-surface'
import type * as Update from 'foldkit/update'
import { Declared, type SuppliedStep } from 'foldkit-surface/declared'
import { WritesCheck } from 'foldkit-surface/writes'
import { Message, Model, initialModel, todoCommands } from './app.js'
import { makeMachine, type TodoMachine } from './machine.js'

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

/** Every Message's transition (`machine.ts`), the mirrors' steps declared by what they read and write. */
export const todoMachine: TodoMachine = makeMachine({ url: Filters.reduce, restored: Prefs.reduce })

/** What a new todo's transition is supplied: a fresh id and the time now. */
const newTodo = () => ({ id: crypto.randomUUID(), now: Date.now() })

/**
 * Every Message's transition (`machine.ts`), joined to its Command table and
 * `Writes` path-skipping through `Declared.of`: no hand-written `Message.match`
 * forwarding table is needed.
 */
export const declared: Declared<
  Model,
  Message,
  keyof TodoMachine['transitions'] & string,
  never,
  SuppliedStep<TodoMachine['transitions'], Message>
> = Declared.of(App, todoMachine, {
  commands: todoCommands,
  // A new todo's id and time, made once per step and sent on in `SubmittedTodo`.
  supply: { DraftSubmitted: newTodo, RequestedTodo: newTodo },
  sends: {
    Rename: ['RenamedTodo'],
    Focus: ['CompletedFocus'],
    Submit: ['SubmittedTodo'],
    Delete: ['DeletedTodo'],
    RenameList: ['RenamedList'],
    FocusNeighbour: ['CompletedFocus'],
    ExpireUndo: ['UndoExpired'],
    Restore: ['RestoredTodo'],
  },
})

const Page = Bundle.parent({ Model, Message })

/**
 * The one list of what joins the application: each mirror brings its routing,
 * its startup Command, its Subscriptions, and its contract. `update`,
 * `initial`, `subscriptions`, and `url` below all derive from it, so a missed
 * step is a type error rather than a silent no-op.
 */
export const wiring = Page.assemble(Filters.wiring('UrlChanged'), Prefs.wiring())

/** `update` without the writes' tracking, for the test that checks every Message against its Transition. */
export const assembled: (
  model: Model,
  message: Message,
) => Update.Return<Model, Message, KeyValueStore.KeyValueStore> = wiring.update(declared.step)

/**
 * What each Message writes (`machine.ts`), joined to what each Surface reads:
 * `view.ts` draws its Surfaces through `writes.rootView`, so a Message redraws
 * only the Surfaces that read a field it is declared to write.
 */
export const writes = declared.writes

/**
 * The application's `update`, noting which Message made each Model. In
 * development every Message is also checked to change no more than its
 * Transition declares, which a kept drawing would otherwise hide.
 */
export const update: typeof assembled = writes.track(
  import.meta.env?.DEV === true ? WritesCheck.verify(writes, assembled) : assembled,
)

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
  messages: [Message.ListRenameRequested],
})

export const Composer = App.surface('Composer', {
  model: ({ model }) => ({ draft: model.draft }),
  messages: [Message.DraftChanged, Message.DraftSubmitted],
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
    Message.DeleteRequested,
    Message.EditingStarted,
    Message.EditDraftChanged,
    Message.EditingCommitted,
    Message.EditingSubmitted,
    Message.EditingStopped,
  ],
})

export const Footer = App.surface('Footer', {
  model: ({ model }) => ({ todos: model.todos, lastError: model.lastError, undo: model.undo }),
  messages: [Message.ClearedCompleted, Message.UndoRequested],
})

/** The connection strip: where the replica stands against the server, and the sandbox's switch. */
export const Connection = App.surface('Connection', {
  model: ({ model }) => ({
    offline: model.offline,
    pending: model.pending,
    syncFailed: model.syncFailed,
  }),
  messages: [Message.OfflineSet],
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

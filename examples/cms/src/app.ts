/**
 * The authoring application: the worklist, the editor, the entry's history, and
 * the application's own reading of a post, which is what a preview is drawn
 * through. The scripted run and the browser both drive this one `update`.
 * Nothing about how any of it is placed is CMS-specific.
 */
import { Effect, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Cms } from 'foldkit-cms'
import { Crud } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { FormView } from 'foldkit-mixins-form'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import type { Command } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { EntryRow, Post, PostForm, PostPage, Posts } from './domain.js'

export const Editor = Cms.editor('PostEditor', { content: Posts, rest: '800 millis' })

// The form is drawn by `foldkit-mixins-form`; the CMS adds renderers for its two kinds.
const PostFormView = FormView.define(PostForm, { renderers: Cms.controlRenderers() })
const Slot = Bundle.declare(
  Editor.bundle.pipe(Bundle.withView(Cms.editorView(FormView.submodel(PostForm, PostFormView)))),
  'editor',
)

export const Model = Schema.Struct({
  remote: Remote.Model,
  ...Slot.fields,
  /** What the schedule box holds: the text of a `datetime-local` input. */
  scheduleAt: Schema.String,
  /** The address the public page is looking at. */
  visiting: Schema.String,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Remote.messages,
  ...Slot.cases,
  OpenedEntry: { entry: Schema.String },
  /** Asked for something new; its id is made in a Command, so `update` stays pure. */
  AskedForPost: {},
  StartedPost: { entry: Schema.String },
  ClosedEditor: {},
  TypedSchedule: { text: Schema.String },
  AskedForHistory: {},
  LookedAgain: {},
  Visited: { slug: Schema.String },
  /** Nothing happened; something may have arrived. */
  Ticked: {},
})
export type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
export const Data = Remote.make({
  model: App.model.remote,
  entities: [Post, ...Object.values(Cms.Entities)],
  queries: [Cms.Entries, Cms.bySlug(Posts)],
  mutations: [...Cms.operations],
})

export const PostEditor = Editor.at({ data: Data, model: App.model.editor })

/** What an author works on: entries, not rows, so something never published is here. */
export const WorklistList = Crud.list('Worklist', { query: Cms.Entries, selection: EntryRow })
export const Worklist = WorklistList.at({
  data: Data,
  input: () => ({ type: Posts.name, search: '', archived: false }),
})

/** The post as the application's own pages read it. */
export const postPage = (id: string) => Data.get(PostPage, id as never)

/** What was published, newest first: what `RestoreAsked` goes back to. */
const History = Entity.select(Cms.Entities.Entry, {
  revisions: Entity.select(Cms.Entities.Revision, {
    n: true,
    publishedAt: true,
    publishedBy: true,
  }),
})
export const history = (model: Model) => {
  const entry = PostEditor.entry(model)
  return entry === null ? undefined : Data.get(History, entry as never)
}

/** The public site: whatever is at an address, for whoever is asking. */
export const Site = Crud.list('Site', { query: Cms.bySlug(Posts), selection: PostPage }).at({
  data: Data,
  input: (model: Model) => ({ slug: model.visiting }),
})

/** What Remote fetches and retains while it is on screen. */
export const actives = {
  worklist: Worklist.active,
  site: Site.active,
  ...PostEditor.actives,
  history: {
    name: 'History',
    owner: Data.contract.owner ?? {},
    projectionOf: history,
  },
  page: {
    name: 'PostPage',
    owner: Data.contract.owner ?? {},
    projectionOf: (model: Model) => {
      const id = PostEditor.pageId(model)
      return id === null ? undefined : postPage(id)
    },
  },
}

const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
export const EditorSlot = Page.at(Slot, { onOut: PostEditor.onOut })
export const placements = Page.assemble(EditorSlot, Data.wiring(actives))

const newPost: Command<Message> = {
  name: 'NewEntryId',
  args: {},
  effect: Effect.sync(() => Message.StartedPost({ entry: Cms.newEntryId() })),
}

/**
 * An entry the worklist has not heard of is asked for again. A save patches the
 * entry, but a connection is a list the server put in order, and something new
 * joins it only when the query is asked again. Remote returns the same Model
 * while that is already under way, so this settles by itself.
 */
const listing = (model: Model): Model => {
  const entry = PostEditor.entry(model)
  const page = Worklist.page(model)
  if (entry === null || page._tag !== 'Ready') return model
  return page.value.items.some(row => row.id === entry)
    ? model
    : Data.refresh(model, Worklist.active.projectionOf(model)!)
}

const placed = placements.update((model: Model, message: Message) => {
  // Leaving drops what is in the form, so what has not been saved is saved first:
  // an author who types and leaves within the rest loses nothing.
  const leaving = (next: (flushed: Model) => { readonly model: Model }) => {
    const flushed = PostEditor.flush(model)
    return { model: next(flushed.model).model, commands: flushed.commands ?? [] }
  }
  switch (message._tag) {
    case 'OpenedEntry':
      return leaving(EditorSlot.helpers.open(message.entry))
    case 'AskedForPost':
      return { model, commands: [newPost] }
    case 'StartedPost':
      return leaving(EditorSlot.helpers.create(message.entry))
    case 'ClosedEditor':
      return leaving(EditorSlot.helpers.close())
    case 'TypedSchedule':
      return { model: { ...model, scheduleAt: message.text } }
    case 'AskedForHistory': {
      // A publish patches the new revision in; its place in the list is asked for.
      const projection = history(model)
      const refreshed = projection === undefined ? model : Data.refresh(model, projection)
      return { model: Data.refresh(refreshed, Worklist.active.projectionOf(refreshed)!) }
    }
    case 'Visited':
      return { model: { ...model, visiting: message.slug } }
    case 'LookedAgain':
      return { model: Data.refresh(model, Site.active.projectionOf(model)!) }
    default:
      return { model }
  }
})

export const update = PostEditor.after((model: Model, message: Message) => {
  const next = placed(model, message)
  return { ...next, model: listing(next.model) }
})

export const initial: Model = placements.initial({
  remote: Remote.initial,
  scheduleAt: '',
  visiting: 'hello-world',
}).model

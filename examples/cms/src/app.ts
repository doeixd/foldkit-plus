/**
 * The authoring application: the worklist, the editor, the entry's history, and
 * the application's own reading of a post, which is what a preview is drawn
 * through. The scripted run and the browser both drive this one `update`.
 * Nothing about how any of it is placed is CMS-specific.
 */
import { Effect, Equal, Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Cms, EntryId } from 'foldkit-cms'
import { Crud } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { Behavior, Style } from 'foldkit-mixins'
import { FieldSlots, FormView, type FieldInput } from 'foldkit-mixins-form'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import type { Command } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { EntryRow, Post, PostForm, PostId, PostPage, PostPreview, Posts } from './domain.js'
import { FormStyle, WritingFieldStyle } from './style.js'

export const Editor = Cms.editor('PostEditor', { content: Posts, rest: '800 millis' })

/** What an empty field says in place of its label, where the page is the field. */
const placeholders: Readonly<Record<string, string>> = {
  title: 'Post title',
  excerpt: 'A line or two that draws a reader in',
  body: 'Begin writing your post…',
}
type PostKey = (typeof PostForm.controls)[number]['key']
const Placeholders = Behavior.forSlots(FieldSlots)<
  FieldInput<PostKey>,
  typeof PostForm.Message.Type
>(
  {
    text: Behavior.slot({
      attributes: ({ input, h }) =>
        Object.hasOwn(placeholders, input.control.key)
          ? [h.Placeholder(placeholders[input.control.key] ?? '')]
          : [],
    }),
    multiline: Behavior.slot({
      attributes: ({ input, h }) =>
        Object.hasOwn(placeholders, input.control.key)
          ? [h.Placeholder(placeholders[input.control.key] ?? '')]
          : [],
    }),
  },
  { name: 'Placeholders' },
)

// The form is drawn by `foldkit-mixins-form`, laid out as a page to write on; the
// CMS adds renderers for its two kinds.
const PostFormView = FormView.define(PostForm, {
  field: FormView.field(PostForm, { renderers: Cms.controlRenderers() }).pipe(
    Style.attach(WritingFieldStyle),
    Behavior.attach(Placeholders),
  ),
}).pipe(Style.attach(FormStyle))
const Slot = Bundle.declare(
  Editor.bundle.pipe(Bundle.withView(Cms.editorView(FormView.submodel(PostForm, PostFormView)))),
  'editor',
)

export const Model = Schema.Struct({
  remote: Remote.Model,
  ...Slot.fields,
  /** What the schedule box holds: the text of a `datetime-local` input. */
  scheduleAt: Schema.String,
  /** What the worklist is narrowed to: its search text, and whether it shows the archive. */
  search: Schema.String,
  archived: Schema.Boolean,
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
  Searched: { text: Schema.String },
  ToggledArchive: {},
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
  input: (model: Model) =>
    Option.some({ type: Posts.name, search: model.search, archived: model.archived }),
})

/** The post as the application's own pages read it. */
export const postPage = (id: string) => Data.get(PostPreview, PostId.make(id))

/** What was published, newest first: what `RestoreAsked` goes back to. */
const History = Entity.select(Cms.Entities.Entry, {
  revisions: Entity.select(Cms.Entities.Revision, {
    n: true,
    publishedAt: true,
    publishedBy: true,
  }),
})
export const history = (model: Model) =>
  Option.map(PostEditor.entry(model), entry => Data.get(History, EntryId.make(entry)))

/** What Remote fetches and retains while it is on screen. */
export const actives = {
  worklist: Worklist.active,
  ...PostEditor.actives,
  history: Data.active('History', history),
  page: Data.active('PostPage', (model: Model) => Option.map(PostEditor.pageId(model), postPage)),
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
  const page = Worklist.page(model)
  return Option.match(PostEditor.entry(model), {
    onNone: () => model,
    onSome: entry =>
      page._tag !== 'Ready' || page.value.items.some(row => row.id === entry)
        ? model
        : Worklist.refresh(model),
  })
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
      return { model: modifyFields(model, { scheduleAt: () => message.text }) }
    case 'Searched':
      return { model: modifyFields(model, { search: () => message.text }) }
    case 'ToggledArchive':
      return { model: modifyFields(model, { archived: archived => !archived }) }
    default:
      return { model }
  }
})

/** The open entry's state as text, to tell a change of it; none while it is unknown. */
const stateOf = (model: Model): Option.Option<string> =>
  Option.map(PostEditor.state(model), state => JSON.stringify(state))

/**
 * The open entry's history and the worklist, asked for again once its state
 * changed (a publish, a restore, an unpublish, an archive): a publish patches
 * the entry, not the list of revisions, nor which of the lists it belongs in.
 */
const refreshedAfterChange = (before: Model, after: Model): Model => {
  const changed =
    Option.isSome(stateOf(before)) &&
    Equal.equals(PostEditor.entry(before), PostEditor.entry(after)) &&
    !Equal.equals(stateOf(before), stateOf(after))
  if (!changed) return after
  const withHistory = Option.match(history(after), {
    onNone: () => after,
    onSome: projection => Data.refresh(after, projection),
  })
  return Worklist.refresh(withHistory)
}

export const update = PostEditor.after((model: Model, message: Message) => {
  const next = placed(model, message)
  return { ...next, model: listing(refreshedAfterChange(model, next.model)) }
})

export const initial: Model = placements.initial({
  remote: Remote.initial,
  scheduleAt: '',
  search: '',
  archived: false,
}).model

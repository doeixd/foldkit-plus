/**
 * The authoring application: the worklist, the editor, the entry's history, and
 * the application's own reading of a post, which is what a preview is drawn
 * through. The scripted run and the browser both drive this one `update`.
 * Nothing about how any of it is placed is CMS-specific.
 */
import { Effect, Equal, Option, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Cms, EntryId } from 'foldkit-cms'
import { Crud } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { Mirror } from 'foldkit-mirror'
import { Behavior, Style } from 'foldkit-mixins'
import { FieldSlots, FormView, type FieldInput } from 'foldkit-mixins-form'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import type { Command } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import * as Navigation from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import * as Subscription from 'foldkit/subscription'
import { Url, toString as urlToString } from 'foldkit/url'
import {
  beginMissing,
  entryIn,
  entryOut,
  openNamed,
  paramOf,
  writeAddress,
  type EntryEditor,
} from '../routing/address.js'
import {
  EntryRow,
  Post,
  PostForm,
  PostId,
  PostPage,
  PostPreview,
  Posts,
} from '../content/domain.js'
import { FormStyle, WritingFieldStyle } from '../styles/style.js'

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
  /**
   * Whether a link asks for the preview, until the post it names is open:
   * opening starts an editor with none, and one asked for while the post loads
   * would be dropped when it arrives.
   */
  previewAsked: Schema.Option(Schema.Boolean),
  /**
   * A post an address names as new, until the server says whether its first
   * save made it: opened by its id, and begun blank if it did not.
   */
  fresh: Schema.Option(Schema.String),
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
  /** The address changed: a link, back or forward, or the studio's own write. */
  UrlChanged: { url: Url },
  /** A link was followed. */
  UrlRequested: { request: Navigation.UrlRequest },
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

/** The post editor, as the address opens and names what it holds. */
const routed = {
  entry: PostEditor.entry,
  storedEntry: PostEditor.storedEntry,
  missing: model => PostEditor.status(model) === 'NotFound',
  loading: model => PostEditor.status(model) === 'Loading',
  flush: PostEditor.flush,
  open: entry => EditorSlot.helpers.open(entry),
  create: entry => EditorSlot.helpers.create(entry),
  close: () => EditorSlot.helpers.close(),
} satisfies EntryEditor<Model, unknown>

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
    case 'UrlChanged': {
      const { preview, ...named } = linkIn(message.url)
      // The worklist's narrowing is the mirror's to read; which post is open is routing.
      const narrowed = Narrowing.reduce(model, message.url)
      const opened = openNamed(routed, narrowed, named, model.fresh)
      return {
        model: { ...opened.model, previewAsked: Option.some(preview), fresh: opened.fresh },
        commands: opened.commands,
      }
    }
    case 'UrlRequested':
      // Another address is another chair or another application: load it.
      return {
        model,
        commands: [
          {
            name: 'FollowLink',
            effect: Navigation.load(
              message.request._tag === 'Internal'
                ? urlToString(message.request.url)
                : message.request.href,
            ).pipe(Effect.as(Message.Ticked())),
          },
        ],
      }
    default:
      return { model }
  }
})

/** The open post (saved, or new), and whether it is previewed, as an address names them. */
export const linkIn = (url: Url) => ({
  ...entryIn(url, 'post'),
  preview: Option.isSome(paramOf(url, 'preview')),
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

const stepped = PostEditor.after((model: Model, message: Message) => {
  const next = placed(model, message)
  return { ...next, model: listing(refreshedAfterChange(model, next.model)) }
})

/**
 * The preview a link asks for, once the post is open, through the editor's own
 * `update`; then let go, so the address follows the editor again. Outside
 * `after`, whose `sync` is what opens the post a load brings.
 */
const follow = (result: ReturnType<typeof stepped>): ReturnType<typeof stepped> => {
  const { model } = result
  if (Option.isNone(model.previewAsked) || PostEditor.status(model) === 'Loading') return result
  const settled = { ...model, previewAsked: Option.none() }
  const asked = model.previewAsked.value
  if (PostEditor.status(model) === 'Closed' || PostEditor.previewing(model) === asked)
    return { ...result, model: settled }
  const next = stepped(
    settled,
    Message.GotEditorMessage({
      message: asked ? Editor.Message.PreviewShown() : Editor.Message.PreviewHidden(),
    }),
  )
  return { ...next, commands: [...(result.commands ?? []), ...(next.commands ?? [])] }
}

/** A post the address named as new, begun blank once the server says it has none. */
const begun = (result: ReturnType<typeof stepped>): ReturnType<typeof stepped> => {
  const { model, fresh } = beginMissing(routed, result.model, result.model.fresh)
  return { ...result, model: { ...model, fresh } }
}

export const update = (model: Model, message: Message) => follow(begun(stepped(model, message)))

export const initial: Model = placements.initial({
  remote: Remote.initial,
  scheduleAt: '',
  search: '',
  archived: false,
  previewAsked: Option.none(),
  fresh: Option.none(),
}).model

/**
 * How the worklist is narrowed, shown in the address (`?q=milk&archive=true`).
 * The Model owns it and the address only shows it: a search or the other tab
 * replaces the address rather than adding a step, and a reload reads it back.
 */
export const Narrowing = Mirror.url(App, {
  name: 'worklist',
  fields: [App.model.search, App.model.archived],
  keys: {
    search: { key: 'q', history: 'replace' },
    archived: { key: 'archive', history: 'replace' },
  },
  initial,
})

/** What an address asks for, opened: a reload, or a link someone shared, lands there. */
export const init = (url: Url) => update(initial, Message.UrlChanged({ url }))

/**
 * The open post and whether it is previewed, written into the address as they
 * change: opening or closing a post is a step Back returns from, a preview is
 * not. Something new is `new=<id>` until its first save makes it `post=<id>`,
 * and so is a post a reload is still finding. The worklist's narrowing is
 * written by its mirror.
 */
export const address = Subscription.make<Model, Message>()(entry => ({
  ...Narrowing.subscriptions,
  address: entry(
    {
      post: Schema.Option(Schema.String),
      new: Schema.Option(Schema.String),
      preview: Schema.Option(Schema.String),
    },
    {
      modelToDependencies: model => ({
        ...Option.match(model.fresh, {
          onNone: () => {
            const { stored, fresh } = entryOut(routed, model)
            return { post: stored, new: fresh }
          },
          onSome: fresh => ({ post: Option.none(), new: Option.some(fresh) }),
        }),
        // A link still waiting for its post keeps what it asked there.
        preview: Option.getOrElse(model.previewAsked, () => PostEditor.previewing(model))
          ? Option.some('1')
          : Option.none(),
      }),
      dependenciesToStream: params =>
        Stream.fromEffect(writeAddress(params, ['post', 'new'])).pipe(Stream.drain),
    },
  ),
}))

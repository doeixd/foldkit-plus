/**
 * The page authoring application: the CMS editor around the page form, whose
 * `document` key is the page Builder. Placed exactly as the post editor is:
 * nothing about the Builder is CMS-specific, and nothing about the CMS knows
 * there is a Builder.
 */
import { Effect, Equal, Option, Schema, Stream } from 'effect'
import { Message as BuilderMessage, Panel, Viewport } from 'foldkit-builder'
import { Bundle } from 'foldkit-bundle'
import { Cms, EntryId } from 'foldkit-cms'
import { Entity } from 'foldkit-entity'
import { BuilderView, type BuilderViewInputs } from 'foldkit-mixins-builder'
import { Style } from 'foldkit-mixins'
import { FormView } from 'foldkit-mixins-form'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import type { Command } from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Navigation from 'foldkit/navigation'
import * as Subscription from 'foldkit/subscription'
import { Url, toString as urlToString } from 'foldkit/url'
import { NodeId, type Document } from 'foldkit-composition'
import { QueryBlock } from 'foldkit-composition/remote'
import { Post, PostById, RecentPosts } from './domain.js'
import { Page, PageForm, PageId, PageView, Pages } from './pageDomain.js'
import { PageBuilder, Site } from './site.js'
import { PageFieldStyle, PageFormStyle } from './style.js'
import {
  beginMissing,
  entryIn,
  entryOut,
  openNamed,
  paramOf,
  writeAddress,
  type EntryEditor,
} from './address.js'

// A pause in typing saves, as the posts do: a save per keystroke encoded the page
// and wrote the database each time. The scripted run gives its rest no wait.
export const Editor = Cms.editor('PageEditor', { content: Pages, rest: '800 millis' })

// The Builder is drawn with its own view, inside the page form.
const PageFormView = FormView.define(PageForm, {
  field: FormView.field(PageForm, { renderers: Cms.controlRenderers() }).pipe(
    Style.attach(PageFieldStyle),
  ),
}).pipe(Style.attach(PageFormStyle))
const Slot = Bundle.declare(
  Editor.bundle.pipe(Bundle.withView(Cms.editorView(FormView.submodel(PageForm, PageFormView)))),
  'editor',
)

/** What a link asks of the Builder: the Block selected, the panel shown, the width previewed. */
export const Linked = Schema.Struct({
  block: Schema.Option(Schema.String),
  panel: Schema.Option(Panel),
  viewport: Schema.Option(Viewport),
})
export type Linked = typeof Linked.Type

export const Model = Schema.Struct({
  remote: Remote.Model,
  ...Slot.fields,
  /**
   * What a link asks of the Builder, until the page it is about is open: the
   * Builder has no Model before then, and refuses an id its page lacks.
   */
  linked: Schema.Option(Linked),
  /**
   * A page an address names as new, until the server says whether its first
   * save made it: opened by its id, and begun blank if it did not.
   */
  fresh: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Remote.messages,
  ...Slot.cases,
  OpenedEntry: { entry: Schema.String },
  AskedForPage: {},
  StartedPage: { entry: Schema.String },
  ClosedEditor: {},
  /** The address changed: a link, back or forward, or the page's own write. */
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
  entities: [Page, Post, ...Object.values(Cms.Entities)],
  queries: [Cms.Entries, Cms.bySlug(Pages), RecentPosts, PostById],
  mutations: [...Cms.operations],
})

export const PageEditor = Editor.at({ data: Data, model: App.model.editor })

/** A page as the site's own views read it: what a preview is drawn through. */
export const pageView = (id: string) => Data.get(PageView, PageId.make(id))

/** What was published, newest first: what the History lists and `RestoreAsked` goes back to. */
const Revisions = Entity.select(Cms.Entities.Entry, {
  revisions: Entity.select(Cms.Entities.Revision, {
    n: true,
    publishedAt: true,
    publishedBy: true,
  }),
})
export const revisions = (model: Model) =>
  Option.map(PageEditor.entry(model), entry => Data.get(Revisions, EntryId.make(entry)))

/** The page the form is editing. */
export const editing = (model: Model): Document =>
  PageBuilder.document(PageForm.control('document').field(model.editor.form).value)

/**
 * The site's pages: the editor's list to open one from, and the choices of a
 * Block prop that names one. Read while the editor is up.
 */
export const sitePages = Data.query(
  Cms.Entries,
  { type: 'pages', search: '', archived: false },
  { select: Entity.select(Cms.Entities.Entry, { id: true, label: true, state: true }), first: 50 },
)

/** The blog's published posts: the choices of a Block prop that features one. */
export const sitePosts = Data.query(
  RecentPosts,
  {},
  { select: Entity.select(Post, { id: true, title: true }), first: 50 },
)

/** What the page's Query Blocks read, as one Projection: fetched while the page is open. */
export const actives = {
  ...PageEditor.actives,
  blocks: QueryBlock.active('PageBlocks', App.owner, Data, Site, model =>
    Option.some(editing(model)),
  ),
  pages: Data.active('SitePages', () => Option.some(sitePages)),
  posts: Data.active('SitePosts', () => Option.some(sitePosts)),
  revisions: Data.active('Revisions', revisions),
  page: Data.active('PageView', (model: Model) => Option.map(PageEditor.pageId(model), pageView)),
}

const Parent = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
export const EditorSlot = Parent.at(Slot, { onOut: PageEditor.onOut })
export const placements = Parent.assemble(EditorSlot, Data.wiring(actives))

const newPage: Command<Message> = {
  name: 'NewEntryId',
  args: {},
  effect: Effect.sync(() => Message.StartedPage({ entry: Cms.newEntryId() })),
}

/** The page editor, as the address opens and names what it holds. */
const routed = {
  entry: PageEditor.entry,
  storedEntry: PageEditor.storedEntry,
  missing: model => PageEditor.status(model) === 'NotFound',
  loading: model => PageEditor.status(model) === 'Loading',
  flush: PageEditor.flush,
  open: entry => EditorSlot.helpers.open(entry),
  create: entry => EditorSlot.helpers.create(entry),
  close: () => EditorSlot.helpers.close(),
} satisfies EntryEditor<Model, unknown>

const placed = placements.update((model: Model, message: Message) => {
  // Leaving saves what the rest has not saved yet.
  const leaving = (next: (flushed: Model) => { readonly model: Model }) => {
    const flushed = PageEditor.flush(model)
    return { model: next(flushed.model).model, commands: flushed.commands ?? [] }
  }
  switch (message._tag) {
    case 'OpenedEntry':
      return leaving(EditorSlot.helpers.open(message.entry))
    case 'AskedForPage':
      return { model, commands: [newPage] }
    case 'StartedPage':
      return leaving(EditorSlot.helpers.create(message.entry))
    case 'ClosedEditor':
      return leaving(EditorSlot.helpers.close())
    case 'UrlChanged': {
      const { stored, fresh, ...asked } = linkIn(message.url)
      const opened = openNamed(routed, model, { stored, fresh }, model.fresh)
      return {
        model: { ...opened.model, linked: Option.some(asked), fresh: opened.fresh },
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

const stepped = PageEditor.after(placed)

/**
 * The page an address names, and what it asks of the Builder:
 * `?page=<entry>&block=<node>&panel=layers&view=narrow`.
 */
export const linkIn = (url: Url) => ({
  ...entryIn(url, 'page'),
  block: paramOf(url, 'block'),
  panel: Option.flatMap(paramOf(url, 'panel'), Schema.decodeUnknownOption(Panel)),
  viewport: Option.flatMap(paramOf(url, 'view'), Schema.decodeUnknownOption(Viewport)),
})

const document = PageForm.control('document')

/** The Builder as the open page's form holds it. */
const builderOf = (model: Model) => document.field(model.editor.form).value

/** The Block the Builder has selected, as the address names it. */
export const selectedOf = (model: Model): Option.Option<NodeId> => builderOf(model).selected

/**
 * What a link asks, once the page has loaded, through the Builder's own
 * `update`: the Block selected if the page holds it, then the panel and the
 * width. A selection shows Settings, so the panel comes after it. Then it is
 * let go, so the address follows the Builder again.
 */
const follow = (result: ReturnType<typeof stepped>): ReturnType<typeof stepped> => {
  if (Option.isNone(result.model.linked) || PageEditor.status(result.model) === 'Loading')
    return result
  const { block, panel, viewport } = result.model.linked.value
  // The id is the address's: `hasOwn`, since a plain object has `constructor`.
  const held = Option.filter(block, id => Object.hasOwn(editing(result.model).nodes, id))
  const asks = [
    ...Option.toArray(Option.map(held, id => BuilderMessage.Selected({ id: NodeId.make(id) }))),
    ...Option.toArray(Option.map(panel, chosen => BuilderMessage.PanelChosen({ panel: chosen }))),
    ...Option.toArray(
      Option.map(viewport, chosen => BuilderMessage.ViewportChosen({ viewport: chosen })),
    ),
  ]
  return asks.reduce<ReturnType<typeof stepped>>(
    (done, ask) => {
      const next = stepped(done.model, Message.GotEditorMessage({ message: document.send(ask) }))
      return { ...next, commands: [...(done.commands ?? []), ...(next.commands ?? [])] }
    },
    { ...result, model: { ...result.model, linked: Option.none() } },
  )
}

/**
 * The site's pages asked for again when the open page is saved and not among
 * them: a save makes the entry, but a list joins something new only when it is
 * asked again. Remote returns the same Model while that is under way.
 */
const listing = (model: Model): Model => {
  const pages = sitePages.read(model)
  return Option.match(PageEditor.storedEntry(model), {
    onNone: () => model,
    onSome: stored =>
      pages._tag !== 'Ready' || pages.value.items.some(page => page.id === stored)
        ? model
        : Data.refresh(model, sitePages),
  })
}

/**
 * The open page's revisions and the site's pages, asked for again once its state
 * changed (a publish, a restore, an unpublish, an archive): a publish patches the
 * entry, not its list of revisions, nor the list of pages.
 */
const refreshedAfterChange = (before: Model, after: Model): Model => {
  const stateOf = (model: Model) =>
    Option.map(PageEditor.state(model), state => JSON.stringify(state))
  const changed =
    Option.isSome(stateOf(before)) &&
    Equal.equals(PageEditor.entry(before), PageEditor.entry(after)) &&
    !Equal.equals(stateOf(before), stateOf(after))
  if (!changed) return after
  const withRevisions = Option.match(revisions(after), {
    onNone: () => after,
    onSome: projection => Data.refresh(after, projection),
  })
  return Data.refresh(withRevisions, sitePages)
}

/** A page the address named as new, begun blank once the server says it has none. */
const begun = (result: ReturnType<typeof stepped>): ReturnType<typeof stepped> => {
  const { model, fresh } = beginMissing(routed, result.model, result.model.fresh)
  return { ...result, model: { ...model, fresh } }
}

export const update = (model: Model, message: Message) => {
  const next = follow(begun(stepped(model, message)))
  return { ...next, model: listing(refreshedAfterChange(model, next.model)) }
}

export const initial: Model = placements.initial({
  remote: Remote.initial,
  linked: Option.none(),
  fresh: Option.none(),
}).model

/**
 * The open page and how the Builder shows it (its selection, its panel, the
 * width it previews at), written into the address as they change. A link
 * still waiting for its page keeps what it asked there. The panel and the
 * width are left out at the Builder's defaults.
 */
export const address = Subscription.make<Model, Message>()(entry => ({
  address: entry(
    {
      page: Schema.Option(Schema.String),
      new: Schema.Option(Schema.String),
      block: Schema.Option(Schema.String),
      panel: Schema.Option(Schema.String),
      view: Schema.Option(Schema.String),
    },
    {
      modelToDependencies: model => {
        // Something new is `new=<id>` until its first save, as is a page a reload is still finding.
        const { stored, fresh } = Option.match(model.fresh, {
          onNone: () => entryOut(routed, model),
          onSome: waiting => ({ stored: Option.none<string>(), fresh: Option.some(waiting) }),
        })
        // The Builder's own, while a page is open.
        const shown = Option.map(PageEditor.entry(model), () => builderOf(model))
        return {
          page: stored,
          new: fresh,
          block: Option.orElse(
            Option.flatMap(model.linked, ({ block }) => block),
            () => selectedOf(model),
          ),
          panel: Option.orElse(
            Option.flatMap(model.linked, ({ panel }) => panel),
            () =>
              Option.flatMap(shown, ({ panel }) =>
                Option.liftPredicate(panel, chosen => chosen !== 'insert'),
              ),
          ),
          view: Option.orElse(
            Option.flatMap(model.linked, ({ viewport }) => viewport),
            () =>
              Option.flatMap(shown, ({ viewport }) =>
                Option.liftPredicate(viewport, chosen => chosen !== 'wide'),
              ),
          ),
        }
      },
      // Opening or closing a page is a step Back returns from; the rest is not.
      dependenciesToStream: params =>
        Stream.fromEffect(writeAddress(params, ['page', 'new'])).pipe(Stream.drain),
    },
  ),
}))

/**
 * What the drawn Builder is given: what the page's Blocks read, so the canvas
 * shows a Query Block's rows as the published page would, and the site's pages
 * and posts for the inspector to pick from. All are actives' reads, fetched
 * while the editor is up.
 */
export const builderInputs = (model: Model): BuilderViewInputs => {
  const pages = sitePages.read(model)
  const posts = sitePosts.read(model)
  return BuilderView.inputs({
    data: actives.blocks.data(model),
    options: {
      'LatestPages.except':
        pages._tag === 'Ready' || pages._tag === 'Refreshing'
          ? pages.value.items.map(page => ({ value: page.id, label: page.label }))
          : [],
      'FeaturedPost.post':
        posts._tag === 'Ready' || posts._tag === 'Refreshing'
          ? posts.value.items.map(post => ({ value: post.id, label: post.title }))
          : [],
    },
  })
}

/** The page editor drawn: the form, the Builder in it drawn with `builderInputs`. */
export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  EditorSlot.view(model, h, {
    // Published from the editor's bar; the form draws no button of its own.
    submits: false,
    controls: { document: builderInputs(model) },
  })

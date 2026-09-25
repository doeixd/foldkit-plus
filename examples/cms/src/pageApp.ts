/**
 * The page authoring application: the CMS editor around the page form, whose
 * `document` key is the page Builder. Placed exactly as the post editor is:
 * nothing about the Builder is CMS-specific, and nothing about the CMS knows
 * there is a Builder.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { Message as BuilderMessage } from 'foldkit-builder'
import { Bundle } from 'foldkit-bundle'
import { Cms, EntryId } from 'foldkit-cms'
import { Entity } from 'foldkit-entity'
import { BuilderView, type BuilderViewInputs } from 'foldkit-mixins-builder'
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
import { Page, PageForm, PageId, PageView, Pages } from './pageDomain.js'
import { PageBuilder, Site } from './site.js'

// A rest of zero: the scripted run does not wait on a clock to save.
export const Editor = Cms.editor('PageEditor', { content: Pages, rest: 0 })

// The Builder is drawn with its own view, inside the page form.
const PageFormView = FormView.define(PageForm, { renderers: Cms.controlRenderers() })
const Slot = Bundle.declare(
  Editor.bundle.pipe(Bundle.withView(Cms.editorView(FormView.submodel(PageForm, PageFormView)))),
  'editor',
)

export const Model = Schema.Struct({
  remote: Remote.Model,
  ...Slot.fields,
  /**
   * The Block a link names, until the page holding it is open: the Builder
   * refuses an id its page lacks, so a link opened while the page loads waits.
   */
  linked: Schema.NullOr(Schema.String),
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
  entities: [Page, ...Object.values(Cms.Entities)],
  queries: [Cms.Entries, Cms.bySlug(Pages)],
  mutations: [...Cms.operations],
})

export const PageEditor = Editor.at({ data: Data, model: App.model.editor })

/** A page as the site's own views read it: what a preview is drawn through. */
export const pageView = (id: string) => Data.get(PageView, PageId.make(id))

/** What was published, newest first. */
const Revisions = Entity.select(Cms.Entities.Entry, {
  revisions: Entity.select(Cms.Entities.Revision, { n: true }),
})
export const revisions = (model: Model) => {
  const entry = PageEditor.entry(model)
  return entry === null ? undefined : Data.get(Revisions, EntryId.make(entry))
}

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
  { select: Entity.select(Cms.Entities.Entry, { id: true, label: true }), first: 50 },
)

/** What the page's Query Blocks read, as one Projection: fetched while the page is open. */
export const blockReads = (model: Model) => QueryBlock.reads(Data, Site, editing(model))

export const actives = {
  ...PageEditor.actives,
  blocks: QueryBlock.active('PageBlocks', App.owner, Data, Site, editing),
  pages: {
    name: 'SitePages',
    owner: Data.contract.owner ?? {},
    messages: [],
    projectionOf: () => sitePages,
  },
  revisions: {
    name: 'Revisions',
    owner: Data.contract.owner ?? {},
    messages: [],
    projectionOf: revisions,
  },
  page: {
    name: 'PageView',
    owner: Data.contract.owner ?? {},
    messages: [],
    projectionOf: (model: Model) => {
      const id = PageEditor.pageId(model)
      return id === null ? undefined : pageView(id)
    },
  },
}

const Parent = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
export const EditorSlot = Parent.at(Slot, { onOut: PageEditor.onOut })
export const placements = Parent.assemble(EditorSlot, Data.wiring(actives))

const newPage: Command<Message> = {
  name: 'NewEntryId',
  args: {},
  effect: Effect.sync(() => Message.StartedPage({ entry: Cms.newEntryId() })),
}

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
      const { page, block } = linkIn(message.url)
      const linked = { ...model, linked: block }
      // The page the address names is opened, unless it is the one open already. A new
      // page is not in the address until it is saved, so no page there leaves it open.
      if (page === PageEditor.storedEntry(model)) return { model: linked }
      const opened =
        page === null ? leaving(EditorSlot.helpers.close()) : leaving(EditorSlot.helpers.open(page))
      return { ...opened, model: { ...opened.model, linked: block } }
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

/** The page and the Block an address names: `?page=<entry>&block=<node>`. */
export const linkIn = (url: Url) => {
  const params = new URLSearchParams(Option.getOrElse(url.search, () => ''))
  const named = (key: string) => {
    const value = params.get(key)
    return value === null || value === '' ? null : value
  }
  return { page: named('page'), block: named('block') }
}

const document = PageForm.control('document')

/** The Block the Builder has selected, as the address names it. */
export const selectedOf = (model: Model) => document.field(model.editor.form).value.selected

/**
 * The linked Block, once the page has loaded: selected through the Builder's
 * own `update` if the page holds it, and let go if not, so the address follows
 * the selection again.
 */
const follow = (result: ReturnType<typeof stepped>): ReturnType<typeof stepped> => {
  const { linked } = result.model
  if (linked === null || PageEditor.status(result.model) === 'Loading') return result
  // The id is the address's: `hasOwn`, since a plain object has `constructor`.
  if (!Object.hasOwn(editing(result.model).nodes, linked))
    return { ...result, model: { ...result.model, linked: null } }
  const selected = stepped(
    result.model,
    Message.GotEditorMessage({
      message: document.send(BuilderMessage.Selected({ id: NodeId.make(linked) })),
    }),
  )
  return {
    ...result,
    model: { ...selected.model, linked: null },
    commands: [...(result.commands ?? []), ...(selected.commands ?? [])],
  }
}

/**
 * The site's pages asked for again when the open page is saved and not among
 * them: a save makes the entry, but a list joins something new only when it is
 * asked again. Remote returns the same Model while that is under way.
 */
const listing = (model: Model): Model => {
  const stored = PageEditor.storedEntry(model)
  const pages = sitePages.read(model)
  return stored === null ||
    pages._tag !== 'Ready' ||
    pages.value.items.some(page => page.id === stored)
    ? model
    : Data.refresh(model, sitePages)
}

export const update = (model: Model, message: Message) => {
  const next = follow(stepped(model, message))
  return { ...next, model: listing(next.model) }
}

export const initial: Model = placements.initial({ remote: Remote.initial, linked: null }).model

/**
 * The address a page and a selection write, over `href`: its other parameters
 * (the chair, `as`) kept, `page` and `block` set, or removed when there is none.
 */
export const addressFor = (href: string, page: string | null, block: string | null): string => {
  const at = new URL(href, 'https://cms.invalid')
  for (const [key, value] of [
    ['page', page],
    ['block', block],
  ] as const)
    if (value === null) at.searchParams.delete(key)
    else at.searchParams.set(key, value)
  return `${at.pathname}${at.search}${at.hash}`
}

/**
 * The open page and its selection, written into the address as they change.
 * A link still waiting for its page keeps its Block there.
 */
export const address = Subscription.make<Model, Message>()(entry => ({
  address: entry(
    { page: Schema.NullOr(Schema.String), block: Schema.NullOr(Schema.String) },
    {
      modelToDependencies: model => ({
        // A new page is not in the address until it is saved: a link to it would find nothing.
        page: PageEditor.storedEntry(model),
        block: model.linked ?? selectedOf(model),
      }),
      dependenciesToStream: ({ page, block }) =>
        Stream.fromEffect(
          Effect.suspend(() => {
            const here = `${window.location.pathname}${window.location.search}${window.location.hash}`
            const next = addressFor(here, page, block)
            return next === here ? Effect.void : Navigation.replaceUrl(next)
          }),
        ).pipe(Stream.drain),
    },
  ),
}))

/**
 * What the drawn Builder is given: what the page's Blocks read, so the canvas
 * shows a Query Block's rows as the published page would, and the site's pages
 * for the inspector to pick from. Both are actives' reads, fetched while the
 * page is open.
 */
export const builderInputs = (model: Model): BuilderViewInputs => {
  const pages = sitePages.read(model)
  return BuilderView.inputs({
    data: actives.blocks.projectionOf(model)?.read(model),
    options: {
      'LatestPages.except':
        pages._tag === 'Ready' || pages._tag === 'Refreshing'
          ? pages.value.items.map(page => ({ value: page.id, label: page.label }))
          : [],
    },
  })
}

/** The page editor drawn: the form, the Builder in it drawn with `builderInputs`. */
export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  EditorSlot.view(model, h, {
    words: { submit: 'Publish' },
    controls: { document: builderInputs(model) },
  })

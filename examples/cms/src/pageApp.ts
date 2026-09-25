/**
 * The page authoring application: the CMS editor around the page form, whose
 * `document` key is the page Builder. Placed exactly as the post editor is:
 * nothing about the Builder is CMS-specific, and nothing about the CMS knows
 * there is a Builder.
 */
import { Effect, Schema } from 'effect'
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
import type { Document } from 'foldkit-composition'
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

export const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Remote.messages,
  ...Slot.cases,
  OpenedEntry: { entry: Schema.String },
  AskedForPage: {},
  StartedPage: { entry: Schema.String },
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

/** The site's pages, as the choices of a Block prop that names one: read while a page is open. */
const PageChoice = Entity.select(Cms.Entities.Entry, { id: true, label: true })
export const pageChoices = (model: Model) =>
  PageEditor.entry(model) === null
    ? undefined
    : Data.query(
        Cms.Entries,
        { type: 'pages', search: '', archived: false },
        { select: PageChoice, first: 50 },
      )

/** What the page's Query Blocks read, as one Projection: fetched while the page is open. */
export const blockReads = (model: Model) => QueryBlock.reads(Data, Site, editing(model))

export const actives = {
  ...PageEditor.actives,
  blocks: QueryBlock.active('PageBlocks', App.owner, Data, Site, editing),
  choices: {
    name: 'PageChoices',
    owner: Data.contract.owner ?? {},
    messages: [],
    projectionOf: pageChoices,
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
    default:
      return { model }
  }
})

export const update = PageEditor.after(placed)

export const initial: Model = placements.initial({ remote: Remote.initial }).model

/**
 * What the drawn Builder is given: what the page's Blocks read, so the canvas
 * shows a Query Block's rows as the published page would, and the site's pages
 * for the inspector to pick from. Both are actives' reads, fetched while the
 * page is open.
 */
export const builderInputs = (model: Model): BuilderViewInputs => {
  const pages = pageChoices(model)?.read(model)
  return BuilderView.inputs({
    data: actives.blocks.projectionOf(model)?.read(model),
    options: {
      'LatestPages.except':
        pages?._tag === 'Ready' || pages?._tag === 'Refreshing'
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

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
import { FormView } from 'foldkit-mixins-form'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import type { Command } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { Page, PageForm, PageId, PageView, Pages } from './pageDomain.js'

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

export const actives = {
  ...PageEditor.actives,
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

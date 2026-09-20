/**
 * The authoring application: the worklist, the editor, and the application's own
 * reading of a post, which is what a preview is drawn through. There is nothing
 * CMS-specific about how any of it is placed.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Cms } from 'foldkit-cms'
import { Crud } from 'foldkit-crud'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { defineMessageUnion } from 'foldkit/message'
import { EntryRow, Post, PostPage, Posts } from './domain.js'

export const Editor = Cms.editor('PostEditor', { content: Posts, rest: 0 })
const Slot = Bundle.declare(Editor.bundle, 'editor')

export const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Remote.messages,
  ...Slot.cases,
  OpenedEntry: { entry: Schema.String },
  /** The id is made where the click is handled, so `update` stays pure. */
  StartedPost: { entry: Schema.String },
  ClosedEditor: {},
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
export const Worklist = Crud.list('Worklist', { query: Cms.Entries, selection: EntryRow }).at({
  data: Data,
  input: () => ({ type: Posts.name, search: '', archived: false }),
})

/** The post as the application's own pages read it. */
export const postPage = (id: string) => Data.get(PostPage, id as never)

const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const Placed = Page.at(Slot, { onOut: PostEditor.onOut })

export const update = PostEditor.after(
  Page.assemble(Placed).update((model: Model, message: Message) => {
    switch (message._tag) {
      case 'OpenedEntry':
        return Placed.helpers.open(message.entry)(model)
      case 'StartedPost':
        return Placed.helpers.create(message.entry)(model)
      case 'ClosedEditor':
        return Placed.helpers.close()(model)
      default:
        return Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model }
    }
  }),
)

/** What Remote fetches and retains while it is on screen. */
export const actives = { worklist: Worklist.active, ...PostEditor.actives }

export const initial: Model = {
  remote: Remote.initial,
  editor: Editor.bundle.init(undefined).model,
}

import type { Document, HtmlBuilder } from 'foldkit/html'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import {
  DocumentId,
  Sync,
  type Mounted,
  type Replica,
  type Sync as SyncContract,
} from 'foldkit-sync'
import { Message, Model, initialModel, reinstalled, update, type Shared } from './app.js'

/**
 * The pages application for one tab. `session` names the tab's edits, so it is part of the
 * initial Model; everything that replays (the durable Messages and their update) is the
 * same for every session.
 */
const application = (session: string) =>
  Surface.application({ Model, Message, initial: initialModel(session), update })

const contractFor = (App: ReturnType<typeof application>) =>
  Sync.forApplication(App).make({
    documentId: DocumentId.make('pages'),
    shared: Projection.pick(App.model.pages),
    durable: MessageSet.make(App, [
      Message.CreatedPage,
      Message.RenamedPage,
      Message.DeletedPage,
      Message.EditedPage,
    ]),
    // A burst of typing or renaming the server has not seen yet goes as one operation.
    coalesce: (last, next) => {
      if (last._tag === 'RenamedPage' && next._tag === 'RenamedPage' && last.id === next.id)
        return next
      if (last._tag === 'EditedPage' && next._tag === 'EditedPage' && last.id === next.id)
        return Message.EditedPage({ id: next.id, ops: [...last.ops, ...next.ops] })
      return undefined
    },
  })

/** The contract the server and every replica share; the session plays no part in it. */
export const PagesSync: SyncContract<Message, Shared> = contractFor(application('server'))

/**
 * Runs the pages application for one tab over its replica: one reducer, edits applied at
 * once and persisted after, and another replica's edits patched into the open editor.
 */
export const mountPages = (
  session: string,
  replica: Replica<Message, Shared>,
  options: {
    readonly container: HTMLElement
    readonly view: (model: Model, h: HtmlBuilder<Message>) => Document
  },
): Mounted<Model, Message, Shared> => {
  const App = application(session)
  return Sync.mount(App, contractFor(App), {
    replica,
    onReinstall: reinstalled,
    ...options,
  })
}

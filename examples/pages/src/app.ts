import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage } from 'foldkit-richtext-dom/editor'
import { Editor, patchTo, placeEditor, type EditorView } from 'foldkit-richtext-dom/editor-bundle'
import { markdownInputRules } from 'foldkit-richtext-markdown'
import { Sync } from 'foldkit-sync'

const { Replicated } = RichText

/**
 * A page: its title, and its body as a replicated document, whose characters keep their
 * identity so that two people's edits to it both land where they were made.
 */
export const Page = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  body: Replicated.ReplicatedState,
  /**
   * In the trash: hidden, but still edited by what arrives for it, so an edit made offline
   * to a page someone else deleted is kept, and restoring the page shows it. Optional, so
   * pages stored before the trash existed still decode.
   */
  trashed: Schema.optionalKey(Schema.Boolean),
})
export type Page = typeof Page.Type

/** What every replica holds and the server orders: the pages. */
export const Shared = Schema.Struct({ pages: Schema.Array(Page) })
export type Shared = typeof Shared.Type

export const Model = Schema.Struct({
  ...Shared.fields,
  /** The page in the editor. */
  open: Schema.NullOr(Schema.String),
  /**
   * What names this tab's edits: unique per load, so `session:n` never repeats, and
   * `minted` is the `n` of the next one. Kept here because only an intent's own
   * transition may mint, and it reads the Model it was dispatched against.
   */
  session: Schema.String,
  minted: Schema.Number,
  /** The caret, held by the characters around it rather than an offset another edit moves. */
  selection: Schema.NullOr(Replicated.AnchoredSelection),
  storedMarks: Schema.NullOr(Schema.Array(Schema.String)),
  menuIndex: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  // Durable: what replays on every replica, in the server's order.
  CreatedPage: { id: Schema.String, title: Schema.String, key: Schema.String },
  RenamedPage: { id: Schema.String, title: Schema.String },
  DeletedPage: { id: Schema.String },
  RestoredPage: { id: Schema.String },
  EditedPage: { id: Schema.String, ops: Schema.Array(Replicated.ReplicatedOp) },
  // Local: what this tab asked for.
  AddedPage: { title: Schema.String },
  OpenedPage: { id: Schema.String },
  GotEditor: { message: EditorMessage },
  ToggledTask: {},
})
export type Message = typeof Message.Type
type Return = Update.Return<Model, Message>

export const hostId = 'page-body'

const nodes = RichText.nodeRegistry(RichText.standardNodes)

placeEditor(hostId, {
  rendering: RichText.standardRendering,
  vocabulary: {
    marks: RichText.markRegistry(RichText.standardMarks),
    nodes,
  },
  inputRules: markdownInputRules,
  placeholder: 'Type / for blocks, or start writing…',
})

const blank = RichText.decodeDocument({
  version: 1,
  children: [
    { type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 't', text: '', marks: [] }] },
  ],
})

export const initialModel = (session: string): Model => ({
  pages: [],
  open: null,
  session,
  minted: 0,
  selection: null,
  storedMarks: null,
  menuIndex: 0,
})

/** A page opened: the caret and what the editor carried for the last one start afresh. */
const opened = (model: Model, id: string): Model => ({
  ...model,
  open: id,
  selection: null,
  storedMarks: null,
  menuIndex: 0,
})

/** The page with this id, unless it is in the trash. */
export const pageOf = (model: Model, id: string | null): Page | undefined =>
  id === null ? undefined : model.pages.find(page => page.id === id && page.trashed !== true)

const withPage = (model: Model, id: string, change: (page: Page) => Page): Model => ({
  ...model,
  pages: model.pages.map(page => (page.id === id ? change(page) : page)),
})

/** The editor's view of the open page: the projected document, and the caret placed in it. */
export const editorViewOf = (model: Model, page: Page): EditorView => ({
  document: Replicated.project(page.body),
  selection: Replicated.resolve(page.body, model.selection),
  // The editor's own ids are placeholders: `translate` names what an edit made.
  nextId: 0,
  history: RichText.emptyHistory,
  storedMarks: model.storedMarks,
  menuIndex: model.menuIndex,
  hostId,
})

const toApp = (command: {
  readonly name: string
  readonly effect: Effect.Effect<EditorMessage>
}): Update.Commands<Message>[number] => ({
  ...command,
  effect: Effect.map(command.effect, message => Message.GotEditor({ message })),
})

/**
 * Commits an edit the editor made on the open page's projection: restates it as ops, draws
 * what they project to, and hands the ops on as the durable fact, applied in this same
 * transition. `keyed` is the document the editor's host is now keyed by: the editor's own
 * result after an edit through it, which `patchTo` hands on to the projection.
 */
const commit = (
  model: Model,
  page: Page,
  edit: Pick<Extract<RichText.TransactionResult, { readonly ok: true }>, 'transactions' | 'state'>,
  keyed: RichText.Document,
  commands: Update.Commands<Message>,
): Return => {
  const translated = Replicated.translate(page.body, edit, `${model.session}:${model.minted}`)
  // A caret move translates to no ops and mints nothing, so its key is not spent.
  if (translated.ops.length === 0) {
    return { model: { ...model, selection: translated.selection }, commands }
  }
  const next = { ...model, minted: model.minted + 1, selection: translated.selection }
  // A Message's constructor copies its arrays, so the ops drawn here are the fact's own: the
  // fact's update then applies the same array to the same body and gets back this state.
  const fact = Message.EditedPage({ id: page.id, ops: translated.ops })
  const body = Replicated.applyOps(page.body, fact.ops)
  return {
    model: next,
    commands: [
      // The editor's own patch would draw its placeholder ids, only for this one to replace
      // them; this one patches from whatever is drawn, so it is the only one needed.
      ...commands.filter(command => command.name !== 'RichText.patch'),
      toApp(
        patchTo(hostId, keyed, {
          document: Replicated.project(body),
          selection: Replicated.resolve(body, translated.selection),
        }),
      ),
      Sync.fact(fact),
    ],
  }
}

const taskAround = (document: RichText.Document, selection: RichText.Selection | null) => {
  if (selection?.type !== 'Range') return undefined
  const run = RichText.locateRun(document, selection.anchor.node)
  for (let depth = run?.path.length ?? 0; depth > 0; depth--) {
    const block = RichText.blockAtPath(document, run!.path.slice(0, depth))
    if (block?.type === 'Node' && block.kind === 'TaskItem') return block
  }
  return undefined
}

export const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    CreatedPage: ({ id, title, key }) => ({
      model: model.pages.some(page => page.id === id)
        ? model
        : {
            ...model,
            pages: [...model.pages, { id, title, body: Replicated.fromDocument(blank, key) }],
          },
    }),
    RenamedPage: ({ id, title }) => ({ model: withPage(model, id, page => ({ ...page, title })) }),
    // Durable, so it changes the pages only: a tab showing the page finds it gone.
    DeletedPage: ({ id }) => ({
      model: withPage(model, id, page => ({ ...page, trashed: true })),
    }),
    RestoredPage: ({ id }) => ({
      model: withPage(model, id, ({ trashed: _, ...page }) => page),
    }),
    EditedPage: ({ id, ops }) => ({
      model: withPage(model, id, page => ({ ...page, body: Replicated.applyOps(page.body, ops) })),
    }),
    AddedPage: ({ title }) => {
      const id = `${model.session}:${model.minted}`
      return {
        model: { ...opened(model, id), minted: model.minted + 1 },
        commands: [Sync.fact(Message.CreatedPage({ id, title, key: `${id}:seed` }))],
      }
    },
    OpenedPage: ({ id }) => ({ model: opened(model, id) }),
    GotEditor: ({ message: incoming }) => {
      const page = pageOf(model, model.open)
      // Undo is a snapshot of this tab's document, which another replica's edits have moved
      // on from; collaborative undo is a different operation, so it is not offered.
      if (page === undefined || incoming._tag === 'Undone' || incoming._tag === 'Redone') {
        return { model }
      }
      const view = editorViewOf(model, page)
      const result = Editor.update(view, incoming, { hostId })
      const interaction = {
        ...model,
        storedMarks: result.model.storedMarks,
        menuIndex: result.model.menuIndex,
      }
      const commands = (result.commands ?? []).map(toApp)
      const out = result.outMessage
      if (out?._tag !== 'Edited') return { model: interaction, commands }
      return commit(interaction, page, out, out.state.document, commands)
    },
    ToggledTask: () => {
      const page = pageOf(model, model.open)
      if (page === undefined) return { model }
      const view = editorViewOf(model, page)
      const task = taskAround(view.document, view.selection)
      if (task?.type !== 'Node') return { model }
      const result = RichText.run(
        { document: view.document, selection: view.selection },
        { type: 'SetProps', node: task.id, props: { checked: task.props.checked !== true } },
        { mint: () => 'unused' },
        { nodes },
      )
      if (!result.ok) return { model }
      return commit(model, page, result, view.document, [])
    },
  })

/**
 * When an exchange replaces the pages, the open editor is patched from what it shows to
 * what the open page now projects to, the caret placed by its anchors, rather than
 * mounted afresh; a page deleted elsewhere closes.
 */
export const reinstalled = (next: Model, previous: Model): Return => {
  const before = pageOf(previous, previous.open)
  const after = pageOf(next, next.open)
  if (after === undefined) return { model: { ...next, open: null, selection: null } }
  if (before === undefined || before.body === after.body) return { model: next }
  return {
    model: next,
    commands: [
      toApp(
        patchTo(hostId, Replicated.project(before.body), {
          document: Replicated.project(after.body),
          selection: Replicated.resolve(after.body, next.selection),
        }),
      ),
    ],
  }
}

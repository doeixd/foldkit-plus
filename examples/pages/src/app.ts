import { Effect, Equal, Match, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { linkEdit } from 'foldkit-mixins-richtext'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage } from 'foldkit-richtext-dom/editor'
import {
  Editor,
  focus,
  overlay,
  patchTo,
  placeEditor,
  type EditorView,
} from 'foldkit-richtext-dom/editor-bundle'
import { markdownInputRules } from 'foldkit-richtext-markdown'
import { Sync } from 'foldkit-sync'
import { pageSlashEntries, rendering, vocabulary } from './vocabulary.js'

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

/**
 * Where someone else is, as their tab announces it through presence: a name, the page they
 * have open, and their caret, held by the characters around it as this tab's own is.
 */
export const PeerPresence = Schema.Struct({
  name: Schema.String,
  page: Schema.NullOr(Schema.String),
  selection: Schema.NullOr(Replicated.AnchoredSelection),
})
export type PeerPresence = typeof PeerPresence.Type
export const Peer = Schema.Struct({ id: Schema.String, ...PeerPresence.fields })
export type Peer = typeof Peer.Type

/** Where this tab's edits stand with the server, as its replica's status last said. */
const Exchange = Schema.Struct({
  /** Edits stored in this tab that the server has not taken yet. */
  pending: Schema.Number,
  /** Why the last exchange failed, until one succeeds. */
  error: Schema.OptionFromNullOr(Schema.String),
})

/** One of this tab's edits, as the ops that take it back. */
const UndoStep = Schema.Struct({ page: Schema.String, ops: Schema.Array(Replicated.ReplicatedOp) })
type UndoStep = typeof UndoStep.Type

/** How many steps undo keeps. */
const UNDO_DEPTH = 200

/** The one popover open at a time. */
export const Menu = defineTaggedUnion({
  /** A block handle's menu, for the block it stands beside. */
  Block: { node: RichText.NodeId },
  /** A text style menu: the toolbar's, or the one over selected text. */
  Style: { place: Schema.Literals(['toolbar', 'floating']) },
  /** The toolbar's insert menu. */
  Insert: {},
  /** The link editor over the selection. */
  Link: {},
})
export type Menu = typeof Menu.Type

export const Model = Schema.Struct({
  ...Shared.fields,
  /** The page in the editor. */
  open: Schema.Option(Schema.String),
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
  /** The slash menu's highlighted entry, and the query Escape closed it on. */
  menuIndex: Schema.Number,
  slashDismissed: Schema.Option(RichText.Position),
  menu: Schema.Option(Menu),
  /** The top-level block under the pointer, which the block handle stands beside. */
  hovered: Schema.Option(RichText.NodeId),
  /** The address in the link editor, while it is open. */
  linkDraft: Schema.String,
  /**
   * This tab's own edits, newest last, each as the ops that take it back: undo applies
   * them as a new edit, so it reverses only what this tab did and keeps everyone else's.
   * Local to the tab, as an editor's undo is.
   */
  undo: Schema.Array(UndoStep),
  redo: Schema.Array(UndoStep),
  /** What the last step was, so a run of typing is one step. */
  undoGroup: Schema.Option(Schema.String),
  /** The other people presence reports, local to the tab and never shared. */
  peers: Schema.Array(Peer),
  /** The replica's status, for the line that says whether edits reached the server. */
  exchange: Exchange,
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
  TrashedPage: { id: Schema.String },
  GotEditor: { message: EditorMessage },
  GotPeers: { peers: Schema.Array(Peer) },
  ExchangeChanged: Exchange.fields,
  SlashMoved: { index: Schema.Number },
  HoveredBlock: { node: RichText.NodeId },
  OpenedMenu: { menu: Menu },
  ClosedMenu: {},
  /** An edit chosen from a menu, which closes as the edit is made. */
  MenuEdit: { message: EditorMessage },
  /** A handle's Turn into: the block, retyped as a text block. */
  RetypedBlock: { node: RichText.NodeId, block: RichText.TextBlock },
  /** A handle's Turn into, for a container: the block, wrapped. */
  WrappedBlock: { node: RichText.NodeId, containers: Schema.Array(RichText.Container) },
  DuplicatedBlock: { node: RichText.NodeId },
  LinkDrafted: { href: Schema.String },
  /** Enter in the link editor: the draft, as the Model holds it, applied. */
  LinkSubmitted: {},
  /** The link editor's edit: the link applied or removed, the editor closed, the text focused. */
  LinkEdited: { message: EditorMessage },
  /** The link editor's field has the focus. */
  FocusedField: {},
})
export type Message = typeof Message.Type
type Return = Update.Return<Model, Message>

export const hostId = 'page-body'

placeEditor(hostId, {
  rendering,
  vocabulary,
  inputRules: markdownInputRules,
  placeholder: 'Type / for blocks, or start writing…',
  lineHint: 'Type / for blocks',
  slashEntries: pageSlashEntries,
  // This vocabulary's own marks, beside the editor's chords for the standard ones.
  keymap: [
    { chord: 'Mod-u', command: { type: 'ToggleMark', mark: 'Underline' } },
    { chord: 'Mod-Shift-h', command: { type: 'ToggleMark', mark: 'Highlight' } },
  ],
})

const blank = RichText.decodeDocument({
  version: 1,
  children: [
    { type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 't', text: '', marks: [] }] },
  ],
})

export const initialModel = (session: string): Model => ({
  pages: [],
  open: Option.none(),
  session,
  minted: 0,
  selection: null,
  storedMarks: null,
  menuIndex: 0,
  slashDismissed: Option.none(),
  menu: Option.none(),
  hovered: Option.none(),
  linkDraft: '',
  undo: [],
  redo: [],
  undoGroup: Option.none(),
  peers: [],
  exchange: { pending: 0, error: Option.none() },
})

/**
 * A page opened, or none: what the editor and its menus carried for the last one means nothing
 * on another, so it starts afresh.
 */
const afresh = (model: Model, open: Option.Option<string>): Model =>
  modifyFields(model, {
    open: () => open,
    selection: () => null,
    storedMarks: () => null,
    menuIndex: () => 0,
    slashDismissed: () => Option.none(),
    menu: () => Option.none(),
    hovered: () => Option.none(),
    linkDraft: () => '',
    undoGroup: () => Option.none(),
  })

/** The open menu closed; the Model itself when none is. */
const menuClosed = (model: Model): Model =>
  Option.isNone(model.menu) ? model : modifyFields(model, { menu: () => Option.none() })

/**
 * One keystroke's inverse prepended to its typing group's step. Deleting what a run of typing
 * inserted is one `Delete` whose touching ranges are merged, so a long run stays one small op
 * rather than one per keystroke.
 */
const prepend = (
  inverse: ReadonlyArray<RichText.Replicated.ReplicatedOp>,
  ops: ReadonlyArray<RichText.Replicated.ReplicatedOp>,
): ReadonlyArray<RichText.Replicated.ReplicatedOp> => {
  const [added] = inverse
  const [first, ...rest] = ops
  if (inverse.length !== 1 || added?.type !== 'Delete' || first?.type !== 'Delete')
    return [...inverse, ...ops]
  const ranges = [...first.ranges]
  for (const range of added.ranges) {
    const touching = ranges.findIndex(
      held => held.id === range.id && held.from <= range.to && range.from <= held.to,
    )
    if (touching === -1) ranges.push(range)
    else {
      const held = ranges[touching]!
      ranges[touching] = {
        id: held.id,
        from: Math.min(held.from, range.from),
        to: Math.max(held.to, range.to),
      }
    }
  }
  return [{ type: 'Delete', ranges }, ...rest]
}

/** Whether two anchored selections sit by the same characters, whatever their affinity. */
const samePlace = (
  left: RichText.Replicated.AnchoredSelection | null,
  right: RichText.Replicated.AnchoredSelection | null,
): boolean => {
  if (left === null || right === null) return left === right
  if (left.type !== 'Range' || right.type !== 'Range')
    return JSON.stringify(left) === JSON.stringify(right)
  const same = (a: RichText.Replicated.AnchoredPosition, b: RichText.Replicated.AnchoredPosition) =>
    a.block === b.block && a.after === b.after
  return same(left.anchor, right.anchor) && same(left.focus, right.focus)
}

/** The page with this id, unless it is in the trash. */
export const pageOf = (model: Model, id: string): Option.Option<Page> =>
  Option.fromUndefinedOr(model.pages.find(page => page.id === id && page.trashed !== true))

/** The page in the editor, unless none is open or it went to the trash. */
export const pageInEditor = (model: Model): Option.Option<Page> =>
  Option.flatMap(model.open, id => pageOf(model, id))

/**
 * Whether this tab's edits reached the server. No pending edit means the server has every
 * one, connected or not; an edit the server has not taken is kept in this tab, across a
 * reload too, and goes when an exchange succeeds.
 */
export const savedOf = ({
  exchange: { pending, error },
}: Model): { readonly state: 'saved' | 'saving' | 'offline'; readonly text: string } => {
  const edits = `${pending} ${pending === 1 ? 'edit' : 'edits'}`
  return Option.match(error, {
    onSome: () => ({
      state: 'offline',
      text:
        pending === 0
          ? 'Offline: the server cannot be reached.'
          : `Offline: ${edits} kept in this tab until the server is back.`,
    }),
    onNone: () =>
      pending === 0
        ? { state: 'saved', text: 'All changes saved.' }
        : { state: 'saving', text: `Saving ${edits}…` },
  })
}

/** The Model with one page changed; the Model itself when that changes nothing. */
const withPage = (model: Model, id: string, change: (page: Page) => Page): Model => {
  const at = model.pages.findIndex(page => page.id === id)
  if (at === -1) return model
  const page = model.pages[at]!
  const changed = change(page)
  if (changed === page) return model
  return { ...model, pages: model.pages.map((other, index) => (index === at ? changed : other)) }
}

/** The editor's view of the open page: the projected document, and the caret placed in it. */
export const editorViewOf = (model: Model, page: Page): EditorView => ({
  document: Replicated.project(page.body),
  selection: Replicated.resolve(page.body, model.selection),
  // The editor's own ids are placeholders: `translate` names what an edit made.
  nextId: 0,
  history: RichText.emptyHistory,
  storedMarks: model.storedMarks,
  menuIndex: model.menuIndex,
  slashDismissed: model.slashDismissed,
  hostId,
})

/**
 * Where the others on the open page are, drawn over it. A caret has no width, so it is drawn
 * over the character before it, or at a run's start the one after. Their anchors are resolved
 * against `body`, so they follow the characters they were held by.
 */
const peerCarets = (
  model: Model,
  page: string,
  body: RichText.Replicated.ReplicatedState,
): RichText.DecorationSet =>
  model.peers.flatMap(peer => {
    if (peer.page !== page || peer.selection === null) return []
    const resolved = Replicated.resolve(body, peer.selection)
    if (resolved?.type !== 'Range') return []
    const at = resolved.focus
    const [from, to] = at.offset > 0 ? [at.offset - 1, at.offset] : [0, 1]
    return [
      {
        from: { ...at, offset: from },
        to: { ...at, offset: to },
        kind: at.offset > 0 ? 'peer' : 'peer-before',
        data: { name: peer.name },
      },
    ]
  })

/** The Command that draws the others' carets over the open page, as `body` now is. */
const carets = (
  model: Model,
  page: string,
  body: RichText.Replicated.ReplicatedState,
): Update.Commands<Message>[number] => toApp(overlay(hostId, peerCarets(model, page, body)))

const toApp = (command: {
  readonly name: string
  readonly effect: Effect.Effect<EditorMessage>
}): Update.Commands<Message>[number] => ({
  ...command,
  effect: Effect.map(command.effect, message => Message.GotEditor({ message })),
})

/**
 * Applies ops to the open page as the durable fact, in this same transition, and draws what
 * they project to. `keyed` is the document the editor's host is now keyed by: the editor's
 * own result after an edit through it, which `patchTo` hands on to the projection.
 */
const applyEdit = (
  model: Model,
  page: Page,
  ops: ReadonlyArray<RichText.Replicated.ReplicatedOp>,
  keyed: RichText.Document,
  commands: Update.Commands<Message>,
): Return => {
  // A Message's constructor copies its arrays, so the ops drawn here are the fact's own: the
  // fact's update then applies the same array to the same body and gets back this state.
  const fact = Message.EditedPage({ id: page.id, ops })
  const body = Replicated.applyOps(page.body, fact.ops)
  return {
    model,
    commands: [
      // The editor's own patch would draw its placeholder ids, only for this one to replace
      // them; this one patches from whatever is drawn, so it is the only one needed. First:
      // the editor's answer, among the rest, must follow the draw.
      toApp(
        patchTo(hostId, keyed, {
          document: Replicated.project(body),
          selection: Replicated.resolve(body, model.selection),
        }),
      ),
      ...commands.filter(command => command.name !== 'RichText.patch'),
      carets(model, page.id, body),
      Sync.fact(fact),
    ],
  }
}

/**
 * Commits an edit the editor made on the open page's projection: restates it as ops and
 * applies them, and records the ops that take it back. `group` names what kind of edit it
 * was, so a run of typing is one undo step.
 */
const commit = (
  model: Model,
  page: Page,
  edit: Pick<Extract<RichText.TransactionResult, { readonly ok: true }>, 'transactions' | 'state'>,
  keyed: RichText.Document,
  commands: Update.Commands<Message>,
  group: Option.Option<string>,
): Return => {
  // Only this tab's session mints under its prefix, so only this tab extends those inserts.
  const translated = Replicated.translate(page.body, edit, `${model.session}:${model.minted}`, {
    continues: id => id.startsWith(`${model.session}:`),
  })
  // A caret move translates to no ops and mints nothing, so its key is not spent. A caret
  // put elsewhere ends a run of typing; the report of where typing left it does not.
  if (translated.ops.length === 0) {
    const moved = !samePlace(translated.selection, model.selection)
    return {
      model: {
        ...model,
        selection: translated.selection,
        undoGroup: moved ? Option.none() : model.undoGroup,
      },
      commands,
    }
  }
  const inverse = Replicated.invert(page.body, translated.ops)
  const last = model.undo[model.undo.length - 1]
  // Opening a page starts a new group, so a run of typing is always on one page.
  const joins = last !== undefined && Option.isSome(group) && Equal.equals(group, model.undoGroup)
  const undo = joins
    ? [...model.undo.slice(0, -1), { page: page.id, ops: prepend(inverse, last.ops) }]
    : [...model.undo, { page: page.id, ops: inverse }].slice(-UNDO_DEPTH)
  return applyEdit(
    {
      ...model,
      minted: model.minted + 1,
      selection: translated.selection,
      undo,
      redo: [],
      undoGroup: group,
    },
    page,
    translated.ops,
    keyed,
    commands,
  )
}

/**
 * Takes the last step of `from` for the open page and applies it, pushing the ops that take
 * it back onto `to`: undo and redo are the same move in opposite directions.
 */
const replay = (model: Model, page: Page, direction: 'undo' | 'redo'): Return => {
  const from = model[direction]
  let at = from.length - 1
  while (at >= 0 && from[at]!.page !== page.id) at--
  const step = from[at]
  if (step === undefined) return { model }
  const back: UndoStep = { page: page.id, ops: Replicated.invert(page.body, step.ops) }
  const other = direction === 'undo' ? 'redo' : 'undo'
  return applyEdit(
    {
      ...model,
      [direction]: from.filter((_, index) => index !== at),
      [other]: [...model[other], back].slice(-UNDO_DEPTH),
      undoGroup: Option.none(),
    },
    page,
    step.ops,
    Replicated.project(page.body),
    [],
  )
}

/** An editor Message on the open page that is not its undo or redo. */
const edited = (model: Model, page: Page, incoming: EditorMessage): Return => {
  const view = editorViewOf(model, page)
  const result = Editor.update(view, incoming, { hostId })
  const interaction =
    result.model.storedMarks === model.storedMarks &&
    result.model.menuIndex === model.menuIndex &&
    result.model.slashDismissed === model.slashDismissed
      ? model
      : modifyFields(model, {
          storedMarks: () => result.model.storedMarks,
          menuIndex: () => result.model.menuIndex,
          slashDismissed: () => result.model.slashDismissed,
        })
  const commands = (result.commands ?? []).map(toApp)
  return Match.value(result.outMessage).pipe(
    Match.withReturnType<Return>(),
    Match.when({ _tag: 'Edited' }, out =>
      commit(
        interaction,
        page,
        out,
        out.state.document,
        commands,
        typing.has(incoming._tag) ? Option.some('typing') : Option.none(),
      ),
    ),
    Match.orElse(() => ({ model: interaction, commands })),
  )
}

/** The editor Messages that are typing, so a run of them is one undo step. */
const typing = new Set(['Typed', 'Backspace', 'DeletedForward'])

/** Editor Messages in order, as one transition: a caret placed, then what acts on it. */
const editing = (model: Model, messages: ReadonlyArray<EditorMessage>): Return =>
  messages.reduce<Return>(
    (done, message) => {
      const next = update(done.model, Message.GotEditor({ message }))
      return { model: next.model, commands: [...(done.commands ?? []), ...(next.commands ?? [])] }
    },
    { model },
  )

/** The open page's block with this identity, as the editor shows it. */
const blockOf = (model: Model, node: RichText.NodeId): RichText.Block | undefined => {
  const page = Option.getOrUndefined(pageInEditor(model))
  return page === undefined
    ? undefined
    : RichText.locateBlock(Replicated.project(page.body), node)?.block
}

const caretAtStart = (block: RichText.Block): RichText.Selection | undefined => {
  let first: RichText.Text | undefined
  RichText.eachBlock([block], inner => {
    first ??= inner.children[0]
  })
  return first === undefined
    ? undefined
    : {
        type: 'Range',
        anchor: { node: first.id, offset: 0, affinity: 'after' },
        focus: { node: first.id, offset: 0, affinity: 'after' },
      }
}

/** A handle's edit of its block: the caret put at the block's start, then the edit made there. */
const onBlock = (model: Model, node: RichText.NodeId, message: EditorMessage): Return => {
  const block = blockOf(model, node)
  const caret = block === undefined ? undefined : caretAtStart(block)
  return caret === undefined
    ? { model: menuClosed(model) }
    : editing(menuClosed(model), [EditorMessage.Selected({ selection: caret }), message])
}

/** Gives the focus to the field a control just opened, so its keys go there at once. */
const FocusField = Command.define('FocusField', {
  args: { selector: Schema.String },
  messages: [Message.FocusedField],
  execute: ({ selector }) =>
    Dom.focus(selector).pipe(Effect.ignore, Effect.as(Message.FocusedField())),
})

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
    RenamedPage: ({ id, title }) => ({
      model: withPage(model, id, page => (page.title === title ? page : { ...page, title })),
    }),
    // Durable, so it changes the pages only: a tab showing the page finds it gone.
    DeletedPage: ({ id }) => ({
      model: withPage(model, id, page =>
        page.trashed === true ? page : { ...page, trashed: true },
      ),
    }),
    RestoredPage: ({ id }) => ({
      model: withPage(model, id, page => {
        if (page.trashed !== true) return page
        const { trashed: _, ...restored } = page
        return restored
      }),
    }),
    EditedPage: ({ id, ops }) => ({
      model: withPage(model, id, page => {
        const body = Replicated.applyOps(page.body, ops)
        return body === page.body ? page : { ...page, body }
      }),
    }),
    AddedPage: ({ title }) => {
      const id = `${model.session}:${model.minted}`
      return {
        model: modifyFields(afresh(model, Option.some(id)), { minted: () => model.minted + 1 }),
        commands: [Sync.fact(Message.CreatedPage({ id, title, key: `${id}:seed` }))],
      }
    },
    // Closes the page here if it is open, then trashes it everywhere.
    TrashedPage: ({ id }) => ({
      model: Option.contains(model.open, id) ? afresh(model, Option.none()) : model,
      commands: [Sync.fact(Message.DeletedPage({ id }))],
    }),
    OpenedPage: ({ id }) => {
      if (Option.contains(model.open, id)) return { model }
      const next = afresh(model, Option.some(id))
      return {
        model: next,
        commands: Option.match(pageOf(model, id), {
          onNone: () => [],
          onSome: page => [carets(next, id, page.body)],
        }),
      }
    },
    GotPeers: ({ peers }) => {
      // Presence refreshes every few seconds with nothing new; that is not a render.
      if (JSON.stringify(peers) === JSON.stringify(model.peers)) return { model }
      const next = modifyFields(model, { peers: () => peers })
      return {
        model: next,
        commands: Option.match(pageInEditor(next), {
          onNone: () => [],
          onSome: page => [carets(next, page.id, page.body)],
        }),
      }
    },
    ExchangeChanged: ({ pending, error }) =>
      // The status is re-sent after every exchange, mostly unchanged; that is not a render.
      pending === model.exchange.pending && Equal.equals(error, model.exchange.error)
        ? { model }
        : { model: modifyFields(model, { exchange: () => ({ pending, error }) }) },
    GotEditor: ({ message: incoming }) =>
      Option.match(pageInEditor(model), {
        onNone: () => ({ model }),
        onSome: page =>
          Match.value(incoming).pipe(
            Match.withReturnType<Return>(),
            // The editor's own undo restores a snapshot of this tab's document, which others'
            // edits have moved on from; this one applies the ops that take this tab's edit back.
            Match.tag('Undone', () => replay(model, page, 'undo')),
            Match.tag('Redone', () => replay(model, page, 'redo')),
            Match.orElse(() => edited(model, page, incoming)),
          ),
      }),
    SlashMoved: ({ index }) =>
      index === model.menuIndex
        ? { model }
        : { model: modifyFields(model, { menuIndex: () => index }) },
    HoveredBlock: ({ node }) =>
      Option.getOrUndefined(model.hovered) === node
        ? { model }
        : { model: modifyFields(model, { hovered: () => Option.some(node) }) },
    OpenedMenu: ({ menu }) => {
      const shown = modifyFields(model, { menu: () => Option.some(menu) })
      return Menu.match<Return>(menu, {
        Block: () => ({ model: shown }),
        Style: () => ({ model: shown }),
        Insert: () => ({ model: shown }),
        Link: () => {
          const href = Option.match(pageInEditor(model), {
            onNone: () => '',
            onSome: page => {
              const view = editorViewOf(model, page)
              return RichText.linkAt(view.document, view.selection)?.href ?? ''
            },
          })
          return {
            model: modifyFields(shown, { linkDraft: () => href }),
            commands: [FocusField({ selector: '[data-link="address"]' })],
          }
        },
      })
    },
    ClosedMenu: () => ({ model: menuClosed(model) }),
    MenuEdit: ({ message }) => update(menuClosed(model), Message.GotEditor({ message })),
    RetypedBlock: ({ node, block }) => onBlock(model, node, EditorMessage.RetypedBlock({ block })),
    WrappedBlock: ({ node, containers }) =>
      onBlock(model, node, EditorMessage.WrappedBlock({ containers })),
    DuplicatedBlock: ({ node }) => {
      const block = blockOf(model, node)
      return block === undefined
        ? { model: menuClosed(model) }
        : editing(menuClosed(model), [EditorMessage.InsertedBlock({ block, to: { after: node } })])
    },
    LinkDrafted: ({ href }) => ({ model: modifyFields(model, { linkDraft: () => href }) }),
    LinkSubmitted: () =>
      Option.match(
        Option.flatMap(pageInEditor(model), page => {
          const view = editorViewOf(model, page)
          return linkEdit(view.document, view.selection, model.linkDraft)
        }),
        {
          onNone: () => ({ model }),
          onSome: message => update(model, Message.LinkEdited({ message })),
        },
      ),
    LinkEdited: ({ message }) => {
      const result = update(menuClosed(model), Message.GotEditor({ message }))
      const selection = Option.match(pageInEditor(result.model), {
        onNone: () => null,
        onSome: page => editorViewOf(result.model, page).selection,
      })
      return selection === null
        ? result
        : {
            ...result,
            commands: [...(result.commands ?? []), toApp(focus(hostId, selection))],
          }
    },
    FocusedField: () => ({ model }),
  })

/**
 * When an exchange replaces the pages, the open editor is patched from what it shows to
 * what the open page now projects to, the caret placed by its anchors, rather than
 * mounted afresh; a page deleted elsewhere closes.
 */
export const reinstalled = (next: Model, previous: Model): Return => {
  const before = Option.getOrUndefined(pageInEditor(previous))
  const after = Option.getOrUndefined(pageInEditor(next))
  if (after === undefined) return { model: afresh(next, Option.none()) }
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
      carets(next, after.id, after.body),
    ],
  }
}

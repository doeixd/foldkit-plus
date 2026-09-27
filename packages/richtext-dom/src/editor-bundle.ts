/**
 * The controlled-editor feasibility harness (§27): the authoritative Document
 * lives in the parent Model, the editor Bundle reads it through its Link, and a
 * single parent transition commits both the document and the interaction state.
 *
 * No DOM, no persistence, no collaboration: this exists to answer whether Bundle
 * ownership can hold a rich-text editor without a second synchronized document
 * copy or a Command that commits half the transition.
 */
import { Effect, Equal, Option, Schema } from 'effect'
import { define } from 'foldkit/customElement'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle, Link, type Wrapped } from 'foldkit-bundle'
import * as RichText from 'foldkit-richtext'
import * as Submodel from 'foldkit/submodel'
import type * as Command from 'foldkit/command'
import type * as Update from 'foldkit/update'
import {
  drawnDocument,
  events,
  Message,
  patchEditor,
  redecorateEditor,
  slashEntries,
  slashMenu,
} from './editor.js'
import {
  decorationsFor,
  inputRulesFor,
  placeDecorations,
  placeInputRules,
  placeOverlay,
  placePlaceholder,
  placeRendering,
  placeServerRendered,
  placeVocabulary,
  renderingFor,
  serverRenderedFor,
  type Vocabulary,
  vocabularyFor,
} from './host.js'
import type { Decorate } from './events.js'
import { renderEditable } from './view.js'

/** Interaction state the parent owns beside the document. */
export const EditorState = Schema.Struct({
  selection: Schema.NullOr(RichText.Selection),
  /** Caller-owned identity source: a live edit mints, replay never does. */
  nextId: Schema.Number,
  /** Local undo history: snapshots of document plus selection. */
  history: RichText.History,
  /** Null inherits neighboring marks; an array explicitly sets them, even when empty. */
  storedMarks: Schema.NullOr(Schema.Array(Schema.String)),
  /**
   * The highlighted entry in a live slash menu (§123). The document says whether the
   * caret is in a query and what matches; this is the one thing the menu owns, and
   * `update` resolves Enter against it.
   */
  menuIndex: Schema.Number,
  /**
   * The host element the view renders and the patch Command finds (§118). It is
   * per-placement, so it arrives as the Bundle's args and is carried here
   * because `read` re-projects the whole child from the parent.
   */
  hostId: Schema.String,
})
export type EditorState = typeof EditorState.Type

export const Model = Schema.Struct({
  document: RichText.Document,
  editor: EditorState,
})
export type Model = typeof Model.Type

/** What the child reads: the parent's document passes through, never stored. */
export const EditorView = Schema.Struct({
  document: RichText.Document,
  selection: Schema.NullOr(RichText.Selection),
  nextId: Schema.Number,
  history: RichText.History,
  storedMarks: Schema.NullOr(Schema.Array(Schema.String)),
  menuIndex: Schema.Number,
  hostId: Schema.String,
})
export type EditorView = typeof EditorView.Type

/** The committed edit, or the diagnostic that refused it. */
export type OutMessage =
  | {
      readonly _tag: 'Edited'
      readonly state: RichText.EditorState
      readonly changeSet: RichText.ChangeSet
      /** What the edit applied, in order, as `RichText.run` returns them. */
      readonly transactions: ReadonlyArray<RichText.Transaction>
    }
  | {
      /** Undo and redo replace the document wholesale; nothing was incremental. */
      readonly _tag: 'Replaced'
      readonly state: RichText.EditorState
      readonly changeSet: RichText.ChangeSet
    }
  | { readonly _tag: 'Rejected'; readonly error: string }

/** Where a node stands: the block holding it (null at the top), and its index there. */
interface Placed {
  readonly node: RichText.Block | RichText.Text
  readonly parent: RichText.NodeId | null
  readonly index: number
}

/** Every block and run of a document by id, nested ones included, with where it stands. */
const nodesOf = (content: RichText.Document): ReadonlyMap<RichText.NodeId, Placed> => {
  const nodes = new Map<RichText.NodeId, Placed>()
  const visit = (blocks: ReadonlyArray<RichText.Block>, parent: RichText.NodeId | null): void => {
    for (const [index, block] of blocks.entries()) {
      nodes.set(block.id, { node: block, parent, index })
      for (const [at, run] of block.children.entries()) {
        nodes.set(run.id, { node: run, parent: block.id, index: at })
      }
      if (block.type === 'Node' && block.blocks !== undefined) visit(block.blocks, block.id)
    }
  }
  visit(content.children, null)
  return nodes
}

const sameMarks = (left: RichText.Text, right: RichText.Text): boolean =>
  left.marks.length === right.marks.length &&
  left.marks.every((mark, index) => RichText.sameMark(mark, right.marks[index]!))

/** A block's own fields, apart from what it holds: its type, level, kind and props. */
const ownFields = ({ children: _runs, ...block }: RichText.Block): unknown => ({
  ...block,
  blocks: undefined,
})

/**
 * What differs between two whole documents, for a patch from one to the other, in a
 * transaction's terms: the runs whose text or marks changed and the blocks holding them,
 * blocks whose own fields changed, what came and went, and whether any block moved.
 */
export const replaceChangeSet = (
  previous: RichText.Document,
  next: RichText.Document,
): RichText.ChangeSet => {
  const before = nodesOf(previous)
  const after = nodesOf(next)
  const dirtyNodes = new Set<RichText.NodeId>()
  const textChanged = new Set<RichText.NodeId>()
  let structureChanged = false
  for (const [id, placed] of after) {
    const was = before.get(id)
    if (placed.node.type === 'Text') {
      const run = placed.node
      const old = was?.node.type === 'Text' ? was.node : undefined
      if (old === undefined || old.text !== run.text) textChanged.add(id)
      if (old === undefined || old.text !== run.text || !sameMarks(old, run)) {
        dirtyNodes.add(id)
        if (placed.parent !== null) dirtyNodes.add(placed.parent)
      }
      continue
    }
    if (was === undefined || was.parent !== placed.parent || was.index !== placed.index) {
      structureChanged = true
    }
    if (
      was === undefined ||
      !Equal.equals(ownFields(was.node as RichText.Block), ownFields(placed.node))
    ) {
      dirtyNodes.add(id)
    }
  }
  const removedNodes = new Set([...before.keys()].filter(id => !after.has(id)))
  for (const id of removedNodes) {
    const was = before.get(id)!
    if (was.node.type !== 'Text') structureChanged = true
    else if (was.parent !== null && after.has(was.parent)) dirtyNodes.add(was.parent)
  }
  return {
    dirtyNodes,
    insertedNodes: new Set([...after.keys()].filter(id => !before.has(id))),
    removedNodes,
    textChanged,
    structureChanged,
    selectionChanged: false,
  }
}

type CommandMessage = Exclude<Message, { readonly _tag: 'Undone' | 'Redone' | 'Patched' }>

const toCommand = (message: CommandMessage): RichText.Command => {
  switch (message._tag) {
    case 'Typed':
      return { type: 'InsertText', text: message.text }
    case 'Backspace':
      return { type: 'DeleteBackward' }
    case 'DeletedForward':
      return { type: 'DeleteForward' }
    case 'Entered':
      return { type: 'SplitBlock' }
    case 'ToggledMark':
      return { type: 'ToggleMark', mark: message.mark }
    case 'AppliedMark':
      return { type: 'SetMark', mark: message.mark }
    case 'ClearedMark':
      return { type: 'ClearMark', mark: message.mark }
    case 'RetypedBlock':
      return { type: 'RetypeBlock', to: message.block }
    case 'WrappedBlock':
      return { type: 'WrapBlock', containers: message.containers }
    case 'ConvertedBlock':
      return { type: 'ConvertBlock', to: message.to }
    case 'LiftedBlock':
      return { type: 'LiftBlock' }
    case 'MovedBlock':
      return { type: 'MoveBlock', node: message.node, to: message.to }
    case 'Selected':
      return { type: 'SetSelection', selection: message.selection }
    case 'Pasted':
      return { type: 'Paste', slice: message.slice }
  }
}

/**
 * The rendering effect (§118): patch the host the view rendered, once the
 * parent's transition has committed. It commits nothing, so the one-transition
 * property the proof established is untouched.
 */
const patch = (hostId: string, state: RichText.EditorState, changeSet: RichText.ChangeSet) => ({
  name: 'RichText.patch',
  effect: Effect.as(
    Effect.sync(() => {
      patchEditor(hostId, state, changeSet)
    }),
    Message.Patched(),
  ),
})

/**
 * The text between the start of the caret's block and the caret, or `''` when the
 * selection names no caret. A menu and the input rules read this; nothing about the query
 * is stored. A range is read from its start, which is where what is typed over it lands,
 * whichever way it was dragged.
 */
const textBeforeOf = (model: EditorView): string => {
  if (model.selection?.type !== 'Range') return ''
  const start = RichText.rangeStart(model.document, model.selection)
  return start === undefined ? '' : RichText.textBefore(model.document, start)
}

/** The kinds of the node blocks around the caret's block, innermost first. */
const withinOf = (model: EditorView): ReadonlyArray<string> => {
  if (model.selection?.type !== 'Range') return []
  const run = RichText.locateRun(model.document, model.selection.anchor.node)
  if (run === undefined) return []
  const kinds: Array<string> = []
  for (let depth = run.path.length - 1; depth > 0; depth--) {
    const block = RichText.blockAtPath(model.document, run.path.slice(0, depth))
    if (block?.type === 'Node') kinds.push(block.kind)
  }
  return kinds
}

const Host = define({ tag: 'foldkit-richtext', properties: {}, events: {} })

/**
 * Each host id's keys, by the document shown. The host's Mount reads its document once, so a
 * document that did not come from an edit here (a form's fill or reset, an entry opened, a
 * revision restored) needs a fresh host. A committed edit moves its document's key to the next
 * document (`carryKey`), and the document it leaves keeps none, so returning to it is a new host
 * too. The first document a host id shows has no key, as the server's render has none.
 */
const lineages = new Map<
  string,
  { next: number; readonly keys: WeakMap<RichText.Document, number> }
>()

const lineageOf = (hostId: string) => {
  const found = lineages.get(hostId)
  if (found !== undefined) return found
  const created = { next: 0, keys: new WeakMap<RichText.Document, number>() }
  lineages.set(hostId, created)
  return created
}

const hostKey = (hostId: string, document: RichText.Document): string | undefined => {
  const lineage = lineageOf(hostId)
  const key = lineage.keys.get(document) ?? lineage.next++
  lineage.keys.set(document, key)
  return key === 0 ? undefined : `${hostId}-${key}`
}

const carryKey = (hostId: string, from: RichText.Document, to: RichText.Document): void => {
  const keys = lineageOf(hostId).keys
  const key = keys.get(from)
  if (key === undefined || from === to) return
  keys.delete(from)
  keys.set(to, key)
}

/**
 * Patches the editor at `hostId` to `next`, a document the parent put in place of
 * `previous`, keeping the host element instead of mounting a new one. A parent that
 * replaces its document outside an edit here (another replica's change arriving) returns
 * this, in the same transition as the replacement.
 *
 * The host is found by the document the view renders, so `previous` is the object it
 * rendered and `next.document` the object it will render; building the Command hands the
 * host on from one to the other, so build it only to return it. The patch itself starts
 * from whatever the editor has drawn, and `next.selection` becomes the browser selection;
 * a replacement that changes nothing drawn leaves the DOM alone, selection included, as an
 * exchange that only confirms edits already shown does.
 */
export const patchTo = (
  hostId: string,
  previous: RichText.Document,
  next: RichText.EditorState,
): Command.Command<Message> => {
  carryKey(hostId, previous, next.document)
  return {
    name: 'RichText.patch',
    effect: Effect.as(
      Effect.sync(() => {
        const drawn = drawnDocument(hostId) ?? previous
        const changeSet = replaceChangeSet(drawn, next.document)
        const unchanged =
          !changeSet.structureChanged &&
          changeSet.dirtyNodes.size === 0 &&
          changeSet.removedNodes.size === 0
        if (!unchanged) patchEditor(hostId, next, changeSet)
      }),
      Message.Patched(),
    ),
  }
}

/**
 * Draws `decorations` over the editor at `hostId`, beside what its placement draws, until the
 * next overlay replaces them: decorations an application derives from its own state, such as
 * other people's carets, which a placement's `decorate` cannot see. Their positions name the
 * document shown, so an application sets them again when that changes. The caret stays put.
 */
export const overlay = (
  hostId: string,
  decorations: RichText.DecorationSet,
): Command.Command<Message> => ({
  name: 'RichText.overlay',
  effect: Effect.as(
    Effect.sync(() => {
      placeOverlay(hostId, decorations)
      redecorateEditor(hostId)
    }),
    Message.Patched(),
  ),
})

/**
 * The host element the editor mounts into, and whose id the patch Command finds (§118). It is a
 * custom element so hydration leaves what is inside it alone (§145): on the server it holds the
 * document's markup, which the editor adopts; in the browser the view declares it empty, and the
 * editor owns everything below.
 */
export const editorView = Submodel.defineView<EditorView, Message>((model, h) => {
  const serverRendered = serverRenderedFor(model.hostId)()
  const key = serverRendered ? undefined : hostKey(model.hostId, model.document)
  return Host.withMessage(h)(
    [
      h.Id(model.hostId),
      ...(key === undefined ? [] : [h.Key(key)]),
      // A custom element is inline until styled, and the editor inside it is a block.
      h.Style({ display: 'block' }),
      h.OnMount(events({ content: model.document })),
    ],
    serverRendered
      ? [
          renderEditable(
            model.document,
            renderingFor(model.hostId),
            decorationsFor(model.hostId)(model.document),
          ),
        ]
      : [],
  )
})

/** What a Message does to the editor; `Editor.update` carries the host's key on a commit. */
const transition = (
  model: EditorView,
  incoming: Message,
): Update.ReturnWithOutMessage<EditorView, Message, OutMessage> => {
  const state: RichText.EditorState = { document: model.document, selection: model.selection }
  // The vocabulary this placement resolves edits against; both fields may be absent.
  const vocabulary = vocabularyFor(model.hostId)
  // A live query decides what Enter means before anything else reads the message
  // (§123): the highlighted entry applies as the Message a click would send, instead
  // of splitting, and a query that chooses nothing falls through to `incoming` and
  // still splits. Substituting the Message here rather than recursing is what makes a
  // mark entry update the caret's stored marks through the path a toggle already uses.
  const menu =
    incoming._tag === 'Entered'
      ? slashMenu(slashEntries, textBeforeOf(model), model.menuIndex)
      : undefined
  const message = menu?.highlighted?.message ?? incoming
  // The patch Command's own completion: the render already happened.
  if (message._tag === 'Patched') return { model }
  if (message._tag === 'Undone' || message._tag === 'Redone') {
    const restored =
      message._tag === 'Undone'
        ? RichText.undo(model.history, state)
        : RichText.redo(model.history, state)
    if (restored === undefined) {
      return {
        model,
        outMessage: {
          _tag: 'Rejected',
          error: message._tag === 'Undone' ? 'NothingToUndo' : 'NothingToRedo',
        },
      }
    }
    const changeSet = replaceChangeSet(model.document, restored.state.document)
    return {
      model: {
        ...model,
        selection: restored.state.selection,
        history: restored.history,
      },
      outMessage: { _tag: 'Replaced', state: restored.state, changeSet },
      commands: [patch(model.hostId, restored.state, changeSet)],
    }
  }
  let nextId = model.nextId
  // With nothing selected, a mark toggle is the caret's own state: the next
  // typed text lands with it. A caret move ends the format it was carrying.
  const collapsed =
    model.selection?.type === 'Range' &&
    model.selection.anchor.node === model.selection.focus.node &&
    model.selection.anchor.offset === model.selection.focus.offset
  // The caret never carries a mark the vocabulary cannot type — an unknown one, or one
  // like Link whose props a bare name lacks — so it is refused here rather than at the
  // first keystroke after it.
  if (
    message._tag === 'ToggledMark' &&
    collapsed &&
    !(vocabulary.marks ?? RichText.shippedRegistry).accepts(message.mark)
  ) {
    return { model, outMessage: { _tag: 'Rejected', error: 'InvalidInput' } }
  }
  const storedMarks =
    message._tag === 'ToggledMark' && collapsed
      ? model.storedMarks?.includes(message.mark)
        ? model.storedMarks.filter(mark => mark !== message.mark)
        : [...(model.storedMarks ?? []), message.mark]
      : message._tag === 'Selected'
        ? null
        : model.storedMarks
  const command =
    message._tag === 'Typed' && storedMarks !== null
      ? ({ type: 'InsertText', text: message.text, marks: storedMarks } as const)
      : toCommand(message)
  // Choosing an entry removes the query it was typed into and applies the choice as
  // one action (§124 §5), so one transition and one undo step cover both. The range is
  // a read, not state: `menu.query` is the text the document already holds, and the
  // `+ 1` is the slash that opened it.
  const queryRange =
    menu === undefined || menu.highlighted === undefined || model.selection?.type !== 'Range'
      ? undefined
      : RichText.textRangeBefore(model.document, model.selection.anchor, menu.query.length + 1)
  const runAction = (action: RichText.Action) =>
    RichText.runAction(
      state,
      action,
      { mint: () => `e${nextId++}` },
      { marks: vocabulary.marks, nodes: vocabulary.nodes },
    )
  // What is typed can be a block marker (§124 §4): the rules are the placement's own, so
  // the editor carries none of any syntax's vocabulary itself.
  const ruled =
    queryRange === undefined && message._tag === 'Typed'
      ? RichText.applyInputRules(inputRulesFor(model.hostId), {
          textBefore: textBeforeOf(model),
          text: message.text,
          insertion: command,
          within: withinOf(model),
        })
      : undefined
  const attempt = runAction(
    queryRange !== undefined
      ? [{ type: 'SetSelection', selection: queryRange }, { type: 'DeleteBackward' }, command]
      : (ruled ?? [command]),
  )
  // A rule the vocabulary refuses — a fence typed into bold text, say — leaves the marker
  // as the text it is, rather than refusing the keystroke along with it. The refused
  // attempt's identities are given back first.
  const fallback = !attempt.ok && ruled !== undefined
  if (fallback) nextId = model.nextId
  const result = fallback ? runAction([command]) : attempt
  if (!result.ok) {
    // A refused command changes nothing, so it does not burn identities.
    return { model, outMessage: { _tag: 'Rejected', error: result.error } }
  }
  // History holds content, not cursor movement: a selection change keeps the
  // redo stack, and a no-op edit adds no step to undo.
  const contentChanged = result.state.document !== model.document
  return {
    model: {
      ...model,
      selection: result.state.selection,
      nextId,
      storedMarks,
      history: contentChanged
        ? RichText.commit(model.history, state, { group: RichText.groupFor(command) })
        : model.history,
    },
    outMessage: {
      _tag: 'Edited',
      state: result.state,
      changeSet: result.changeSet,
      transactions: result.transactions,
    },
    commands: [patch(model.hostId, result.state, result.changeSet)],
  }
}

export const Editor = Bundle.make({
  name: 'RichTextEditor',
  Model: EditorView,
  Message,
  args: Schema.Struct({ hostId: Schema.String }),
  // A read-only projection has no initial content of its own; the placement
  // writes only the interaction fields back, so this never becomes the document.
  // The host id is the one thing the child seeds: it is per-placement, and `read`
  // re-projects everything else.
  init: args => ({
    model: {
      document: RichText.Document.make({ version: 1, children: [] }),
      selection: null,
      nextId: 0,
      history: RichText.emptyHistory,
      storedMarks: null,
      menuIndex: 0,
      hostId: args.hostId,
    },
  }),
  update: (model, incoming): Update.ReturnWithOutMessage<EditorView, Message, OutMessage> => {
    const result = transition(model, incoming)
    const out = result.outMessage
    if (out?._tag === 'Edited' || out?._tag === 'Replaced')
      carryKey(model.hostId, model.document, out.state.document)
    return result
  },
  // The host element belongs to the view; everything below it belongs to the
  // interpreter the mount attaches there.
  view: editorView,
})

const GotEditor = Link.wrapper('GotEditorMessage', Message)

export const ParentMessage = defineMessageUnion({ ...GotEditor.cases })
export type ParentMessage = typeof ParentMessage.Type

const editorLink: Link<
  Model,
  Wrapped<'GotEditorMessage', Message>,
  EditorView,
  Message
> = Link.make({
  // The child sees the parent's document; the parent owns it.
  read: parent =>
    Option.some({
      document: parent.document,
      selection: parent.editor.selection,
      nextId: parent.editor.nextId,
      history: parent.editor.history,
      storedMarks: parent.editor.storedMarks,
      menuIndex: parent.editor.menuIndex,
      hostId: parent.editor.hostId,
    }),
  // Only interaction state is written back: the document is not the child's.
  write: (parent, child) => ({
    ...parent,
    editor: {
      selection: child.selection,
      nextId: child.nextId,
      history: child.history,
      storedMarks: child.storedMarks,
      menuIndex: child.menuIndex,
      hostId: child.hostId,
    },
  }),
  wrapper: GotEditor,
  path: ['editor'],
})

/**
 * What a placement gives its editor. Each is placed by host id rather than passed as an arg
 * (§122): each holds functions or schemas, which a schema-decoded arg cannot describe.
 */
export interface EditorPlacement {
  /** How this editor's marks and node kinds render (§121). Defaults to `noRendering`. */
  readonly rendering?: RichText.Rendering | undefined
  /** The vocabulary its edits resolve against (§125). Defaults to none. */
  readonly vocabulary?: Vocabulary | undefined
  /** The rules applied to what is typed (§128). Defaults to none. */
  readonly inputRules?: ReadonlyArray<RichText.InputRule> | undefined
  /**
   * What is drawn over the document (§129), derived from it on every patch: code
   * highlighting, for one. Defaults to nothing.
   */
  readonly decorate?: Decorate | undefined
  /** What the editor shows while its document is blank (`RichText.isBlank`). Defaults to none. */
  readonly placeholder?: string | undefined
  /**
   * Whether this render is the server's (§145), such as `foldkit-ssr`'s `SSR.serving`. While it
   * is, the host carries the document's markup, which the browser's editor adopts instead of
   * drawing again. Defaults to never, so the host is empty until the editor mounts.
   */
  readonly serverRendered?: (() => boolean) | undefined
}

/**
 * Records everything a placement names for its host id, replacing what the id had: one call,
 * so a placement cannot half-apply. `editorAt` and the form control both place through it.
 */
export const placeEditor = (hostId: string, placement: EditorPlacement): void => {
  placeRendering(hostId, placement.rendering ?? RichText.noRendering)
  placeVocabulary(hostId, placement.vocabulary ?? {})
  placeInputRules(hostId, placement.inputRules ?? [])
  placeDecorations(hostId, placement.decorate ?? (() => []))
  placePlaceholder(hostId, placement.placeholder)
  placeServerRendered(hostId, placement.serverRendered ?? (() => false))
}

/**
 * Places one editor, bound to the host element the view renders and the patch Command
 * finds. Each placement picks its own id and names what it places; one call records all
 * of it, so a placement cannot half-apply.
 */
export const editorAt = (hostId: string, placement: EditorPlacement = {}) => {
  placeEditor(hostId, placement)
  return Editor.at(editorLink, {
    args: { hostId },
    // Runs with the child already written back, in the same parent transition.
    onOut: (out: OutMessage) => (parent: Model) =>
      out._tag === 'Edited' || out._tag === 'Replaced'
        ? {
            model: {
              ...parent,
              document: out.state.document,
              editor: { ...parent.editor, selection: out.state.selection },
            },
          }
        : { model: parent },
  })
}

export const editor = editorAt('richtext-editor')

export const application = Bundle.assemble<Model, ParentMessage>()([editor])

/** The parent's update: placement Messages route to the editor, others stand still. */
export const update = application.update()

/** Wraps one editor Message as the parent Message that carries it. */
export const edited = (message: Message): ParentMessage => GotEditor.make(message)
export const typed = (text: string): ParentMessage => edited(Message.Typed({ text }))
export const pressed = (tag: 'Backspace' | 'DeletedForward' | 'Entered'): ParentMessage =>
  edited(Message[tag]())
export const toggled = (mark: string): ParentMessage => edited(Message.ToggledMark({ mark }))
export const applied = (mark: RichText.RunMark): ParentMessage =>
  edited(Message.AppliedMark({ mark }))
export const cleared = (mark: string): ParentMessage => edited(Message.ClearedMark({ mark }))
export const retyped = (block: RichText.TextBlock): ParentMessage =>
  edited(Message.RetypedBlock({ block }))
export const wrapped = (containers: ReadonlyArray<RichText.Container>): ParentMessage =>
  edited(Message.WrappedBlock({ containers }))
export const converted = (to: RichText.Container): ParentMessage =>
  edited(Message.ConvertedBlock({ to }))
export const lifted = (): ParentMessage => edited(Message.LiftedBlock())
export const moved = (node: RichText.NodeId, to: RichText.Beside): ParentMessage =>
  edited(Message.MovedBlock({ node, to }))
export const selected = (selection: RichText.Selection | null): ParentMessage =>
  edited(Message.Selected({ selection }))
export const undone = (): ParentMessage => edited(Message.Undone())
export const redone = (): ParentMessage => edited(Message.Redone())
export const patched = (): ParentMessage => edited(Message.Patched())

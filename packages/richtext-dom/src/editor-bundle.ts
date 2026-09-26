/**
 * The controlled-editor feasibility harness (§27): the authoritative Document
 * lives in the parent Model, the editor Bundle reads it through its Link, and a
 * single parent transition commits both the document and the interaction state.
 *
 * No DOM, no persistence, no collaboration: this exists to answer whether Bundle
 * ownership can hold a rich-text editor without a second synchronized document
 * copy or a Command that commits half the transition.
 */
import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle, Link, type Wrapped } from 'foldkit-bundle'
import * as RichText from 'foldkit-richtext'
import * as Submodel from 'foldkit/submodel'
import type * as Update from 'foldkit/update'
import { events, Message, patchEditor, slashEntries, slashMenu } from './editor.js'
import {
  inputRulesFor,
  placeInputRules,
  placeRendering,
  placeVocabulary,
  vocabularyFor,
  type Vocabulary,
} from './host.js'

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
    }
  | {
      /** Undo and redo replace the document wholesale; nothing was incremental. */
      readonly _tag: 'Replaced'
      readonly state: RichText.EditorState
      readonly changeSet: RichText.ChangeSet
    }
  | { readonly _tag: 'Rejected'; readonly error: string }

const idsOf = (content: RichText.Document): ReadonlySet<RichText.NodeId> =>
  new Set(content.children.flatMap(block => [block.id, ...block.children.map(run => run.id)]))

/** Everything that differs between two whole documents, for a replace patch. */
export const replaceChangeSet = (
  previous: RichText.Document,
  next: RichText.Document,
): RichText.ChangeSet => {
  const before = idsOf(previous)
  const after = idsOf(next)
  return {
    dirtyNodes: after,
    insertedNodes: new Set([...after].filter(id => !before.has(id))),
    removedNodes: new Set([...before].filter(id => !after.has(id))),
    textChanged: new Set(),
    structureChanged: true,
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
    case 'RetypedBlock':
      return { type: 'RetypeBlock', to: message.block }
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
    // The caret never carries a mark the vocabulary cannot type, so an unknown
    // one is refused here rather than at the first keystroke after it.
    if (
      message._tag === 'ToggledMark' &&
      collapsed &&
      !(vocabulary.marks ?? RichText.shippedRegistry).declares(message.mark)
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
    const result = RichText.runAction(
      state,
      // What is typed can be a block marker (§124 §4): the rules are the placement's own,
      // so the editor carries none of any syntax's vocabulary itself.
      queryRange !== undefined
        ? [{ type: 'SetSelection', selection: queryRange }, { type: 'DeleteBackward' }, command]
        : message._tag === 'Typed'
          ? RichText.applyInputRules(inputRulesFor(model.hostId), {
              textBefore: textBeforeOf(model),
              text: message.text,
              insertion: command,
            })
          : [command],
      { mint: () => `e${nextId++}` },
      { marks: vocabulary.marks, nodes: vocabulary.nodes },
    )
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
      outMessage: { _tag: 'Edited', state: result.state, changeSet: result.changeSet },
      commands: [patch(model.hostId, result.state, result.changeSet)],
    }
  },
  // The host element belongs to the view; everything below it belongs to the
  // interpreter the mount attaches there.
  view: Submodel.defineView<EditorView, Message>((model, h) =>
    h.div([h.Id(model.hostId), h.OnMount(events({ content: model.document }))], []),
  ),
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
 * (§122): all three hold functions or schemas, which a schema-decoded arg cannot describe.
 */
export interface EditorPlacement {
  /** How this editor's marks and node kinds render (§121). Defaults to `noRendering`. */
  readonly rendering?: RichText.Rendering | undefined
  /** The vocabulary its edits resolve against (§125). Defaults to none. */
  readonly vocabulary?: Vocabulary | undefined
  /** The rules applied to what is typed (§128). Defaults to none. */
  readonly inputRules?: ReadonlyArray<RichText.InputRule> | undefined
}

/**
 * Places one editor, bound to the host element the view renders and the patch Command
 * finds. Each placement picks its own id and names what it places; one call records all
 * three, so a placement cannot half-apply.
 */
export const editorAt = (hostId: string, placement: EditorPlacement = {}) => {
  placeRendering(hostId, placement.rendering ?? RichText.noRendering)
  placeVocabulary(hostId, placement.vocabulary ?? {})
  placeInputRules(hostId, placement.inputRules ?? [])
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
export const retyped = (block: RichText.TextBlock): ParentMessage =>
  edited(Message.RetypedBlock({ block }))
export const selected = (selection: RichText.Selection | null): ParentMessage =>
  edited(Message.Selected({ selection }))
export const undone = (): ParentMessage => edited(Message.Undone())
export const redone = (): ParentMessage => edited(Message.Redone())
export const patched = (): ParentMessage => edited(Message.Patched())

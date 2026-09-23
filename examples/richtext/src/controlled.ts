/**
 * The controlled-editor feasibility harness (§27): the authoritative Document
 * lives in the parent Model, the editor Bundle reads it through its Link, and a
 * single parent transition commits both the document and the interaction state.
 *
 * No DOM, no persistence, no collaboration: this exists to answer whether Bundle
 * ownership can hold a rich-text editor without a second synchronized document
 * copy or a Command that commits half the transition.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle, Link, type Wrapped } from 'foldkit-bundle'
import * as RichText from 'foldkit-richtext'

/** Interaction state the parent owns beside the document. */
export const EditorState = Schema.Struct({
  selection: Schema.NullOr(RichText.Selection),
  /** Caller-owned identity source: a live edit mints, replay never does. */
  nextId: Schema.Number,
  /** Local undo history: snapshots of document plus selection. */
  history: RichText.History,
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
})
export type EditorView = typeof EditorView.Type

export const Message = defineMessageUnion({
  Typed: { text: Schema.String },
  Backspace: {},
  DeletedForward: {},
  Entered: {},
  ToggledMark: { mark: Schema.String },
  Selected: { selection: Schema.NullOr(RichText.Selection) },
  Undone: {},
  Redone: {},
})
export type Message = typeof Message.Type

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

type CommandMessage = Exclude<Message, { readonly _tag: 'Undone' | 'Redone' }>

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
    case 'Selected':
      return { type: 'SetSelection', selection: message.selection }
  }
}

export const Editor = Bundle.make({
  name: 'RichTextEditor',
  Model: EditorView,
  Message,
  // A read-only projection has no initial content of its own; the placement
  // writes only the interaction fields back, so this never becomes the document.
  init: () => ({
    model: {
      document: RichText.Document.make({ version: 1, children: [] }),
      selection: null,
      nextId: 0,
      history: RichText.emptyHistory,
    },
  }),
  update: (model, message): { readonly model: EditorView; readonly outMessage: OutMessage } => {
    const state: RichText.EditorState = { document: model.document, selection: model.selection }
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
      return {
        model: {
          ...model,
          selection: restored.state.selection,
          history: restored.history,
        },
        outMessage: {
          _tag: 'Replaced',
          state: restored.state,
          changeSet: replaceChangeSet(model.document, restored.state.document),
        },
      }
    }
    let nextId = model.nextId
    const command = toCommand(message)
    const result = RichText.run(state, command, { mint: () => `e${nextId++}` })
    if (!result.ok) {
      // A refused command changes nothing, so it does not burn identities.
      return { model, outMessage: { _tag: 'Rejected', error: result.error } }
    }
    return {
      model: {
        ...model,
        selection: result.state.selection,
        nextId,
        history: RichText.commit(model.history, state, {
          group: RichText.groupFor(command),
        }),
      },
      outMessage: { _tag: 'Edited', state: result.state, changeSet: result.changeSet },
    }
  },
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
    }),
  // Only interaction state is written back: the document is not the child's.
  write: (parent, child) => ({
    ...parent,
    editor: { selection: child.selection, nextId: child.nextId, history: child.history },
  }),
  wrapper: GotEditor,
  path: ['editor'],
})

export const editor = Editor.at(editorLink, {
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

export const application = Bundle.assemble<Model, ParentMessage>()([editor])

/** The parent's update: placement Messages route to the editor, others stand still. */
export const update = application.update()

export const typed = (text: string): ParentMessage => GotEditor.make(Message.Typed({ text }))
export const pressed = (tag: 'Backspace' | 'DeletedForward' | 'Entered'): ParentMessage =>
  GotEditor.make(Message[tag]())
export const toggled = (mark: string): ParentMessage =>
  GotEditor.make(Message.ToggledMark({ mark }))
export const selected = (selection: RichText.Selection | null): ParentMessage =>
  GotEditor.make(Message.Selected({ selection }))
export const undone = (): ParentMessage => GotEditor.make(Message.Undone())
export const redone = (): ParentMessage => GotEditor.make(Message.Redone())

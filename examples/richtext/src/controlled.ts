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
})
export type EditorView = typeof EditorView.Type

export const Message = defineMessageUnion({
  Typed: { text: Schema.String },
  Backspace: {},
  DeletedForward: {},
  Entered: {},
  ToggledMark: { mark: Schema.String },
  Selected: { selection: Schema.NullOr(RichText.Selection) },
})
export type Message = typeof Message.Type

/** The committed edit, or the diagnostic that refused it. */
export type OutMessage =
  | { readonly _tag: 'Edited'; readonly state: RichText.EditorState }
  | { readonly _tag: 'Rejected'; readonly error: string }

const toCommand = (message: Message): RichText.Command => {
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
    },
  }),
  update: (model, message): { readonly model: EditorView; readonly outMessage: OutMessage } => {
    let nextId = model.nextId
    const result = RichText.run(
      { document: model.document, selection: model.selection },
      toCommand(message),
      { mint: () => `e${nextId++}` },
    )
    if (!result.ok) {
      // A refused command changes nothing, so it does not burn identities.
      return { model, outMessage: { _tag: 'Rejected', error: result.error } satisfies OutMessage }
    }
    return {
      model: { ...model, selection: result.state.selection, nextId },
      outMessage: { _tag: 'Edited', state: result.state } satisfies OutMessage,
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
    }),
  // Only interaction state is written back: the document is not the child's.
  write: (parent, child) => ({
    ...parent,
    editor: { selection: child.selection, nextId: child.nextId },
  }),
  wrapper: GotEditor,
  path: ['editor'],
})

export const editor = Editor.at(editorLink, {
  // Runs with the child already written back, in the same parent transition.
  onOut: (out: OutMessage) => (parent: Model) =>
    out._tag === 'Edited'
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

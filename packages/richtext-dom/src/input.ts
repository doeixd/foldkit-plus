/**
 * The rich-text editor as a form control (§12, §139): a document a `foldkit-form` key
 * validates and submits.
 *
 * The editor Bundle leaves the document to its parent and reports each edit as an
 * OutMessage. A form key has no parent to report to — `Input.bundle` refuses an OutMessage,
 * which would otherwise be dropped — so this Bundle is the same editor holding its document
 * in its own Model: its `update` is the editor's, with each committed edit folded back in.
 * The form owns that Model as the key's draft, and the document is the key's value.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Input } from 'foldkit-form'
import * as RichText from 'foldkit-richtext'
import { Message } from './editor.js'
import {
  Editor,
  EditorView,
  editorView,
  placeEditor,
  type EditorPlacement,
} from './editor-bundle.js'

/**
 * A document with one empty paragraph: what a new record's editor starts with, since a
 * caret needs a block to sit in. Its identities are fixed, and the editor mints `e`-prefixed
 * ones after it, so they never meet.
 */
const blank = (): RichText.Document =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'blank',
        children: [{ type: 'Text', id: 'blank-t', text: '', marks: [] }],
      },
    ],
  })

/** The editor with its document in its own Model: no parent, so no OutMessage. */
export const EditorInput = Bundle.make({
  name: 'RichTextInput',
  Model: EditorView,
  Message,
  args: Schema.Struct({ hostId: Schema.String }),
  init: args => ({ model: { ...Editor.init(args).model, document: blank(), loaded: 0 } }),
  update: (model, message, args) => {
    const { model: next, outMessage, commands } = Editor.update(model, message, args)
    // An edit and an undo carry the state to commit; a refusal changes nothing to keep.
    const committed =
      outMessage?._tag === 'Edited' || outMessage?._tag === 'Replaced'
        ? outMessage.state
        : undefined
    return {
      model:
        committed === undefined
          ? next
          : { ...next, document: committed.document, selection: committed.selection },
      ...(commands === undefined ? {} : { commands }),
    }
  },
  view: editorView,
})

/**
 * A form control editing a document, placed at `hostId` as `editorAt` places an editor —
 * the same rendering, vocabulary, input rules, decorations, and placeholder. A blank
 * document (`RichText.isBlank`) is nothing entered, so a required key refuses it.
 */
export const richTextInput = (hostId: string, placement: EditorPlacement = {}) => {
  placeEditor(hostId, placement)
  return Input.bundle('RichText', {
    bundle: EditorInput,
    args: { hostId },
    value: model => (RichText.isBlank(model.document) ? undefined : model.document),
    // A given document starts its own history: undoing past it would reach the form's blank.
    fill: (model, document: RichText.Document) => ({
      ...model,
      document,
      selection: null,
      history: RichText.emptyHistory,
      storedMarks: null,
      loaded: (model.loaded ?? 0) + 1,
    }),
    // The count goes on, or a reset of an editor never filled would key the host it has.
    reset: (model, initial) => ({ ...initial, loaded: (model.loaded ?? 0) + 1 }),
    // A stored draft shown again keeps its caret, format, and history (§12); only the slash
    // menu's highlight belongs to the moment it was typed in.
    settled: model => ({ ...model, menuIndex: 0 }),
  })
}

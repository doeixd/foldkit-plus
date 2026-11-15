/**
 * The rich-text editor as a form control (§124 §12, §139): a document a `foldkit-form` key
 * validates and submits.
 *
 * The editor Bundle leaves the document to its parent and reports each edit as an
 * OutMessage. A form key has no parent to report to — `Input.bundle` refuses an OutMessage,
 * which would otherwise be dropped — so this Bundle is the same editor holding its document
 * in its own Model: its `update` is the editor's, with each committed edit folded back in.
 * The form owns that Model as the key's draft, and the document is the key's value.
 */
import { Match, Option, Schema } from 'effect'
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
  init: args => ({ model: { ...Editor.init(args).model, document: blank() } }),
  update: (model, message, args) => {
    const { model: next, outMessage, commands } = Editor.update(model, message, args)
    // An edit and an undo carry the state to commit; a refusal changes nothing to keep.
    const committed =
      outMessage === undefined
        ? undefined
        : Match.valueTags(outMessage, {
            Edited: ({ state }) => state,
            Replaced: ({ state }) => state,
            Rejected: () => undefined,
          })
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
 * How a key holds a type other than a `RichText.Document` while the editor still holds one: a
 * stored Markdown text, say. `value` runs on every read of the key and `fill` on a given value, so
 * both stay a plain function of their argument. `fill` is called with stored data and may throw,
 * which fails the form's `fill` as any control that cannot show a value does.
 */
export interface RichTextCodec<A> {
  /** The key's value for a document the editor holds. It is never called with a blank one. */
  readonly value: (document: RichText.Document) => A
  /** The document the editor shows for a value the form was given. */
  readonly fill: (value: A) => RichText.Document
}

const documentCodec: RichTextCodec<RichText.Document> = {
  value: document => document,
  fill: document => document,
}

const control = <A>(hostId: string, placement: EditorPlacement, codec: RichTextCodec<A>) => {
  placeEditor(hostId, placement)
  return Input.bundle('RichText', {
    bundle: EditorInput,
    args: { hostId },
    value: model => (RichText.isBlank(model.document) ? undefined : codec.value(model.document)),
    // A given document starts its own history: undoing past it would reach the form's blank.
    fill: (model, value: A) => ({
      ...model,
      document: codec.fill(value),
      selection: null,
      history: RichText.emptyHistory,
      storedMarks: null,
      hostId,
    }),
    // A stored draft shown again keeps its caret, format, and history (§124 §12); only the slash
    // menu's highlight and dismissal belong to the moment it was typed in. The host is this placement's, not
    // whichever one the draft was stored from.
    settled: model => ({ ...model, menuIndex: 0, slashDismissed: Option.none(), hostId }),
  })
}

/**
 * A form control editing a document, placed at `hostId` with everything `editorAt` places
 * (`EditorPlacement`). A blank document (`RichText.isBlank`) is nothing entered, so a required
 * key refuses it, and a `codec` is never asked about one. With a `codec` the key holds what it
 * converts to (`value`) and from (`fill`); the editor holds a document either way.
 */
export function richTextInput(
  hostId: string,
  placement?: EditorPlacement,
): ReturnType<typeof control<RichText.Document>>
export function richTextInput<A>(
  hostId: string,
  placement: EditorPlacement,
  options: { readonly codec: RichTextCodec<A> },
): ReturnType<typeof control<A>>
export function richTextInput(
  hostId: string,
  placement: EditorPlacement = {},
  // The overloads above are what a caller sees; no codec is the Document one.
  options?: { readonly codec: RichTextCodec<any> },
) {
  return control(hostId, placement, options?.codec ?? documentCodec)
}

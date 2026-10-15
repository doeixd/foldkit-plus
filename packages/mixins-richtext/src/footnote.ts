/**
 * The footnote preview: the note a reference at the caret points to, a way to go to it, and its
 * label to rename, drawn through slots. It holds no state: which footnote is a read of the
 * document (`RichText.footnoteAt`), renaming is the editor's own `RenamedFootnote`, and going to
 * the note is the caller's Message, since moving the focus there is a Command the caller runs.
 */
import type { Html } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage, type EditorEvent } from 'foldkit-richtext-dom/editor'

/** The elements the preview publishes: its card, the label field, the note's text, and the button. */
export const FootnotePreviewSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.TextInput }),
  text: Slot.make({ capability: Capability.Container }),
  button: Slot.make({ capability: Capability.Interactive }),
})

export interface FootnotePreviewInput<Message> {
  readonly document: RichText.Document
  readonly selection: RichText.Selection | null
  /** Go to the note: the caller puts the caret at the definition's start (`focus`). */
  readonly opened: (definition: RichText.NodeId) => Message
  /** An editor Message as this caller's, usually its `edited(...)` wrapper. */
  readonly wrap: (message: EditorEvent) => Message
}

/**
 * The preview as a slot view, drawn while the caret is in a footnote reference and nothing
 * otherwise. The label field renames the footnote when it changes (`RenamedFootnote`, which the
 * editor refuses for a label in use). A note with no text reads "No note yet"; with no definition
 * at all, Go to note is disabled.
 */
export const footnotePreview = <Message>(): SlotView.SlotView<
  typeof FootnotePreviewSlots,
  FootnotePreviewInput<Message>,
  Message
> =>
  SlotView.forMessages<Message>().define(FootnotePreviewSlots, (input, slots, h): Html => {
    const label = RichText.footnoteAt(input.document, input.selection)
    if (label === undefined) return h.empty
    const note = RichText.footnotesOf(input.document).find(each => each.label === label)
    const definition = note?.definition
    return h.div(slots.root.attrs([h.Role('group'), h.AriaLabel(`Footnote ${label}`)]), [
      h.input(
        slots.label.attrs([
          h.Type('text'),
          h.AriaLabel('Footnote label'),
          h.Value(label),
          h.OnChange(to => input.wrap(EditorMessage.RenamedFootnote({ from: label, to }))),
        ]),
      ),
      h.p(slots.text.attrs(), [note === undefined || note.text === '' ? 'No note yet' : note.text]),
      h.button(
        slots.button.attrs([
          h.Type('button'),
          h.Disabled(definition === undefined),
          ...(definition === undefined ? [] : [h.OnClick(input.opened(definition))]),
        ]),
        ['Go to note'],
      ),
    ])
  })

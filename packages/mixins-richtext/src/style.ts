/**
 * The block style picker (§11, §134): a button per text style the caret's block can take —
 * a paragraph, or a heading — drawn through slots like the mark toolbar.
 *
 * The styles are the slash menu's retype entries, so the two offer the same list under the
 * same labels. Which one is pressed is a read of the document (`RichText.textBlockAt`); what a
 * button sends is its entry's `RetypedBlock`, wrapped for the caller. Lists, quotes, and code
 * blocks are not styles here: leaving one is a lift or a replace, not a retype, so a picker
 * that listed them would send a Message that does not undo what it shows.
 */
import { Equal } from 'effect'
import type { Html } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'
import { slashEntries, type EditorEvent, type SlashEntry } from 'foldkit-richtext-dom/editor'

type Retype = Extract<EditorEvent, { readonly _tag: 'RetypedBlock' }>

const styles = slashEntries.filter(
  (entry): entry is SlashEntry<Retype> => entry.message._tag === 'RetypedBlock',
)

/** The elements the picker publishes: its wrapper, its row, and one button per style. */
export const BlockStyleSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  toolbar: Slot.make({ capability: Capability.Collection }),
  button: Slot.make({ capability: Capability.Interactive }),
})

export interface BlockStyleInput<Message> {
  readonly document: RichText.Document
  readonly selection: RichText.Selection | null
  /** An editor Message as this caller's, usually its `edited(...)` wrapper. */
  readonly wrap: (message: EditorEvent) => Message
}

/**
 * The block style picker as a slot view. The button for the style the selection's block has
 * is pressed; none is at a heading level the list does not offer. Every button is disabled
 * where there is no such block — a code block, a node selection, no selection — because a
 * retype there is refused.
 */
export const blockStyles = <Message>(): SlotView.SlotView<
  typeof BlockStyleSlots,
  BlockStyleInput<Message>,
  Message
> =>
  SlotView.forMessages<Message>().define(BlockStyleSlots, (input, slots, h): Html => {
    const current = RichText.textBlockAt(input.document, input.selection)
    return h.div(slots.root.attrs(), [
      h.div(
        slots.toolbar.attrs([h.Role('toolbar'), h.AriaLabel('Text style')]),
        styles.map((style, index) =>
          h.button(
            slots.button.attrs(
              [
                h.Type('button'),
                h.DataAttribute('style', style.id),
                h.AriaPressed(
                  current !== undefined && Equal.equals(style.message.block, current)
                    ? 'true'
                    : 'false',
                ),
                h.Disabled(current === undefined),
                ...(current === undefined ? [] : [h.OnClick(input.wrap(style.message))]),
              ],
              { index, id: style.id, count: styles.length },
            ),
            [style.label],
          ),
        ),
      ),
    ])
  })

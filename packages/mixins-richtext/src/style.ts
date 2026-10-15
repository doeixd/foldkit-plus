/**
 * The block style picker (§124 §11, §134): a button per text style the caret's block can take —
 * a paragraph, or a heading — drawn through slots like the mark toolbar.
 *
 * The styles are the slash menu's retype entries, so the two offer the same list under the
 * same labels. Which one is pressed is a read of the document (`RichText.textBlockAt`); what a
 * button sends is its entry's `RetypedBlock`, wrapped for the caller. Lists and quotes are not
 * styles here: leaving one is a lift, not a retype, so a picker that listed them would send a
 * Message that does not undo what it shows. A code block is not a style either, but a retype
 * leaves one (given a vocabulary that says it holds text), so the buttons stay live inside it.
 */
import { Equal } from 'effect'
import type { Html } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'
import { slashEntries, type EditorEvent, type SlashEntry } from 'foldkit-richtext-dom/editor'
import { isRichTextIcon, richTextIcon } from './icons.js'

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
 * is pressed; none is in a code block, or at a heading level the list does not offer. Every
 * button is disabled without a text selection — a node selection, or none — because a retype
 * there is refused.
 */
export const blockStyles = <Message>(): SlotView.SlotView<
  typeof BlockStyleSlots,
  BlockStyleInput<Message>,
  Message
> =>
  SlotView.forMessages<Message>().define(BlockStyleSlots, (input, slots, h): Html => {
    const current = RichText.textBlockAt(input.document, input.selection)
    const live = input.selection?.type === 'Range'
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
                h.Disabled(!live),
                ...(live ? [h.OnClick(input.wrap(style.message))] : []),
              ],
              { index, id: style.id, count: styles.length },
            ),
            [style.label],
          ),
        ),
      ),
    ])
  })

/**
 * The elements the style menu publishes: its wrapper, the trigger that names the current style,
 * the menu, and one item per style with its icon, label and the check on the current one.
 */
export const BlockStyleMenuSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Interactive }),
  menu: Slot.make({ capability: Capability.Collection }),
  item: Slot.make({ capability: Capability.Interactive }),
  icon: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  check: Slot.make({ capability: Capability.Container }),
})

export interface BlockStyleMenuInput<Message> extends BlockStyleInput<Message> {
  /** Whether the menu is open: the caller's, as every menu's is. */
  readonly open: boolean
  /** The trigger's Message, which opens the menu or closes it. */
  readonly toggled: Message
}

/**
 * The same styles as `blockStyles`, in the space of one button: the trigger names the style the
 * selection's block has ("Text style" where none applies, as in a code block) and opens a menu of
 * every style, the current one checked. Choosing one sends its `RetypedBlock` through `wrap`, which
 * is where a caller also closes the menu. The trigger is disabled without a text selection.
 */
export const blockStyleMenu = <Message>(): SlotView.SlotView<
  typeof BlockStyleMenuSlots,
  BlockStyleMenuInput<Message>,
  Message
> =>
  SlotView.forMessages<Message>().define(BlockStyleMenuSlots, (input, slots, h): Html => {
    const current = RichText.textBlockAt(input.document, input.selection)
    const live = input.selection?.type === 'Range'
    const chosen = styles.find(
      style => current !== undefined && Equal.equals(style.message.block, current),
    )
    const icon = (name: string | undefined) =>
      name !== undefined && isRichTextIcon(name)
        ? [h.span(slots.icon.attrs(), [richTextIcon(h, name)])]
        : []
    return h.div(slots.root.attrs(), [
      h.button(
        slots.trigger.attrs([
          h.Type('button'),
          h.AriaHasPopup('menu'),
          h.AriaExpanded(input.open && live),
          h.AriaLabel(`Text style: ${chosen?.label ?? 'none'}`),
          h.Disabled(!live),
          ...(live ? [h.OnClick(input.toggled)] : []),
        ]),
        [
          ...icon(chosen?.icon),
          h.span(slots.label.attrs(), [chosen?.label ?? 'Text style']),
          richTextIcon(h, 'chevron-down', { size: 14 }),
        ],
      ),
      ...(input.open && live
        ? [
            h.div(
              slots.menu.attrs([h.Role('menu'), h.AriaLabel('Text style')]),
              styles.map((style, index) =>
                h.button(
                  slots.item.attrs(
                    [
                      h.Type('button'),
                      h.Role('menuitemradio'),
                      h.AriaChecked(style === chosen),
                      h.DataAttribute('style', style.id),
                      h.OnClick(input.wrap(style.message)),
                    ],
                    { index, id: style.id, count: styles.length },
                  ),
                  [
                    ...icon(style.icon),
                    h.span(slots.label.attrs(), [style.label]),
                    h.span(slots.check.attrs(), style === chosen ? [richTextIcon(h, 'check')] : []),
                  ],
                ),
              ),
            ),
          ]
        : []),
    ])
  })

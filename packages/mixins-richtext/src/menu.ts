/**
 * The slash menu's view (§119, §123): what a caret in a query shows. It is a
 * `SlotView`, so every element it makes is a slot an application styles or extends,
 * exactly as the mark toolbar's are.
 *
 * The list is a value, not state. `slashMenu` decides what matches and what is
 * highlighted, `slashMove` moves the highlight from the caller's keys, and this renders
 * the answer — so the view keeps no Model of its own and the two places that must agree,
 * the render and the `update` that resolves Enter, read the same functions.
 *
 * Outside a query the view renders an empty list; the caller places it only when
 * `slashMenu` says there is a menu, because only the caller knows where the caret is.
 */
import type { Html } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { slashMenu, type SlashEntry } from './slash.js'

/** The elements the menu publishes: its wrapper, its list, and one item per match. */
export const SlashMenuSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Collection }),
  item: Slot.make({ capability: Capability.Interactive }),
})

export interface SlashMenuInput<Message> {
  /** `slashEntries` for this package's catalogue, or an application's own. */
  readonly entries: ReadonlyArray<SlashEntry<Message>>
  /** The caret's block text before it: `RichText.textBefore(document, position)`. */
  readonly textBefore: string
  /** What the menu last highlighted; `slashMove` is what moves it. */
  readonly index: number
}

export const slashMenuView = <Message>(): SlotView.SlotView<
  typeof SlashMenuSlots,
  SlashMenuInput<Message>,
  Message
> =>
  SlotView.forMessages<Message>().define(SlashMenuSlots, (input, slots, h): Html => {
    const menu = slashMenu(input.entries, input.textBefore, input.index)
    const matches = menu?.matches ?? []
    const highlighted = matches.findIndex(entry => entry === menu?.highlighted)
    return h.div(slots.root.attrs(), [
      h.div(
        slots.list.attrs([h.Role('menu')]),
        matches.map((entry, index) =>
          h.button(
            slots.item.attrs(
              [
                h.Type('button'),
                h.Role('menuitem'),
                h.DataAttribute('entry', entry.id),
                h.AriaCurrent(index === highlighted ? 'true' : 'false'),
                h.OnClick(entry.message),
              ],
              { index, id: entry.id, count: matches.length },
            ),
            [entry.label],
          ),
        ),
      ),
    ])
  })

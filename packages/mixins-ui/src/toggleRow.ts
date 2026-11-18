/**
 * The row a Checkbox or a Switch draws around its control: the control, the
 * label and a line of description under it, with room for a mark of the
 * application's beside the label. The two share it, since only the control's
 * Slot differs.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Capability, Slot, type SlotAttributes } from 'foldkit-mixins'

/** The layout Slots a toggle row adds to its control's, label's and description's. */
export const ToggleRowSlots = {
  root: Slot.make({ capability: Capability.Container }),
  /** The label, its aside and the description, stacked beside the control. */
  text: Slot.make({ capability: Capability.Container }),
  /** The label and the aside, on one line. */
  heading: Slot.make({ capability: Capability.Container }),
  aside: Slot.make({ capability: Capability.Container }),
}

/** Where the control sits against its words: `end` puts the words first, as a settings list does. */
export type TogglePosition = 'start' | 'end'

export interface ToggleRow<Message> {
  /** The row's Slots, resolved. */
  readonly slots: {
    readonly root: SlotAttributes<Message>
    readonly text: SlotAttributes<Message>
    readonly heading: SlotAttributes<Message>
    readonly aside: SlotAttributes<Message>
  }
  readonly state: {
    readonly checked: boolean
    readonly position: TogglePosition
    readonly disabled: boolean
    readonly invalid: boolean
  }
  readonly control: Html
  readonly label: Html
  readonly description: Option.Option<Html>
  readonly aside: Option.Option<Html>
  readonly hidden: Option.Option<Html>
}

const flag = (on: boolean) => (on ? 'true' : 'false')

/**
 * The row's markup. The state is written on the root as `data-*` marks, which
 * a recipe reads: the row's own look (a card that fills when chosen) cannot
 * be told from the control's ARIA alone.
 */
export const toggleRow = <Message>(row: ToggleRow<Message>, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      ...row.slots.root,
      h.DataAttribute('checked', flag(row.state.checked)),
      h.DataAttribute('position', row.state.position),
      h.DataAttribute('disabled', flag(row.state.disabled)),
      h.DataAttribute('invalid', flag(row.state.invalid)),
    ],
    [
      row.control,
      h.div(row.slots.text, [
        h.div(row.slots.heading, [
          row.label,
          ...Option.match(row.aside, {
            onNone: () => [],
            onSome: aside => [h.div(row.slots.aside, [aside])],
          }),
        ]),
        ...Option.toArray(row.description),
      ]),
      ...Option.toArray(row.hidden),
    ],
  )

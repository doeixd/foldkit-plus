import { Capability, Slot, type SlotAttributes } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'

/**
 * What a text field draws inside its box beside the control: a prefix, a
 * suffix, an icon, a unit, a button. Input, SearchField, PasswordInput,
 * InputCopy and NumberField take these two options and spell them alike.
 */
export interface Adornments {
  /** Before the control, inside the box, in the `start` Slot. */
  readonly start?: Html | undefined
  /** After the control, inside the box, in the `end` Slot. */
  readonly end?: Html | undefined
}

/**
 * The Slots every adorned field shares: the `group` that is the box, and
 * the `start` and `end` Slots in it. A widget spreads these into its own
 * `Slots.define`, so one recipe piece (`Recipes.Adorned`) styles them all.
 */
export const AdornmentSlots = {
  group: Slot.make({ capability: Capability.Container }),
  start: Slot.make({ capability: Capability.Container }),
  end: Slot.make({ capability: Capability.Container }),
}

/** The attributes of the three Slots, as a resolved view or a set of builders gives them. */
export interface AdornmentAttributes<Message> {
  readonly group: SlotAttributes<Message>
  readonly start: SlotAttributes<Message>
  readonly end: SlotAttributes<Message>
}

/** The mark on the group, which a control reads to give up its own border inside it. */
export const GROUP_MARK = 'field-group'

/** The drawn `start` and `end`, each a list so it spreads into the group where it belongs. */
export const sidesOf = <Message>(
  h: HtmlBuilder<Message>,
  attributes: AdornmentAttributes<Message>,
  { start, end }: Adornments,
): { readonly start: ReadonlyArray<Html>; readonly end: ReadonlyArray<Html> } => ({
  start: start === undefined ? [] : [h.span([...attributes.start], [start])],
  end: end === undefined ? [] : [h.span([...attributes.end], [end])],
})

/**
 * A control with its adornments around it in the group, or the control alone
 * when there are none, so a field that is not adorned keeps its own border.
 */
export const adorn = <Message>(
  h: HtmlBuilder<Message>,
  attributes: AdornmentAttributes<Message>,
  control: Html,
  adornments: Adornments,
): Html => {
  if (adornments.start === undefined && adornments.end === undefined) return control
  const sides = sidesOf(h, attributes, adornments)
  return h.div(
    [...attributes.group, h.DataAttribute(GROUP_MARK, '')],
    [...sides.start, control, ...sides.end],
  )
}

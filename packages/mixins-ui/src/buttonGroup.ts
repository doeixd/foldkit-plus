import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A button group publishes its row, the rule a separated group draws at each
 * seam, and the box a word stands in (a count, a field's prefix); it owns no
 * state, messages, or bundles. The buttons stay the caller's (their labels,
 * styles, and Messages), drawn as the group's children; the group owns only
 * the join. It is `role="group"` with a name, not a segmented control: no
 * option is pressed, nothing selects, and arrow keys stay out of it (see
 * `Segmented` for that). The row and its rules say their orientation in
 * `data-orientation`, for the style to read.
 */
export const ButtonGroupSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  separator: Slot.make({ capability: Capability.Container }),
  text: Slot.make({ capability: Capability.Container }),
})

/**
 * A button group in one call: its name, its items, a style for its slots,
 * and mixins beside the style. No upstream component stands behind it.
 */
export interface ButtonGroupView<Message = never> {
  /** What the group is for, read as its accessible name. */
  readonly label: string
  /**
   * The joined items: buttons, a field, a Menu (whose trigger takes the
   * corners), or words, which the group draws in its `text` box.
   */
  readonly items: ReadonlyArray<Html | string>
  /** Default `'horizontal'`; `'vertical'` stacks the items, joined top to bottom. */
  readonly orientation?: 'horizontal' | 'vertical' | undefined
  /**
   * A rule at every seam, for buttons whose fills meet edge to edge (solid
   * ones, a split button); outlined buttons already show the seam.
   */
  readonly separated?: boolean | undefined
  /** A style of `ButtonGroupSlots`, for the group's look. */
  readonly style?: NamedStyle<typeof ButtonGroupSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Message = never>(
  options: ButtonGroupView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    ButtonGroupSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const orientation = h.DataAttribute('orientation', options.orientation ?? 'horizontal')
  const items = options.items.map(item =>
    typeof item === 'string' ? h.span(builders.text.attrs(), [item]) : item,
  )
  return h.div(
    builders.root.attrs([h.Role('group'), h.AriaLabel(options.label), orientation]),
    options.separated === true
      ? items.flatMap((item, index) =>
          index === 0
            ? [item]
            : [h.div(builders.separator.attrs([h.AriaHidden(true), orientation]), []), item],
        )
      : items,
  )
}

import {
  Attr,
  Behavior,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
} from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { FluidHover, Measure } from 'foldkit-primitives/dom'
import { FollowDirection } from './direction.js'
import { flipped } from './choices.js'
import type { MixinList } from './resolve.js'

/**
 * A segmented control: one `group` of pressed-button `option`s. Plain
 * buttons, not tabs: the group is `role="group"`, each option carries
 * `aria-pressed`, and there are no arrow keys or roving tabindex.
 * `indicator` and `highlight`, drawn first in the group, are the pressed
 * option's sliding pill and the hover that follows the pointer, which `fluid`
 * moves. With `multiple`, it is shadcn's and Zag's toggle group: any number
 * of options pressed, each filling itself (draw it without `fluid`, whose
 * pill marks one).
 */
export const SegmentedSlots = Slots.define({
  group: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  option: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaPressed, Attr.Disabled, Attr.AriaDisabled],
  }),
  /** An option's words, a box of their own so they can be trimmed apart from the option's steady copy. */
  label: Slot.make({ capability: Capability.Container }),
  /** A mark before an option's words, hidden from assistive technology. */
  icon: Slot.make({ capability: Capability.Container }),
  /** An option's mark and words in a row, drawn only for an option with an icon. */
  content: Slot.make({ capability: Capability.Container }),
  indicator: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
})

const pressed = '[aria-pressed="true"]'

/**
 * What moves the `indicator` and `highlight`, on the group: the pressed
 * option is measured (`--fk-segmented-chosen-*`) and one highlight follows
 * the pointer to the nearest option (`--fk-segmented-hover-*`), born at the
 * pressed one. Pass them beside the style; until they run, the pressed option
 * fills itself.
 */
export const fluid = [
  Behavior.forSlots(SegmentedSlots)<unknown, never>(
    {
      group: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => Measure({ targets: { 'segmented-chosen': pressed } }),
      }),
    },
    { name: 'SegmentedChosen' },
  ).mixin,
  Behavior.forSlots(SegmentedSlots)<unknown, never>(
    {
      group: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({
            name: 'segmented-hover',
            item: '[aria-pressed]',
            axis: 'x',
            gapClick: true,
            from: pressed,
          }),
      }),
    },
    { name: 'SegmentedHover' },
  ).mixin,
  // Measured again when the direction flips, which resizes nothing.
  Behavior.forSlots(SegmentedSlots)<unknown, never>(
    {
      group: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => FollowDirection(),
      }),
    },
    { name: 'SegmentedDirection' },
  ).mixin,
] as const

/** One option of a segmented control: what it stands for, and its words. */
export interface SegmentedOption<Value extends string> {
  readonly value: Value
  /** Its words; with `iconOnly`, its accessible name and tooltip. */
  readonly label: string
  /** Drawn before the words, hidden from assistive technology. */
  readonly icon?: Html | undefined
  /** Draws the icon alone, a square option named by `label`. */
  readonly iconOnly?: boolean | undefined
  readonly disabled?: boolean | undefined
}

export interface SegmentedView<Value extends string, Message> {
  readonly options: ReadonlyArray<SegmentedOption<Value>>
  /** The pressed values, as the application keeps them. */
  readonly pressed: ReadonlyArray<Value>
  /** The Message a press on an option sends; its type comes from `h`. */
  readonly onPress: (value: Value) => NoInfer<Message>
  /** The group's accessible name: what the options choose. */
  readonly label: string
  /** A style of `SegmentedSlots`, for the control's look. */
  readonly style?: NamedStyle<typeof SegmentedSlots> | undefined
  /** Mixins beside the style; `Segmented.fluid` glides a single choice's pill. */
  readonly mixins?: MixinList<Message> | undefined
}

/**
 * The pressed values after `value` is pressed. A single control keeps one
 * pressed, so pressing the pressed one changes nothing unless it is
 * `optional`; with `multiple`, a press turns its option on or off.
 */
export const toggled = <Value extends string>(
  pressed: ReadonlyArray<Value>,
  value: Value,
  options: { readonly multiple?: boolean; readonly optional?: boolean } = {},
): ReadonlyArray<Value> => {
  const on = pressed.includes(value)
  if (options.multiple === true) return flipped(pressed, value)
  if (!on) return [value]
  return options.optional === true ? [] : pressed
}

/**
 * A segmented control in one call: the options as pressed buttons in a
 * group, each label also in `data-label` so turning semibold when pressed
 * moves nothing, after the indicator and highlight `fluid` moves. An option
 * with an icon draws it and its words in a `content` row and is marked
 * `data-icon`; one drawn `iconOnly` is named by its label.
 */
export const view = <Value extends string, Message>(
  options: SegmentedView<Value, Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    SegmentedSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const pressed = new Set<string>(options.pressed)
  return h.div(builders.group.attrs([h.Role('group'), h.AriaLabel(options.label)]), [
    h.div(builders.indicator.attrs([h.AriaHidden(true)]), []),
    h.div(builders.highlight.attrs([h.AriaHidden(true)]), []),
    ...options.options.map(option => {
      const words = h.span(builders.label.attrs(), [option.label])
      // What the option names itself by, and what it draws.
      const drawn = (): readonly [ReadonlyArray<Attribute<Message>>, ReadonlyArray<Html>] => {
        const named = h.DataAttribute('label', option.label)
        if (option.icon === undefined) return [[named], [words]]
        const mark = h.span(builders.icon.attrs([h.AriaHidden(true)]), [option.icon])
        if (option.iconOnly === true) {
          return [
            [h.AriaLabel(option.label), h.Title(option.label), h.DataAttribute('icon', 'only')],
            [mark],
          ]
        }
        return [
          [named, h.DataAttribute('icon', '')],
          [h.span(builders.content.attrs(), [mark, words])],
        ]
      }
      const [naming, children] = drawn()
      return h.button(
        builders.option.attrs([
          h.Key(option.value),
          h.Type('button'),
          h.AriaPressed(String(pressed.has(option.value))),
          ...naming,
          ...(option.disabled === true
            ? [h.Disabled(true)]
            : [h.OnClick(options.onPress(option.value))]),
        ]),
        children,
      )
    }),
  ])
}

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
import type { Html, HtmlBuilder } from 'foldkit/html'
import { FluidHover, Measure } from 'foldkit-primitives/dom'
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
] as const

/** One option of a segmented control: what it stands for, and its words. */
export interface SegmentedOption<Value extends string> {
  readonly value: Value
  readonly label: string
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
  if (options.multiple === true)
    return on ? pressed.filter(each => each !== value) : [...pressed, value]
  if (!on) return [value]
  return options.optional === true ? [] : pressed
}

/**
 * A segmented control in one call: the options as pressed buttons in a
 * group, each label also in `data-label` so turning semibold when pressed
 * moves nothing, after the indicator and highlight `fluid` moves.
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
    ...options.options.map(option =>
      h.button(
        builders.option.attrs([
          h.Key(option.value),
          h.Type('button'),
          h.AriaPressed(String(pressed.has(option.value))),
          h.DataAttribute('label', option.label),
          ...(option.disabled === true
            ? [h.Disabled(true)]
            : [h.OnClick(options.onPress(option.value))]),
        ]),
        [option.label],
      ),
    ),
  ])
}

import { Option } from 'effect'
import {
  Attr,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
} from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A number field, the APG's editable spinbutton and Zag's number input: a
 * text field with `role="spinbutton"` that the arrows step, PageUp and
 * PageDown step by a page, and Home and End take to the bounds, between a
 * decrement and an increment button outside the tab order. The number is the
 * application's: the view draws `value` and sends `onChange` with the next
 * one, clamped and on the step; typed text commits on change (blur or
 * Enter), and text that is no number sends the value back unchanged.
 */
export const NumberFieldSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  group: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.Disabled],
  }),
  decrement: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
  increment: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
  description: Slot.make({ capability: Capability.Container }),
})

export interface NumberFieldView<Message> {
  /** Prefixes every id the field draws, unique on the page. */
  readonly id: string
  readonly label: string
  readonly description?: string | undefined
  readonly value: number
  /** The Message for the next value; its type comes from `h`. */
  readonly onChange: (value: number) => NoInfer<Message>
  readonly min?: number | undefined
  readonly max?: number | undefined
  /** Default `1`. */
  readonly step?: number | undefined
  /** PageUp and PageDown move by this; default ten steps. */
  readonly page?: number | undefined
  /** How the value reads in the field and to a screen reader; default `String`. */
  readonly format?: ((value: number) => string) | undefined
  readonly disabled?: boolean | undefined
  /** A style of `NumberFieldSlots`, for the field's look. */
  readonly style?: NamedStyle<typeof NumberFieldSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/** `value` within the bounds and on the step counted from `min` (or 0). */
export const settled = (
  value: number,
  bounds: {
    readonly min?: number | undefined
    readonly max?: number | undefined
    readonly step?: number | undefined
  },
): number => {
  const step = bounds.step ?? 1
  const origin = bounds.min ?? 0
  const stepped = origin + Math.round((value - origin) / step) * step
  // Rounded to the step's own precision, so 0.1 steps do not drift to 0.30000000000000004.
  const places = (String(step).split('.')[1] ?? '').length
  const exact = Number(stepped.toFixed(places))
  return Math.min(bounds.max ?? Infinity, Math.max(bounds.min ?? -Infinity, exact))
}

export const view = <Message>(options: NumberFieldView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    NumberFieldSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const step = options.step ?? 1
  const bounds = {
    ...(options.min === undefined ? {} : { min: options.min }),
    ...(options.max === undefined ? {} : { max: options.max }),
    step,
    ...(options.page === undefined ? {} : { page: options.page }),
  }
  const format = options.format ?? String
  const disabled = options.disabled === true
  const inputId = `${options.id}-input`
  const descriptionId = `${options.id}-description`
  const atMin = options.min !== undefined && options.value <= options.min
  const atMax = options.max !== undefined && options.value >= options.max
  const stepper = (
    slot: typeof builders.decrement,
    label: string,
    at: boolean,
    by: number,
    glyph: string,
  ) =>
    h.button(
      slot.attrs([
        h.Type('button'),
        h.AriaLabel(label),
        // Out of the tab order, as the APG has it: the field's own keys step it.
        h.Tabindex(-1),
        ...(disabled || at
          ? [h.Disabled(true)]
          : [h.OnClick(options.onChange(settled(options.value + by, bounds)))]),
      ]),
      [glyph],
    )
  return h.div(builders.root.attrs(), [
    h.label(builders.label.attrs([h.For(inputId)]), [options.label]),
    h.div(builders.group.attrs(), [
      stepper(builders.decrement, 'Decrease', atMin, -step, '−'),
      h.input(
        builders.input.attrs([
          h.Id(inputId),
          h.Type('text'),
          h.InputMode('decimal'),
          h.Role('spinbutton'),
          h.Value(format(options.value)),
          h.AriaValuenow(options.value),
          h.AriaValuetext(format(options.value)),
          ...(options.min === undefined ? [] : [h.AriaValuemin(options.min)]),
          ...(options.max === undefined ? [] : [h.AriaValuemax(options.max)]),
          ...(options.description === undefined ? [] : [h.AriaDescribedBy(descriptionId)]),
          ...(disabled
            ? [h.Disabled(true)]
            : [
                h.OnKeyDownPreventDefault((key, modifiers) => {
                  const next = Behaviors.SpinValue.spin(options.value, key, modifiers, bounds)
                  return next === undefined || next === options.value
                    ? Option.none()
                    : Option.some(options.onChange(settled(next, bounds)))
                }),
                h.OnChange(text => {
                  const typed = Number(text.trim().replace(',', '.'))
                  return options.onChange(
                    text.trim() === '' || !Number.isFinite(typed)
                      ? options.value
                      : settled(typed, bounds),
                  )
                }),
              ]),
        ]),
      ),
      stepper(builders.increment, 'Increase', atMax, step, '+'),
    ]),
    ...(options.description === undefined
      ? []
      : [h.p(builders.description.attrs([h.Id(descriptionId)]), [options.description])]),
  ])
}

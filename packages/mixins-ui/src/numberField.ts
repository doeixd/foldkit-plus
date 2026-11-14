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
  /** `Option.none()` is an empty field: no `aria-valuenow`, and the steppers start from the bounds. */
  readonly value: Option.Option<number>
  /** The Message for the next value, `Option.none()` once the text is cleared; its type comes from `h`. */
  readonly onChange: (value: Option.Option<number>) => NoInfer<Message>
  readonly min?: number | undefined
  readonly max?: number | undefined
  /** Default `1`. */
  readonly step?: number | undefined
  /** PageUp and PageDown move by this; default ten steps. */
  readonly page?: number | undefined
  readonly disabled?: boolean | undefined
  /** A style of `NumberFieldSlots`, for the field's look. */
  readonly style?: NamedStyle<typeof NumberFieldSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/**
 * How the number reads in the field and to a screen reader, and how typed
 * text is read back: the two together, so what the field draws is what it
 * accepts. `locale` draws and reads that locale's marks (`de-DE`: `1.234,5`);
 * `format` with its `parse` is for anything else; with neither, `String` and a
 * plain number (a lone comma reads as the decimal mark).
 */
export type NumberText =
  | {
      readonly locale?: string | undefined
      readonly format?: undefined
      readonly parse?: undefined
    }
  | {
      readonly locale?: undefined
      readonly format: (value: number) => string
      /** `Option.none()` for text that is no number, which leaves the value as it was. */
      readonly parse: (text: string) => Option.Option<number>
    }

const formats = new Map<string, Intl.NumberFormat>()
const formatIn = (locale: string): Intl.NumberFormat => {
  const kept = formats.get(locale)
  if (kept !== undefined) return kept
  const made = new Intl.NumberFormat(locale, { maximumFractionDigits: 20 })
  formats.set(locale, made)
  return made
}

const SPACES = /\s/g
// Written with char codes: ICU spells a group mark or a minus sign several ways.
const APOSTROPHES = new RegExp(`[${String.fromCharCode(39, 0x2019, 0x2018, 0x2bc)}]`, 'g')
const MINUSES = new RegExp(String.raw`[\p{Pd}${String.fromCharCode(0x2212)}]`, 'gu')
const PLAIN = /^[+-]?(\d+\.?\d*|\.\d+)$/

/**
 * The number `text` reads as in `locale`, or none. The locale's group mark
 * goes whatever spelling the runtime's ICU gives it (`'` or a typographic
 * one, a space or a no-break one), its decimal mark becomes `.`, and a typed
 * `.` stays a decimal point where the locale's decimal is not `.` and its
 * group is not either: people type the dot. Without a locale the text is a
 * plain number, with a lone comma as its decimal mark.
 */
export const parseNumber = (text: string, locale?: string): Option.Option<number> => {
  // Bidi marks (a right-to-left locale writes them around a sign) are not part of the number.
  let plain = text
    .replace(/\p{Cf}/gu, '')
    .trim()
    .replace(MINUSES, '-')
    .replace(SPACES, '')
  if (locale === undefined) {
    if (!plain.includes('.') && plain.split(',').length === 2) plain = plain.replace(',', '.')
  } else {
    const parts = formatIn(locale).formatToParts(-12345.6)
    const mark = (type: string) => parts.find(part => part.type === type)?.value
    // The locale's own digits (Arabic-Indic, say) read as 0 to 9.
    const digits = new Intl.NumberFormat(locale, { useGrouping: false })
    for (let digit = 0; digit <= 9; digit += 1) {
      plain = plain.replaceAll(digits.format(digit), String(digit))
    }
    // A space-like group went above; an apostrophe one is spelled one way here.
    const group = mark('group')?.replace(APOSTROPHES, "'")
    plain = plain.replace(APOSTROPHES, "'")
    if (group !== undefined && group.trim() !== '') plain = plain.replaceAll(group, '')
    plain = plain.replaceAll(mark('decimal') ?? '.', '.')
  }
  if (!PLAIN.test(plain)) return Option.none()
  const parsed = Number(plain)
  return Number.isFinite(parsed) ? Option.some(parsed) : Option.none()
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

export const view = <Message>(
  options: NumberFieldView<Message> & NumberText,
  h: HtmlBuilder<Message>,
): Html => {
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
  const { locale } = options
  const format =
    options.format ??
    (locale === undefined ? String : (value: number) => formatIn(locale).format(value))
  const parse = options.parse ?? ((text: string) => parseNumber(text, locale))
  const disabled = options.disabled === true
  const inputId = `${options.id}-input`
  const descriptionId = `${options.id}-description`
  const atMin =
    options.min !== undefined && Option.exists(options.value, value => value <= options.min!)
  const atMax =
    options.max !== undefined && Option.exists(options.value, value => value >= options.max!)
  // An empty field has nothing to step from: up starts at the lowest value, down at the highest.
  const stepped = (by: number) =>
    Option.some(
      settled(
        Option.match(options.value, {
          onNone: () => (by > 0 ? (options.min ?? 0) - by : (options.max ?? 0) - by),
          onSome: value => value,
        }) + by,
        bounds,
      ),
    )
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
        ...(disabled || at ? [h.Disabled(true)] : [h.OnClick(options.onChange(stepped(by)))]),
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
          h.Value(Option.match(options.value, { onNone: () => '', onSome: format })),
          ...Option.match(options.value, {
            onNone: () => [],
            onSome: value => [h.AriaValuenow(value), h.AriaValuetext(format(value))],
          }),
          ...(options.min === undefined ? [] : [h.AriaValuemin(options.min)]),
          ...(options.max === undefined ? [] : [h.AriaValuemax(options.max)]),
          ...(options.description === undefined ? [] : [h.AriaDescribedBy(descriptionId)]),
          ...(disabled
            ? [h.Disabled(true)]
            : [
                h.OnKeyDownPreventDefault((key, modifiers) => {
                  const spun = Behaviors.SpinValue.spin(
                    Option.getOrElse(options.value, () => 0),
                    key,
                    modifiers,
                    bounds,
                  )
                  // An empty field has no value to step: up and down start at the bounds.
                  const next =
                    spun === undefined || Option.isSome(options.value)
                      ? spun
                      : key === 'ArrowUp' || key === 'PageUp'
                        ? (options.min ?? 0)
                        : key === 'ArrowDown' || key === 'PageDown'
                          ? (options.max ?? 0)
                          : spun
                  return next === undefined || Option.exists(options.value, value => value === next)
                    ? Option.none()
                    : Option.some(options.onChange(Option.some(settled(next, bounds))))
                }),
                h.OnChange(text =>
                  options.onChange(
                    text.trim() === ''
                      ? Option.none()
                      : Option.match(parse(text), {
                          onNone: () => options.value,
                          onSome: typed => Option.some(settled(typed, bounds)),
                        }),
                  ),
                ),
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

import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { settled } from './numberField.js'
import type { MixinList } from './resolve.js'

/**
 * A slider: one number, or a `{ low, high }` range of two, chosen on one
 * track. The value is the application's: the view draws `value` and sends
 * `onChange` with the next one, of the same kind.
 *
 * Both kinds are one view over native `input type="range"` thumbs, so the
 * browser owns the drag, the keys (arrows, PageUp and PageDown, Home, End),
 * right to left and the form value, and the view keeps no state. One number
 * is a thumb across the whole `control`, named by the `label`, and a press
 * anywhere on the track moves it. A range is the APG's multi-thumb slider: a
 * `root` group named by the `label`, holding two thumbs that each name
 * themselves.
 *
 * `@foldkit/ui`'s Slider is not adapted any more. It draws one thumb and keeps
 * its drag in a Submodel, so a range could not be built on it; adapting it
 * for one number and drawing the range here meant two components and two
 * recipes for one control. An application already hosting that Submodel
 * draws it with Slots of its own.
 *
 * The thumbs of a range cannot cross, and the browser keeps that: the low
 * thumb's `max` is the high value and the high thumb's `min` the low one, as
 * the APG has it, and each input spans only the part of the track it may
 * travel (from `--fk-slider-low` and `--fk-slider-high` on `control`, 0 to 1),
 * so a thumb sits where it would on the whole track. A drag past the other
 * thumb stops at it with no redraw needed, which a clamp in `update` alone
 * could not do: an unchanged Model draws nothing, and the input would keep its
 * own value.
 *
 * `marks` and the shown value (`showValue`) are drawn beside the thumbs,
 * hidden from assistive technology: each thumb already says its value through
 * `aria-valuetext`. Each is placed by its share of the track,
 * `--fk-slider-at`.
 */
export const SliderSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  label: Slot.make({ capability: Capability.Container }),
  control: Slot.make({ capability: Capability.Container }),
  track: Slot.make({ capability: Capability.Base }),
  fill: Slot.make({ capability: Capability.Base }),
  mark: Slot.make({ capability: Capability.Base }),
  value: Slot.make({ capability: Capability.Base }),
  thumb: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Input],
    attributes: [Attr.AriaLabel, Attr.Disabled, Attr.Value],
  }),
})

export interface Range {
  readonly low: number
  readonly high: number
}

export interface Bounds {
  /** Default `0`. */
  readonly min?: number | undefined
  /** Default `100`. */
  readonly max?: number | undefined
  /** Default `1`. */
  readonly step?: number | undefined
}

export interface SliderView<Message, Value extends number | Range> extends Bounds {
  /** Prefixes the ids the slider draws, unique on the page. */
  readonly id: string
  /** What the slider chooses, shown and naming it. */
  readonly label: string
  /** Within the bounds and on the step; a range's `low` at most its `high`. */
  readonly value: Value
  /** The Message for the next value; its type comes from `h`. */
  readonly onChange: (value: Value) => NoInfer<Message>
  /** How a value reads aloud, as each thumb's `aria-valuetext`, and as shown; default `String`. */
  readonly format?: ((value: number) => string) | undefined
  /** A range's thumb names; default `Minimum` and `Maximum`. One thumb is named by `label`. */
  readonly thumbLabels?: Value extends Range
    ? { readonly low: string; readonly high: string } | undefined
    : never
  /** Values marked on the track, each drawn with `data-filled` when the fill covers it. */
  readonly marks?: ReadonlyArray<number> | undefined
  /** Draws each thumb's value, formatted, beside it; the recipe's `value` axis places it. */
  readonly showValue?: boolean | undefined
  /** Submits the value under this name; a range submits both, low first. */
  readonly name?: string | undefined
  readonly disabled?: boolean | undefined
  /** A style of `SliderSlots`, for the look. */
  readonly style?: NamedStyle<typeof SliderSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/**
 * The range after `thumb` moves to `value`: on the step, within the bounds,
 * and never past the other thumb. The same `range` when nothing changed, so
 * `update` can return its Model as it was.
 */
export const moved = (
  range: Range,
  thumb: 'low' | 'high',
  value: number,
  bounds: Bounds = {},
): Range => {
  const placed = settled(value, { min: bounds.min ?? 0, max: bounds.max ?? 100, step: bounds.step })
  const next =
    thumb === 'low'
      ? { low: Math.min(placed, range.high), high: range.high }
      : { low: range.low, high: Math.max(placed, range.low) }
  return next.low === range.low && next.high === range.high ? range : next
}

const share = (value: number, min: number, max: number): number =>
  max <= min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)))

const isRange = <Message>(
  options: SliderView<Message, number> | SliderView<Message, Range>,
): options is SliderView<Message, Range> => typeof options.value !== 'number'

interface Thumb<Message> {
  readonly key: 'value' | 'low' | 'high'
  readonly value: number
  readonly from: number
  readonly to: number
  readonly naming: Attribute<Message>
  readonly next: (value: number) => Message
}

/** One thumb across the whole track, or a range's two, each bounded by the other. */
const thumbsOf = <Message>(
  options: SliderView<Message, number> | SliderView<Message, Range>,
  labelId: string,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Thumb<Message>> => {
  const bounds = { min: options.min ?? 0, max: options.max ?? 100, step: options.step }
  if (!isRange(options)) {
    const onChange = options.onChange
    return [
      {
        key: 'value',
        value: options.value,
        from: bounds.min,
        to: bounds.max,
        naming: h.AriaLabelledBy(labelId),
        next: value => onChange(settled(value, bounds)),
      },
    ]
  }
  const { value: range, onChange } = options
  const names = options.thumbLabels ?? { low: 'Minimum', high: 'Maximum' }
  return [
    {
      key: 'low',
      value: range.low,
      from: bounds.min,
      to: range.high,
      naming: h.AriaLabel(names.low),
      next: value => onChange(moved(range, 'low', value, bounds)),
    },
    {
      key: 'high',
      value: range.high,
      from: range.low,
      to: bounds.max,
      naming: h.AriaLabel(names.high),
      next: value => onChange(moved(range, 'high', value, bounds)),
    },
  ]
}

export function view<Message>(options: SliderView<Message, number>, h: HtmlBuilder<Message>): Html
export function view<Message>(options: SliderView<Message, Range>, h: HtmlBuilder<Message>): Html
export function view<Message>(
  options: SliderView<Message, number> | SliderView<Message, Range>,
  h: HtmlBuilder<Message>,
): Html {
  const builders = SlotView.buildersFor(
    SliderSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const min = options.min ?? 0
  const max = options.max ?? 100
  const format = options.format ?? String
  const disabled = options.disabled === true
  const labelId = `${options.id}-label`
  const ranged = isRange(options)
  const thumbs = thumbsOf(options, labelId, h)
  // One thumb fills from the start of the track; a range from its low thumb.
  const low = isRange(options) ? options.value.low : min
  const high = isRange(options) ? options.value.high : options.value

  const thumb = (drawn: Thumb<Message>) =>
    h.input(
      builders.thumb.attrs([
        h.Key(drawn.key),
        h.Id(`${options.id}-${drawn.key}`),
        h.Type('range'),
        h.Min(String(drawn.from)),
        h.Max(String(drawn.to)),
        h.Step(String(options.step ?? 1)),
        h.Value(String(drawn.value)),
        drawn.naming,
        h.AriaValuetext(format(drawn.value)),
        h.DataAttribute('thumb', drawn.key),
        // An attribute, not `h.Name`'s client-only property, so server markup submits too.
        ...(options.name === undefined ? [] : [h.Attribute('name', options.name)]),
        ...(disabled ? [h.Disabled(true)] : [h.OnInput(text => drawn.next(Number(text)))]),
      ]),
    )

  const placed = (at: number) => h.Style({ '--fk-slider-at': String(share(at, min, max)) })

  return h.div(
    builders.root.attrs([
      ...(ranged ? [h.Role('group'), h.AriaLabelledBy(labelId)] : []),
      ...(disabled ? [h.DataAttribute('disabled', '')] : []),
      ...(ranged && disabled ? [h.AriaDisabled(true)] : []),
    ]),
    [
      h.span(builders.label.attrs([h.Id(labelId)]), [options.label]),
      h.div(
        builders.control.attrs([
          h.Style({
            '--fk-slider-low': String(share(low, min, max)),
            '--fk-slider-high': String(share(high, min, max)),
          }),
          ...(ranged ? [h.DataAttribute('range', '')] : []),
          ...(options.showValue === true ? [h.DataAttribute('values', '')] : []),
          // Met at the top, the high thumb cannot move and would cover the low one, which can.
          ...(ranged && high >= max ? [h.DataAttribute('raised', 'low')] : []),
        ]),
        [
          h.div(builders.track.attrs(), [h.div(builders.fill.attrs(), [])]),
          ...[...new Set(options.marks)].map(at =>
            h.span(
              builders.mark.attrs([
                h.Key(`mark-${at}`),
                h.AriaHidden(true),
                placed(at),
                ...(at >= low && at <= high ? [h.DataAttribute('filled', '')] : []),
              ]),
              [],
            ),
          ),
          ...thumbs.map(thumb),
          ...(options.showValue === true
            ? thumbs.map(drawn =>
                h.span(
                  builders.value.attrs([
                    h.Key(`value-${drawn.key}`),
                    h.AriaHidden(true),
                    placed(drawn.value),
                  ]),
                  [format(drawn.value)],
                ),
              )
            : []),
        ],
      ),
    ],
  )
}

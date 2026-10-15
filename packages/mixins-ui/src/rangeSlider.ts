import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { settled } from './numberField.js'
import type { MixinList } from './resolve.js'

/**
 * A range slider, the APG's multi-thumb slider: a `root` group named by its
 * `label`, and two native `input type="range"` thumbs over one `track`, each
 * a real slider with its own name, keys and form value. Upstream's Slider has
 * one thumb, so this is not built on it.
 *
 * The thumbs cannot cross, and the browser keeps that: the low thumb's `max`
 * is the high value and the high thumb's `min` the low one, as the APG has
 * it, and each input spans only the part of the track it may travel (from
 * `--fk-range-low` and `--fk-range-high` on `control`, 0 to 1), so a thumb
 * sits where it would on the whole track. A drag past the other thumb stops
 * at it with no redraw needed, which a clamp in `update` alone could not do:
 * an unchanged Model draws nothing, and the input would keep its own value.
 *
 * The range is the application's: the view draws `value` and sends
 * `onChange` with the next range from `moved`.
 */
export const RangeSliderSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  label: Slot.make({ capability: Capability.Container }),
  control: Slot.make({ capability: Capability.Container }),
  track: Slot.make({ capability: Capability.Base }),
  range: Slot.make({ capability: Capability.Base }),
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

export interface RangeSliderView<Message> extends Bounds {
  /** Prefixes the ids the slider draws, unique on the page. */
  readonly id: string
  /** What the range chooses, shown and naming the group. */
  readonly label: string
  /** `low` at most `high`, both within the bounds and on the step. */
  readonly value: Range
  /** The Message for the next range; its type comes from `h`. */
  readonly onChange: (value: Range) => NoInfer<Message>
  /** How a value reads aloud, as each thumb's `aria-valuetext`; default `String`. */
  readonly format?: ((value: number) => string) | undefined
  /** The thumbs' names; default `Minimum` and `Maximum`. */
  readonly thumbLabels?: { readonly low: string; readonly high: string } | undefined
  /** Submits both values under this name, low first. */
  readonly name?: string | undefined
  readonly disabled?: boolean | undefined
  /** A style of `RangeSliderSlots`, for the look. */
  readonly style?: NamedStyle<typeof RangeSliderSlots> | undefined
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

export const view = <Message>(options: RangeSliderView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    RangeSliderSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const min = options.min ?? 0
  const max = options.max ?? 100
  const bounds = { min, max, step: options.step }
  const format = options.format ?? String
  const names = options.thumbLabels ?? { low: 'Minimum', high: 'Maximum' }
  const disabled = options.disabled === true
  const { low, high } = options.value
  const labelId = `${options.id}-label`

  const thumb = (which: 'low' | 'high', value: number, from: number, to: number) =>
    h.input(
      builders.thumb.attrs([
        h.Key(which),
        h.Id(`${options.id}-${which}`),
        h.Type('range'),
        h.Min(String(from)),
        h.Max(String(to)),
        h.Step(String(options.step ?? 1)),
        h.Value(String(value)),
        h.AriaLabel(names[which]),
        h.AriaValuetext(format(value)),
        h.DataAttribute('thumb', which),
        // An attribute, not `h.Name`'s client-only property, so server markup submits too.
        ...(options.name === undefined ? [] : [h.Attribute('name', options.name)]),
        ...(disabled
          ? [h.Disabled(true)]
          : [h.OnInput(text => options.onChange(moved(options.value, which, Number(text), bounds)))]),
      ]),
    )

  return h.div(
    builders.root.attrs([
      h.Role('group'),
      h.AriaLabelledBy(labelId),
      ...(disabled ? [h.AriaDisabled(true)] : []),
    ]),
    [
      h.span(builders.label.attrs([h.Id(labelId)]), [options.label]),
      h.div(
        builders.control.attrs([
          h.Style({
            '--fk-range-low': String(share(low, min, max)),
            '--fk-range-high': String(share(high, min, max)),
          }),
          // Met at the top, the high thumb cannot move and would cover the low one, which can.
          ...(high >= max ? [h.DataAttribute('raised', 'low')] : []),
        ]),
        [
          h.div(builders.track.attrs(), [h.div(builders.range.attrs(), [])]),
          thumb('low', low, min, high),
          thumb('high', high, low, max),
        ],
      ),
    ],
  )
}

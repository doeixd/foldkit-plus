import * as UiMeter from '@foldkit/ui/meter'
import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * `@foldkit/ui`'s Meter, a `meter`: a measurement within a known range, such
 * as storage used or a battery's charge, where Progress is work going on.
 * The root says how good the value is as `data-level`, the HTML meter's
 * judgment: `good` in the region of `optimum` (below `low`, between, or
 * above `high`), `fair` one region away and `poor` two.
 */
export const MeterSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  track: Slot.make({ capability: Capability.Container }),
  fill: Slot.make({ capability: Capability.Container }),
})

export type Level = 'good' | 'fair' | 'poor'

export interface Thresholds {
  readonly min?: number | undefined
  readonly max?: number | undefined
  /** Below it is the low region. */
  readonly low?: number | undefined
  /** Above it is the high region. */
  readonly high?: number | undefined
  /** The best value; the middle of the range when not given. */
  readonly optimum?: number | undefined
}

export interface MeterView<Message> extends Thresholds {
  /** Prefixes the ids the meter draws, unique on the page. */
  readonly id: string
  /** What is measured, shown and naming the meter. */
  readonly label: string
  readonly value: number
  /** The value as read aloud, when the number alone would not say it. */
  readonly valueText?: string | ((value: number, max: number) => string) | undefined
  /** A style of `MeterSlots`, for the look. */
  readonly style?: NamedStyle<typeof MeterSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/** How good `value` is, as the HTML meter judges it from the thresholds. */
export const levelOf = (value: number, thresholds: Thresholds): Level => {
  const min = thresholds.min ?? 0
  const max = Math.max(min, thresholds.max ?? 100)
  const within = (x: number, from: number) => Math.min(max, Math.max(from, x))
  const low = within(thresholds.low ?? min, min)
  const high = within(thresholds.high ?? max, low)
  const region = (x: number) => (x < low ? 0 : x > high ? 2 : 1)
  const optimum = within(thresholds.optimum ?? (min + max) / 2, min)
  const away = Math.abs(region(within(value, min)) - region(optimum))
  if (away === 0) return 'good'
  return away === 1 ? 'fair' : 'poor'
}

export const view = <Message>(options: MeterView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    MeterSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { id, label, value, valueText, min, max, low, high, optimum } = options
  return UiMeter.view<Message>(
    {
      id,
      value,
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
      ...(low === undefined ? {} : { low }),
      ...(high === undefined ? {} : { high }),
      ...(optimum === undefined ? {} : { optimum }),
      ...(valueText === undefined ? {} : { valueText }),
      toView: attributes =>
        h.div(
          builders.root.attrs([
            ...attributes.meter,
            h.DataAttribute('level', levelOf(value, options)),
          ]),
          [
            h.span(builders.label.attrs(attributes.label), [label]),
            h.div(builders.track.attrs(), [h.div(builders.fill.attrs(attributes.fill), [])]),
          ],
        ),
    },
    h,
  )
}

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
  /** `'vertical'` stands the track upright, the fill growing from its block end. */
  readonly orientation?: 'horizontal' | 'vertical' | undefined
  /** Cuts the track into this many equal steps, at least two. */
  readonly segments?: number | undefined
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

/** The share of the range `value` fills, as the upstream fill writes it. */
const percentOf = (value: number, thresholds: Thresholds): string => {
  const min = thresholds.min ?? 0
  const max = Math.max(min, thresholds.max ?? 100)
  const share = max === min ? 1 : (Math.min(max, Math.max(min, value)) - min) / (max - min)
  return `${Math.round(share * 1000) / 10}%`
}

export const view = <Message>(options: MeterView<Message>, h: HtmlBuilder<Message>): Html => {
  const { segments } = options
  const upright = options.orientation === 'vertical'
  if (segments !== undefined && (!Number.isInteger(segments) || segments < 2))
    throw new Error(`Meter segments must be an integer of at least 2, not ${segments}`)
  const builders = SlotView.buildersFor(
    MeterSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { id, label, value, valueText, min, max, low, high, optimum } = options
  const properties = {
    ...(segments === undefined ? {} : { '--fk-meter-segments': String(segments) }),
    // Upstream writes the share as the fill's `width`; an upright fill reads it here.
    ...(upright ? { '--fk-meter-share': percentOf(value, options) } : {}),
  }
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
            ...(upright ? [h.DataAttribute('orientation', 'vertical')] : []),
            ...(segments === undefined ? [] : [h.DataAttribute('segmented', '')]),
            // One Style: a second on the element would replace the first.
            ...(Object.keys(properties).length === 0 ? [] : [h.Style(properties)]),
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

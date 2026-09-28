/**
 * A scalar measurement within a known range, as upstream `@foldkit/ui`'s
 * Meter draws it (`role="meter"`). See `range.ts` for why it is here.
 */
import { Option } from 'effect'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'

import { MAX, MIN, clamp, labelId, percentage, valueAttributes } from './range.js'

type MeterAttributes<Message> = Readonly<{
  meter: ReadonlyArray<Attribute<Message>>
  label: ReadonlyArray<Attribute<Message>>
  fill: ReadonlyArray<Attribute<Message>>
}>

export type Thresholds = Readonly<{ low: number; high: number; optimum: number }>

type ViewConfig<Message> = Readonly<{
  id: string
  value: number
  thresholds: Option.Option<Thresholds>
  valueText: string
  toView: (attributes: MeterAttributes<Message>) => Html
}>

/** Renders an accessible meter as a stateless controlled view. */
export const view = <Message>(config: ViewConfig<Message>, h: HtmlBuilder<Message>): Html => {
  const value = clamp(config.value)
  const thresholdAttributes = Option.match(config.thresholds, {
    onNone: () => [],
    onSome: ({ low, high, optimum }) => [
      h.DataAttribute('low', String(low)),
      h.DataAttribute('high', String(high)),
      h.DataAttribute('optimum', String(optimum)),
    ],
  })

  return config.toView({
    meter: [
      h.Id(config.id),
      h.Role('meter'),
      h.AriaValuemin(MIN),
      h.AriaValuemax(MAX),
      h.AriaValuenow(value),
      h.AriaValuetext(config.valueText),
      h.AriaLabelledBy(labelId(config.id)),
      ...valueAttributes(value, h),
      ...thresholdAttributes,
    ],
    label: [h.Id(labelId(config.id))],
    // The fill's width is the value itself, so it is the one inline declaration.
    fill: [h.Style({ width: percentage(value) }), ...valueAttributes(value, h)],
  })
}

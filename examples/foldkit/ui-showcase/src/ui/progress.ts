/**
 * How far a task has come, as upstream `@foldkit/ui`'s Progress draws it
 * (`role="progressbar"`): determinate with a value, indeterminate without
 * one. See `range.ts` for why it is here.
 */
import { Option } from 'effect'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'

import { MAX, MIN, clamp, labelId, percentage, valueAttributes } from './range.js'

type ProgressAttributes<Message> = Readonly<{
  progress: ReadonlyArray<Attribute<Message>>
  label: ReadonlyArray<Attribute<Message>>
  track: ReadonlyArray<Attribute<Message>>
  indicator: ReadonlyArray<Attribute<Message>>
}>

type ViewConfig<Message> = Readonly<{
  id: string
  maybeValue: Option.Option<number>
  valueText: string
  toView: (attributes: ProgressAttributes<Message>) => Html
}>

/** Renders an accessible progress indicator as a stateless controlled view. */
export const view = <Message>(config: ViewConfig<Message>, h: HtmlBuilder<Message>): Html => {
  const named = [h.AriaValuetext(config.valueText), h.AriaLabelledBy(labelId(config.id))]
  const label = [h.Id(labelId(config.id))]

  return Option.match(config.maybeValue, {
    onNone: () => {
      const state = [
        h.DataAttribute('state', 'indeterminate'),
        h.DataAttribute('indeterminate', ''),
      ]

      return config.toView({
        progress: [h.Id(config.id), h.Role('progressbar'), ...named, ...state],
        label,
        track: state,
        indicator: state,
      })
    },
    onSome: rawValue => {
      const value = clamp(rawValue)
      const state = [h.DataAttribute('state', value >= MAX ? 'complete' : 'loading')]
      const values = valueAttributes(value, h)

      return config.toView({
        progress: [
          h.Id(config.id),
          h.Role('progressbar'),
          h.AriaValuemin(MIN),
          h.AriaValuemax(MAX),
          h.AriaValuenow(value),
          ...named,
          ...values,
          ...state,
        ],
        label,
        track: state,
        // The indicator's width is the value itself, so it is the one inline declaration.
        indicator: [h.Style({ width: percentage(value) }), ...values, ...state],
      })
    },
  })
}

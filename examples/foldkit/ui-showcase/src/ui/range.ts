/**
 * The value arithmetic and accessible name of upstream `@foldkit/ui`'s Meter
 * and Progress, ported before `@foldkit/ui` shipped them (it has since 0.164.0).
 * Both views here are ports of upstream's, cut to the inputs this showcase
 * passes: a value between 0 and 100, a fixed `aria-valuetext`, and the
 * visible label as the accessible name.
 */
import type { Attribute, HtmlBuilder } from 'foldkit/html'

export const MIN = 0
export const MAX = 100

export const clamp = (value: number): number => Math.min(Math.max(value, MIN), MAX)

export const percentage = (value: number): string =>
  `${Math.round(((clamp(value) - MIN) / (MAX - MIN)) * 10000) / 100}%`

/** The id of the element the view labels itself by. */
export const labelId = (id: string): string => `${id}-label`

/** `data-value`, `data-min`, `data-max`, as upstream writes them for styling. */
export const valueAttributes = <Message>(
  value: number,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Attribute<Message>> => [
  h.DataAttribute('value', String(value)),
  h.DataAttribute('min', String(MIN)),
  h.DataAttribute('max', String(MAX)),
]

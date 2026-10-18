/**
 * `/create`'s knobs in its address, so a reload or a shared link comes back
 * to the same theme: `?hue=145&font=mono&scheme=dark`. Only what differs from
 * the defaults is written, by the knob's own name. Read back, each value
 * crosses the Knobs schema before it is kept, and a number is fitted to its
 * slider; a name or a value that is none of the knobs' is dropped.
 */
import { Option, Schema, Struct } from 'effect'

import { Canvas } from './studio.js'
import { Knob, Knobs, Scheme, defaults, fit, rangeOf } from './theme.js'

/** What the address holds: the knobs, and how the preview shows them. */
export interface ThemeAddress {
  readonly knobs: Knobs
  readonly scheme: Scheme
  readonly canvas: Canvas
}

const SCHEME = 'scheme'
const VIEW = 'view'

/** The query `address` is, without its `?`; empty for the defaults. */
export const queryOf = (address: ThemeAddress): string => {
  const params = new URLSearchParams()
  for (const knob of Struct.keys(defaults))
    if (address.knobs[knob] !== defaults[knob]) params.set(knob, String(address.knobs[knob]))
  if (address.scheme !== 'system') params.set(SCHEME, address.scheme)
  if (address.canvas !== 'components') params.set(VIEW, address.canvas)
  return params.toString()
}

const isKnob = Schema.is(Knob)
// What it decodes holds the knobs alone: a name that is no knob (`__proto__`,
// a typo) is left behind with the candidate it came in.
const decodeKnobs = Schema.decodeUnknownOption(Knobs)

/** The knobs `query` names, over the defaults; what it names wrongly is passed over. */
export const addressOf = (query: string): ThemeAddress => {
  const params = new URLSearchParams(query)
  let knobs = defaults
  for (const [name, raw] of params) {
    const value = isKnob(name) ? Number(raw) : raw
    if (typeof value === 'number' && !Number.isFinite(value)) continue
    knobs = Option.getOrElse(decodeKnobs({ ...knobs, [name]: value }), () => knobs)
  }
  const fitted = Knob.literals.reduce(
    (fitting, knob) => ({ ...fitting, [knob]: fit(rangeOf(knob), fitting[knob]) }),
    knobs,
  )
  return {
    knobs: fitted,
    scheme: Option.getOrElse(
      Schema.decodeUnknownOption(Scheme)(params.get(SCHEME)),
      () => 'system',
    ),
    canvas: Option.getOrElse(
      Schema.decodeUnknownOption(Canvas)(params.get(VIEW)),
      () => 'components',
    ),
  }
}

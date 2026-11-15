/**
 * What a slider needs of each standard knob that is a number in a range, as
 * plain data read from `Knobs.standard`, so a theme panel in a page built
 * without the style compiler maps over it. It imports `knobs.ts` and the
 * Schema code under it, and no style code.
 */
import type { Knob, Schemed } from './knob.js'
import { standard, type Standard } from './knobs.js'

/** A knob drawn as a range: the variable it writes and the bounds of its control. */
export interface KnobData<Name extends string = string> {
  readonly name: Name
  readonly title: string
  /** The variable it writes, the name after `--fk-knob-`. */
  readonly variable: string
  readonly unit: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly default: number
}

/**
 * Each range knob of `S` by its path (`shape.density`); a knob with a light
 * and a dark value is two, `accent.chroma.light` and `accent.chroma.dark`.
 */
export type RangeName<S> = {
  readonly [G in keyof S & string]: {
    readonly [N in keyof S[G] & string]: S[G][N] extends Schemed<string, string>
      ? `${G}.${N}.light` | `${G}.${N}.dark`
      : S[G][N] extends Knob<number>
        ? `${G}.${N}`
        : never
  }[keyof S[G] & string]
}[keyof S & string]

const dataOf = (name: string, knob: Knob<unknown>): ReadonlyArray<[string, KnobData]> =>
  knob.control.kind === 'range' && typeof knob.default === 'number'
    ? [
        [
          name,
          {
            name,
            title: knob.title,
            variable: knob.control.variable,
            unit: knob.control.unit,
            min: knob.control.min,
            max: knob.control.max,
            step: knob.control.step,
            default: knob.default,
          },
        ],
      ]
    : []

/** The range knobs of `Knobs.standard`, by name. */
export const knobData = Object.fromEntries(
  Object.entries(standard).flatMap(([group, knobs]) =>
    Object.entries(knobs).flatMap(([name, knob]) =>
      'light' in knob && 'dark' in knob
        ? [
            ...dataOf(`${group}.${name}.light`, knob.light),
            ...dataOf(`${group}.${name}.dark`, knob.dark),
          ]
        : dataOf(`${group}.${name}`, knob),
    ),
  ),
) as { readonly [Name in RangeName<Standard>]: KnobData<Name> }

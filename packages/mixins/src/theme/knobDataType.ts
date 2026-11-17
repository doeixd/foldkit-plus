/** Types only: `knobData.ts` imports them, so the page that reads its table loads no knob code. */
import type { Knob, Schemed } from './knob.js'
import type { Standard } from './knobs.js'

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
export type RangeName<S = Standard> = {
  readonly [G in keyof S & string]: {
    readonly [N in keyof S[G] & string]: S[G][N] extends Schemed<string, string>
      ? `${G}.${N}.light` | `${G}.${N}.dark`
      : S[G][N] extends Knob<number>
        ? `${G}.${N}`
        : never
  }[keyof S[G] & string]
}[keyof S & string]

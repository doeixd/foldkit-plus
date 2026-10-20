import { Schema } from 'effect'

/**
 * The widths an image is made at, ascending. The view takes candidates from
 * it, a server's request Schema accepts only these, and a build emits only
 * these, so the three cannot disagree.
 */
export interface Widths {
  readonly values: ReadonlyArray<number>
  /** Decodes a width on the ladder and refuses any other. */
  readonly Schema: Schema.Codec<number>
}

/**
 * A ladder from its widths. Refuses an empty list, a width that is not a
 * positive integer, and a repeated width: each is a mistake in the
 * declaration, not something to repair quietly.
 */
export const make = (values: ReadonlyArray<number>): Widths => {
  if (values.length === 0) throw new Error('Widths.make: a ladder needs at least one width')
  for (const width of values) {
    if (!Number.isInteger(width) || width <= 0) {
      throw new Error(`Widths.make: ${width} is not a positive integer width`)
    }
  }
  const sorted = [...values].sort((a, b) => a - b)
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index] === sorted[index - 1]) {
      throw new Error(`Widths.make: ${sorted[index]} appears twice`)
    }
  }
  return { values: sorted, Schema: Schema.Literals(sorted) }
}

/** Phones through a 2560px screen at 1x, and 1280px at 2x. */
export const standard: Widths = make([320, 480, 640, 828, 1080, 1280, 1920, 2560])

/** The smallest width at or above `width`, or the largest when none is. */
export const atLeast = (widths: Widths, width: number): number =>
  widths.values.find(value => value >= width) ?? widths.values[widths.values.length - 1]!

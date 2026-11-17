import { describe, expect, it } from 'vitest'
import { HIGHEST_LEVEL, fitTools, initialFit, type ToolsFit } from '../src/content/toolsFit.js'

/** Draws the bar at the fit's level, as a measurement of `needs[level]` against a column of `width`. */
const measure = (fit: ToolsFit, width: number, needs: ReadonlyArray<number>): ToolsFit => {
  const need = needs[fit.level]!
  return fitTools(fit, width, Math.max(need, width))
}
/** What each level needs, wider first: the fullest bar needs 600px, the next 400, the last 250. */
const needs = [600, 400, 250]

/** Measures again until the fit stops moving, as the bar's observers would. */
const settle = (fit: ToolsFit, width: number): ToolsFit => {
  let current = fit
  for (let step = 0; step < 10; step++) {
    const next = measure(current, width, needs)
    if (next === current) return current
    current = next
  }
  throw new Error('the fit did not settle')
}

describe('how much of the bar fits', () => {
  it('stays at the fullest bar while it fits, and says nothing is learned', () => {
    expect(settle(initialFit, 700)).toBe(initialFit)
  })

  it('moves up a level each time the bar overflows, learning what each needed', () => {
    const fit = settle(initialFit, 300)
    expect(fit.level).toBe(2)
    expect(fit.needs.slice(0, 2)).toEqual([600, 400])
  })

  it('stops at the highest level when even that does not fit', () => {
    const fit = settle(initialFit, 100)
    expect(fit.level).toBe(HIGHEST_LEVEL)
    expect(settle(fit, 100)).toBe(fit)
  })

  it('goes back down to the lowest level whose recorded need fits the widened column', () => {
    const narrow = settle(initialFit, 300)
    expect(settle(narrow, 450).level).toBe(1)
    expect(settle(narrow, 650).level).toBe(0)
    // Between: 399 does not hold level 1's 400.
    expect(settle(narrow, 399).level).toBe(2)
  })

  it('relearns when a level needs more than it did (a wider face loaded)', () => {
    const narrow = settle(initialFit, 300)
    const wider = fitTools(narrow, 300, 330)
    expect(wider.needs[2]).toBe(330)
    expect(wider.level).toBe(HIGHEST_LEVEL)
  })

  it('ignores a bar that is not drawn, and returns the same value when nothing changed', () => {
    expect(fitTools(initialFit, 0, 0)).toBe(initialFit)
    // A column of no width with content in it (hidden, collapsing) says nothing about the bar.
    expect(fitTools(initialFit, 0, 50)).toBe(initialFit)
    const fits = fitTools(initialFit, 700, 700)
    expect(fits).toBe(initialFit)
  })
})

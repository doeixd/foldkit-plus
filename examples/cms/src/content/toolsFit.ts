/**
 * How much of the formatting bar fits its column, learned from the bar itself rather than guessed
 * from a width: a font, a letter spacing or a translation changes what each control takes, so a
 * threshold tuned on one face overflows on another.
 *
 * The bar is drawn at a level: 0 every control, 1 the low ones in More, 2 more of them in More.
 * Each measurement reports the column's width and the bar's own scroll width. A bar that overflows
 * records what it needed at its level and moves up one; a bar that fits goes back down to the
 * lowest level whose recorded need fits the width. Nothing at a level is assumed before it has
 * been drawn, so the first frames are the fullest bar and settle in a step or two.
 */
export const HIGHEST_LEVEL = 2

export interface ToolsFit {
  readonly level: number
  /** What each level needed when it overflowed, in pixels; 0 where it has not. */
  readonly needs: ReadonlyArray<number>
}

export const initialFit: ToolsFit = {
  level: 0,
  needs: Array.from({ length: HIGHEST_LEVEL + 1 }, () => 0),
}

/** The fit after a measurement; the same value when nothing changed. */
export const fitTools = (fit: ToolsFit, width: number, scroll: number): ToolsFit => {
  // A bar not drawn has no width to judge.
  if (width <= 0) return fit
  if (scroll > width) {
    const needs = fit.needs.map((need, level) => (level === fit.level ? scroll : need))
    const level = Math.min(fit.level + 1, HIGHEST_LEVEL)
    return level === fit.level && needs[fit.level] === fit.needs[fit.level] ? fit : { level, needs }
  }
  const lower = fit.needs.findIndex((need, level) => level < fit.level && need > 0 && need <= width)
  return lower === -1 ? fit : { level: lower, needs: fit.needs }
}

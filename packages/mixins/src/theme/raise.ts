/**
 * Elevation that nests by itself, after Fluid Functionalism's surface ladder:
 * the page is level 1, a raised element sits `offset` levels above whatever
 * raised element holds it (capped at 8), and `raisedSurface` paints it for
 * its level. A popover opened in a dialog lands above the dialog, with no
 * prop passed, instead of melting into a surface it shares.
 *
 * CSS cannot add to an inherited value on one element (`--d: calc(var(--d) +
 * 2)` is a cycle, and `inherit()` has no engine yet), so the depth is counted
 * by eight rules, one per nesting depth `k`: `k` raised elements deep, the
 * element sets `--_fk-depth-k` from its ancestor's `--_fk-depth-(k-1)`. The
 * rules for shallower depths match it too, so each rule hands those back to
 * the ancestor's (`inherit`); otherwise the element's depth would be read
 * from its own. `--_fk-level` is the result, private like a recipe's own
 * properties: it is no theme token.
 */
import { classPiece, compose, global, self, type StyleValue } from '../styleValue.js'
import { VAR_PREFIX } from './core.js'

const DEPTHS = 8
const MARK = 'fk-raised'

const depthRules = (() => {
  const rules = [`:root{--_fk-depth-0:1;--_fk-level:1}`]
  for (let depth = 1; depth <= DEPTHS; depth += 1) {
    const selector = Array.from({ length: depth }, () => `.${MARK}`).join(' ')
    const handBack = Array.from(
      { length: depth - 1 },
      (_, shallower) => `--_fk-depth-${shallower + 1}:inherit;`,
    ).join('')
    rules.push(
      `${selector}{${handBack}--_fk-depth-${depth}:calc(var(--_fk-depth-${depth - 1}) + var(--_fk-raise));` +
        `--_fk-level:min(var(--_fk-depth-${depth}), ${DEPTHS})}`,
    )
  }
  return global(rules.join(''))
})()

/**
 * An element `offset` levels above the raised element holding it, or the
 * page: popovers and menus are 2, dialogs 4. Paint it with `raisedSurface`.
 */
export const raise = (offset: number): StyleValue =>
  compose(depthRules, classPiece(MARK), self({ '--_fk-raise': String(offset) }))

/**
 * The background of a raised element at its level, from `Theme.oklch`'s base
 * surface. In a light scheme the first two steps go toward white and the rest
 * stay there, so shadow alone carries elevation; in a dark scheme each level
 * is an even step lighter (`knob.raise-dark`). Written as an expression, not
 * a token, because the level is the element's own and a token resolves at
 * `:root`.
 */
export const raisedSurface = (): string => {
  const base = `var(${VAR_PREFIX}-surface-base)`
  const above = `(var(--_fk-level) - 1)`
  return (
    `light-dark(oklch(from ${base} calc(l + (1 - l) * min(${above}, 2) / 2) c h), ` +
    `oklch(from ${base} calc(l + var(${VAR_PREFIX}-knob-raise-dark) * ${above}) c h))`
  )
}

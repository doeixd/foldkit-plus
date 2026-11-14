/**
 * Audit of #558 item 5 for ranges and spatial navigation: `Selection`'s range
 * over an order that lacks the anchor (a row a virtual list no longer draws),
 * and `GridNavigation.move` against where the cells are laid out. A test
 * named "today" pins current behaviour that a finding in
 * `docs/design/558-audit-FINDINGS.md` calls a gap.
 */
import { afterEach, expect, it } from 'vitest'
import { move } from '../src/interaction/grid-navigation.js'
import { between } from '../src/interaction/selection.js'

afterEach(() => {
  document.body.replaceChildren()
})

it('extends a range over the order it is given, so the caller must give the whole list, not the drawn rows', () => {
  const all = Array.from({ length: 100 }, (_, at) => `r${at}`)
  expect(between(all, 'r2', 'r5')).toEqual(['r2', 'r3', 'r4', 'r5'])
  // The anchor row scrolled out of a virtual list and the caller passed the window it draws.
  const drawn = all.slice(40, 50)
  expect(between(drawn, 'r2', 'r45')).toEqual(['r45'])
})

const modifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }

it('moves by index and column count, which is not where a wrapped layout draws the cell below (today)', () => {
  const widths = [140, 140, 90, 90, 90, 90]
  const box = document.createElement('div')
  box.style.cssText = 'position:absolute;left:0;top:0;width:300px;display:flex;flex-wrap:wrap'
  const cells = widths.map(width => {
    const cell = document.createElement('div')
    cell.style.cssText = `width:${width}px;height:20px;box-sizing:border-box`
    box.append(cell)
    return cell
  })
  document.body.append(box)
  const below = (from: number): number => {
    const rect = cells[from]!.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.bottom + 5)
    return cells.findIndex(cell => cell === hit)
  }
  // Drawn: [0 1] over [2 3 4] over [5]. The cell under 0 is 2.
  expect(below(0)).toBe(2)
  const enabled = widths.map((_, at) => at)
  const next = move(enabled, widths.length, 0, 'ArrowDown', modifiers, {
    columns: 3,
    wrap: false,
    direction: 'ltr',
  })
  expect(next).toBe(3)
})

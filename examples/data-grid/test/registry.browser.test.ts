/**
 * The registry in a real browser at full size: the stylesheet installed as
 * `entry.ts` installs it, all 100,000 products, a scroll to the last one that
 * draws it without drawing the rest, and the pinned UPC at its edge.
 */
import { Runtime } from 'foldkit'
import { GridFocus } from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'

import { Model, init, update, view } from '../src/main.js'

afterEach(() => {
  document.body.replaceChildren()
})

test('100,000 products scroll to the last one, drawing a window, the UPC pinned', async () => {
  // Narrower than the columns' 830px, so the grid scrolls sideways.
  await page.viewport(640, 800)
  Style.install(
    AppStyle.make({ palette: Theme.oklch({ accent: { h: 250, c: 0.12, l: '55%' } }) }).stylesheet,
  )
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
  Runtime.run(Runtime.makeApplication({ Model, init: () => init(), update, view, container }))
  const grid = () => document.getElementById('products')!
  const cell = (row: string, column: string) =>
    document.getElementById(GridFocus.cellId('products', { row, column }))

  await vi.waitFor(() => expect(cell('p3', 'description')).not.toBeNull(), { timeout: 10_000 })
  await page.screenshot({ path: '../.vitest/registry-top.png' })

  const started = performance.now()
  grid().scrollTop = grid().scrollHeight
  await vi.waitFor(() => expect(cell('p99999', 'upc')).not.toBeNull(), { timeout: 10_000 })
  const drawnIn = performance.now() - started
  expect(document.querySelectorAll('#products [role="row"]').length).toBeLessThan(60)
  // The last row sits inside the scroll container, not past it.
  const last = cell('p99999', 'upc')!.getBoundingClientRect()
  const box = grid().getBoundingClientRect()
  expect(last.bottom).toBeLessThanOrEqual(box.bottom + 1)

  grid().scrollLeft = 400
  await vi.waitFor(() => expect(grid().scrollLeft).toBeGreaterThan(0))
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  expect(cell('p99999', 'upc')!.getBoundingClientRect().left).toBeCloseTo(
    box.left + grid().clientLeft,
    0,
  )
  await page.screenshot({ path: '../.vitest/registry-bottom.png' })
  // Recorded, not asserted: a timing is not a gate on shared machines.
  console.info(`scrolled to the last of 100,000 rows and drew it in ${drawnIn.toFixed(0)} ms`)
})

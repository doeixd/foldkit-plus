/**
 * A table drawn with `fluid`, on a real page: one highlight follows the
 * pointer to the nearest body row, and the lines on both sides of the lit
 * row go, so the highlight sits clean.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Recipes, Table, TableSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(TableSlots)(Recipes.Table({}))
const Model = Schema.Struct({})
const runs = [
  { name: 'Nightly', minutes: '42' },
  { name: 'Weekly', minutes: '95' },
  { name: 'Release', minutes: '120' },
]

afterEach(async () => {
  await userEvent.hover(document.getElementById('away') ?? document.body)
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'table-fluid'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [],
          [
            // Where the pointer is put, away from the rows: one left over the table lights a row.
            h.div([h.Id('away'), h.Style({ height: '40px', marginBlockEnd: '200px' })], []),
            Table.view(
              {
                columns: [
                  { header: 'Run', value: (run: (typeof runs)[number]) => run.name },
                  { header: 'Minutes', numeric: true, value: run => run.minutes },
                ],
                rows: runs,
                style,
                fluid: true,
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const rows = () => Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody > tr'))
const line = (row: Element) => getComputedStyle(row).borderBlockEndColor
const transparent = 'rgba(0, 0, 0, 0)'

test('the highlight sits on the hovered row, and the lines beside it go', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(rows()).toHaveLength(3))
    const [first, second, third] = rows() as [
      HTMLTableRowElement,
      HTMLTableRowElement,
      HTMLTableRowElement,
    ]
    await userEvent.hover(second.cells[0]!)
    await vi.waitFor(() => expect(second.hasAttribute('data-fluid-lit')).toBe(true))
    const highlight = document.querySelector<HTMLElement>('[aria-hidden="true"]')!
    await vi.waitFor(() => {
      const a = highlight.getBoundingClientRect()
      const b = second.getBoundingClientRect()
      expect([Math.round(a.top), Math.round(a.height)]).toEqual([
        Math.round(b.top),
        Math.round(b.height),
      ])
    })
    await vi.waitFor(() => expect(line(second)).toBe(transparent))
    await vi.waitFor(() => expect(line(first)).toBe(transparent))
    // The row below keeps its line: it is under the lit row, not beside its fill.
    expect(line(third)).not.toBe(transparent)
  } finally {
    handle.dispose()
  }
})

test('the first row lit takes the header line away too', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(rows()).toHaveLength(3))
    const header = document.querySelector('thead > tr')!
    await userEvent.hover(document.getElementById('away')!)
    const resting = line(header)
    expect(resting).not.toBe(transparent)
    await userEvent.hover(rows()[0]!.cells[0]!)
    await vi.waitFor(() => expect(line(header)).toBe(transparent))
  } finally {
    handle.dispose()
  }
})

/**
 * The table's looks, laid out in a real browser: a sticky heading stays at
 * the top of its scroller, stripes fill every other row and a chosen row's
 * wash lets the highlight through, a sorted heading's chevron turns with
 * `aria-sort`, density steps the rows, and with an open row the fluid
 * highlight still finds only the data rows.
 */
import { Option, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
// From the modules, not the index: the test reads nothing else.
import { CheckboxSlots } from '../src/checkbox.js'
import * as Recipes from '../src/recipes/table.js'
import { Checkbox } from '../src/recipes/toggle.js'
import * as Table from '../src/table.js'
import { TableSlots, type TableView } from '../src/table.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const checkbox = Style.forSlots(CheckboxSlots)(Checkbox({}))
const Model = Schema.Struct({})
// The presses are the Scene tests'; here a press changes nothing.
const Message = defineMessageUnion({ Pressed: {} })
type Pressed = typeof Message.Type
const pressed = Message.Pressed()

interface Run {
  readonly name: string
  readonly minutes: string
}

const runs: ReadonlyArray<Run> = Array.from({ length: 12 }, (_, index) => ({
  name: `Run ${index + 1}`,
  minutes: String(10 + index),
}))

const columns = [
  { header: 'Run', sortKey: 'name', value: (run: Run) => run.name },
  { header: 'Minutes', numeric: true, value: (run: Run) => run.minutes },
]

afterEach(async () => {
  await userEvent.hover(document.getElementById('away') ?? document.body)
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (css: string, draw: (h: HtmlBuilder<Pressed>) => Html) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    css +
    checkbox.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'table'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<Pressed>) =>
        h.div(
          [h.Style({ inlineSize: '400px' })],
          [
            // Where the pointer is put, away from the rows.
            h.div([h.Id('away'), h.Style({ height: '40px', marginBlockEnd: '200px' })], []),
            draw(h),
          ],
        ),
    }),
  )
}

const tableOf = (
  selection: Parameters<typeof Recipes.Table>[0],
  options: (h: HtmlBuilder<Pressed>) => Partial<TableView<Run, Pressed>> = () => ({}),
) => {
  const style = Style.forSlots(TableSlots)(Recipes.Table(selection))
  return {
    css: style.css,
    draw: (h: HtmlBuilder<Pressed>) =>
      Table.view<Run, Pressed>(
        { columns, rows: runs, rowKey: run => run.name, style, ...options(h) },
        h,
      ),
  }
}

const bodyRows = () =>
  Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody > tr:not([data-detail])'))

test('a sticky heading stays at the top of its scroller', async () => {
  const { css, draw } = tableOf({ header: 'sticky' })
  const mounted = mount(css, h =>
    h.div([h.Id('scroller'), h.Style({ blockSize: '160px', overflow: 'auto' })], [draw(h)]),
  )
  try {
    await vi.waitFor(() => expect(bodyRows()).toHaveLength(12))
    const scroller = document.getElementById('scroller')!
    scroller.scrollTop = 200
    const heading = document.querySelector('th')!
    await vi.waitFor(() =>
      expect(Math.round(heading.getBoundingClientRect().top)).toBe(
        Math.round(scroller.getBoundingClientRect().top),
      ),
    )
    // Its own line goes with it: the row's would have scrolled away.
    expect(getComputedStyle(heading).boxShadow).not.toBe('none')
  } finally {
    mounted.dispose()
  }
})

test('a static heading scrolls away', async () => {
  const { css, draw } = tableOf({})
  const mounted = mount(css, h =>
    h.div([h.Id('scroller'), h.Style({ blockSize: '160px', overflow: 'auto' })], [draw(h)]),
  )
  try {
    await vi.waitFor(() => expect(bodyRows()).toHaveLength(12))
    const scroller = document.getElementById('scroller')!
    scroller.scrollTop = 200
    const heading = document.querySelector('th')!
    await vi.waitFor(() =>
      expect(heading.getBoundingClientRect().top).toBeLessThan(
        scroller.getBoundingClientRect().top - 100,
      ),
    )
  } finally {
    mounted.dispose()
  }
})

const transparent = 'rgba(0, 0, 0, 0)'
const fill = (element: Element) => getComputedStyle(element).backgroundColor
const alpha = (color: string) => {
  const parts = /\/\s*([\d.]+)\)|rgba\([^)]*,\s*([\d.]+)\)/.exec(color)
  return parts === null ? 1 : Number(parts[1] ?? parts[2])
}

test('stripes fill every other row; a chosen row is washed, see-through, over a stripe', async () => {
  const { css, draw } = tableOf({ rows: 'striped' }, () => ({
    selection: {
      id: 'runs',
      isSelected: run => run.name === 'Run 2',
      onToggle: () => pressed,
      onToggleAll: () => pressed,
      checkbox,
    },
  }))
  const mounted = mount(css, draw)
  try {
    await vi.waitFor(() => expect(bodyRows()).toHaveLength(12))
    const [first, second, third, fourth] = bodyRows()
    expect(fill(first!)).toBe(transparent)
    expect(fill(third!)).toBe(transparent)
    expect(fill(fourth!)).not.toBe(transparent)
    expect(alpha(fill(fourth!))).toBeLessThan(1)
    // The second row is even and chosen: the wash, not the stripe.
    expect(fill(second!)).not.toBe(fill(fourth!))
    expect(alpha(fill(second!))).toBeLessThan(1)
    // A box's name is for a screen reader alone: it takes no room beside the box.
    const name = first!.querySelector('[role="checkbox"] + span')!
    expect(name.textContent).toBe('Select row')
    expect(name.getBoundingClientRect().width).toBeLessThanOrEqual(1)
    // Striped rows drop their lines.
    expect(getComputedStyle(first!).borderBlockEndColor).toBe(transparent)
  } finally {
    mounted.dispose()
  }
})

test('lined rows keep their lines and no fill, numbers at the end', async () => {
  const { css, draw } = tableOf({})
  const mounted = mount(css, draw)
  try {
    await vi.waitFor(() => expect(bodyRows()).toHaveLength(12))
    const [, second] = bodyRows()
    expect(fill(second!)).toBe(transparent)
    // Numbers, and their heading, stand at the end.
    expect(getComputedStyle(second!.cells[1]!).textAlign).toBe('end')
    expect(getComputedStyle(document.querySelectorAll('th')[1]!).textAlign).toBe('end')
    expect(getComputedStyle(second!).borderBlockEndColor).not.toBe(transparent)
  } finally {
    mounted.dispose()
  }
})

test('the sorted heading’s chevron shows, pointing up ascending and down descending', async () => {
  const draws = (direction: 'ascending' | 'descending') =>
    tableOf({}, () => ({
      sort: {
        by: Option.some({ column: 'name', direction }),
        onSort: () => pressed,
      },
    }))
  const icon = () => getComputedStyle(document.querySelector('th[aria-sort] span')!)
  const up = draws('ascending')
  let mounted = mount(up.css, up.draw)
  try {
    await vi.waitFor(() => expect(document.querySelector('th[aria-sort]')).not.toBeNull())
    expect(icon().opacity).toBe('1')
    expect(icon().rotate).toBe('-135deg')
  } finally {
    mounted.dispose()
  }
  document.body.replaceChildren()
  const down = draws('descending')
  mounted = mount(down.css, down.draw)
  try {
    await vi.waitFor(() => expect(document.querySelector('th[aria-sort]')).not.toBeNull())
    expect(icon().rotate).toBe('45deg')
  } finally {
    mounted.dispose()
  }
})

test('an unsorted heading’s chevron is hidden until pointed at', async () => {
  const { css, draw } = tableOf({}, () => ({
    sort: {
      by: Option.none(),
      onSort: () => pressed,
    },
  }))
  const mounted = mount(css, draw)
  try {
    await vi.waitFor(() => expect(document.querySelector('th button')).not.toBeNull())
    const button = document.querySelector('th button')!
    const icon = button.querySelector('span')!
    expect(getComputedStyle(icon).opacity).toBe('0')
    await userEvent.hover(button)
    await vi.waitFor(() => expect(getComputedStyle(icon).opacity).toBe('0.5'))
  } finally {
    mounted.dispose()
  }
})

test('density steps the rows down and up the ladder', async () => {
  const heightOf = async (density: 'compact' | 'comfortable') => {
    const { css, draw } = tableOf({ density })
    const mounted = mount(css, draw)
    try {
      await vi.waitFor(() => expect(bodyRows()).toHaveLength(12))
      return bodyRows()[0]!.getBoundingClientRect().height
    } finally {
      mounted.dispose()
      document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
      document.body.replaceChildren()
    }
  }
  const compact = await heightOf('compact')
  const comfortable = await heightOf('comfortable')
  expect(comfortable).toBeGreaterThan(compact + 4)
})

test('with an open row, the highlight lights data rows and passes over the detail', async () => {
  const { css, draw } = tableOf({}, h => ({
    fluid: true,
    expansion: {
      id: 'runs',
      isExpanded: run => run.name === 'Run 1',
      onToggle: () => pressed,
      detail: () => h.p([], ['Ran on main']),
    },
  }))
  const mounted = mount(css, draw)
  try {
    await vi.waitFor(() => expect(bodyRows()).toHaveLength(12))
    const detail = document.querySelector<HTMLTableRowElement>('tr[data-detail]')!
    await userEvent.hover(detail.cells[0]!, { position: { x: 200, y: 2 } })
    // The pointer on the detail lights the data row nearest it, never the detail.
    await vi.waitFor(() => expect(document.querySelector('[data-fluid-lit]')).not.toBeNull())
    expect(detail.hasAttribute('data-fluid-lit')).toBe(false)
    const second = bodyRows()[1]!
    await userEvent.hover(second.cells[1]!)
    await vi.waitFor(() => expect(second.hasAttribute('data-fluid-lit')).toBe(true))
    const highlight = document.querySelector<HTMLElement>('div[aria-hidden="true"]')!
    await vi.waitFor(() => {
      const a = highlight.getBoundingClientRect()
      const b = second.getBoundingClientRect()
      expect([Math.round(a.top), Math.round(a.height)]).toEqual([
        Math.round(b.top),
        Math.round(b.height),
      ])
    })
    // The open row's line goes, so its detail reads as its own.
    expect(getComputedStyle(bodyRows()[0]!).borderBlockEndColor).toBe(transparent)
  } finally {
    mounted.dispose()
  }
})

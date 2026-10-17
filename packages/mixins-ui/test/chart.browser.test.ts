/**
 * The chart on a real page: each value label centred on its gridline, the
 * bars as tall as their values, every label inside the chart, every other
 * category label hidden when the chart is narrow; the pointer lights a
 * category, dims the rest and opens a tooltip that stays over the plot; the
 * keys step through the points and the status says each; and a donut's
 * slices in five different colors.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
// From the modules, not the index: the test reads nothing else.
import * as Chart from '../src/chart.js'
import { ChartSlots } from '../src/chart.js'
import { Chart as Recipe } from '../src/recipes/chart.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(ChartSlots)(Recipe({}))
const categories = ['January', 'February', 'March', 'April', 'May', 'June']
const series = [
  { name: 'Desktop', values: [186, 305, 237, 73, 209, 214] },
  { name: 'Mobile', values: [80, 200, 120, 190, 130, 140] },
]

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = async (width: number, kind: 'bar' | 'line' | 'donut' = 'bar') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  // Somewhere for the pointer to rest away from the chart.
  const rest = document.createElement('div')
  rest.style.cssText = 'height: 40px'
  rest.id = 'rest'
  const container = document.createElement('div')
  container.id = 'chart'
  document.body.append(rest, container)
  Runtime.embed(
    Runtime.makeElement({
      Model: Chart.Model,
      container,
      init: () => ({ model: Chart.init() }),
      update: Chart.update,
      view: (model: Chart.Model, h: HtmlBuilder<Chart.Message>) =>
        h.div(
          [h.Style({ width: `${width}px`, padding: '16px' })],
          [
            kind === 'donut'
              ? Chart.view(
                  {
                    id: 'browsers',
                    label: 'Visitors',
                    kind: 'donut',
                    slices: ['Chrome', 'Safari', 'Firefox', 'Edge', 'Other'].map((name, at) => ({
                      name,
                      value: 100 - at * 15,
                    })),
                    model,
                    onMessage: message => message,
                    style,
                  },
                  h,
                )
              : Chart.view(
                  {
                    id: 'sales',
                    label: 'Sales',
                    kind,
                    categories,
                    series,
                    model,
                    onMessage: message => message,
                    style,
                  },
                  h,
                ),
            h.button([h.Type('button')], ['After']),
          ],
        ),
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('[role="group"]')).not.toBeNull())
  await userEvent.hover(document.getElementById('rest')!)
  const all = (selector: string) => Array.from(document.querySelectorAll(selector))
  const one = (selector: string) => {
    const found = document.querySelector(selector)
    if (found === null) throw new Error(`nothing drawn at ${selector}`)
    return found
  }
  return { all, one, root: one('figure'), plot: one('[role="group"]') }
}

const within = (inner: DOMRect, outer: DOMRect) => {
  expect(inner.left).toBeGreaterThanOrEqual(outer.left - 0.5)
  expect(inner.right).toBeLessThanOrEqual(outer.right + 0.5)
  expect(inner.top).toBeGreaterThanOrEqual(outer.top - 0.5)
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + 0.5)
}

test('each value label sits on its gridline, and a bar is as tall as its value', async () => {
  const { all, root, plot } = await mount(600)
  const lines = all('line')
  const labels = all('figure > div > div:first-child > span')
  expect(labels.map(label => label.textContent)).toEqual([
    '0',
    '50',
    '100',
    '150',
    '200',
    '250',
    '300',
    '350',
  ])
  labels.forEach((label, at) => {
    const box = label.getBoundingClientRect()
    expect(box.top + box.height / 2).toBeCloseTo(lines[at]!.getBoundingClientRect().top, 0)
  })
  const area = plot.getBoundingClientRect()
  // February's desktop bar, 305 of an axis to 350, standing on the plot's floor.
  const bar = all('rect[data-color="1"]')[1]!.getBoundingClientRect()
  expect(bar.height).toBeCloseTo((area.height * 305) / 350, 0)
  expect(bar.bottom).toBeCloseTo(area.bottom, 0)
  const box = root.getBoundingClientRect()
  // Every label drawn for the eye: the axes' and the legend's.
  for (const label of all('[style*="--_fk-chart-at"], li'))
    within(label.getBoundingClientRect(), box)
})

test.each([
  [280, ['January', 'March', 'May']],
  [600, categories],
])('at %ipx the category labels shown are %j', async (width, shown) => {
  const { all, plot } = await mount(width)
  const ticks = all('[data-minor]')
  expect(
    ticks
      .filter(tick => getComputedStyle(tick).visibility === 'visible')
      .map(tick => tick.textContent),
  ).toEqual(shown)
  const area = plot.getBoundingClientRect()
  ticks.forEach((tick, at) => {
    const box = tick.getBoundingClientRect()
    expect(box.left).toBeGreaterThanOrEqual(area.left - 0.5)
    expect(box.right).toBeLessThanOrEqual(area.right + 0.5)
    // Centred under its category's band.
    expect(box.left + box.width / 2).toBeCloseTo(area.left + ((at + 0.5) / 6) * area.width, 0)
  })
})

test('the pointer lights a category: the rest dim, and its tooltip stays over the plot', async () => {
  const { all, one, plot } = await mount(600)
  // The bands: neither a bar (colored) nor the cursor (of a kind).
  const bands = all('rect:not([data-color]):not([data-kind])')
  expect(bands).toHaveLength(6)
  await userEvent.hover(bands[5]!)
  await vi.waitFor(() => expect(document.querySelector('[data-side]')).not.toBeNull())
  const tooltip = one('[data-side]')
  expect(tooltip.textContent).toBe('JuneDesktop214Mobile140')
  expect(tooltip.getAttribute('data-side')).toBe('start')
  const area = plot.getBoundingClientRect()
  const box = tooltip.getBoundingClientRect()
  expect(box.left).toBeGreaterThanOrEqual(area.left)
  expect(box.right).toBeLessThanOrEqual(area.right)
  // Once the dimming's transition has run.
  await vi.waitFor(() =>
    expect(
      new Set(
        all('rect[data-color]').map(
          bar => `${bar.getAttribute('data-active')} ${getComputedStyle(bar).fillOpacity}`,
        ),
      ),
    ).toEqual(new Set(['true 1', 'false 0.45'])),
  )
  await userEvent.hover(document.getElementById('rest')!)
  await vi.waitFor(() => expect(document.querySelector('[data-side]')).toBeNull())
})

test('the keys step through the points, and the status says each', async () => {
  const { one } = await mount(600, 'line')
  const status = one('[role="status"]')
  await userEvent.tab()
  await vi.waitFor(() => expect(status.textContent).toBe('January: Desktop 186, Mobile 80'))
  await userEvent.keyboard('{ArrowRight}')
  await vi.waitFor(() => expect(status.textContent).toBe('February: Desktop 305, Mobile 200'))
  await userEvent.keyboard('{End}')
  await vi.waitFor(() => expect(status.textContent).toBe('June: Desktop 214, Mobile 140'))
  expect(document.querySelectorAll('circle')).toHaveLength(2)
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(status.textContent).toBe(''))
  await userEvent.keyboard('{Home}')
  await vi.waitFor(() => expect(status.textContent).toBe('January: Desktop 186, Mobile 80'))
  // Away from the plot, nothing stays lit.
  await userEvent.tab()
  await vi.waitFor(() => expect(document.querySelector('[data-side]')).toBeNull())
  expect(status.textContent).toBe('')
})

test('a donut draws its five slices in five colors, its total in the hole', async () => {
  const { all, one } = await mount(400, 'donut')
  const fills = all('path[data-color]').map(slice => getComputedStyle(slice).fill)
  expect(new Set(fills).size).toBe(5)
  const hole = one('[aria-hidden="true"] > span').closest('div')!.getBoundingClientRect()
  const ring = one('svg').getBoundingClientRect()
  expect(hole.left + hole.width / 2).toBeCloseTo(ring.left + ring.width / 2, 0)
  expect(one('figure').textContent).toContain('350Total')
})

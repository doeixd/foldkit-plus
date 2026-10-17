// @vitest-environment jsdom
/**
 * The chart rendered on a server, as a browser parses it: the plot's marks
 * in the SVG namespace with their view boxes, and the data table whole, so a
 * page served before it hydrates already reads.
 */
import { Effect, Option } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { expect, test } from 'vitest'
import * as Chart from '../src/chart.js'

const served = (kind: 'bar' | 'area') =>
  Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: { point: Option.some(1), keyed: true } }),
        view: (model: Chart.Model, h: HtmlBuilder<Chart.Message>) => ({
          title: 'Chart',
          body: Chart.view(
            {
              id: 'sales',
              label: 'Sales',
              kind,
              categories: ['Jan', 'Feb'],
              series: [
                { name: 'Desktop', values: [186, 305] },
                { name: 'Mobile', values: [80, 200] },
              ],
              model,
              onMessage: message => message,
            },
            h,
          ),
        }),
      },
      { buildId: 'b' },
    ),
  )

const parsed = async (kind: 'bar' | 'area') =>
  new DOMParser().parseFromString(
    injectIntoTemplate(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      await served(kind),
    ),
    'text/html',
  )

test('a bar chart serves its bars as SVG and its table whole', async () => {
  const page = await parsed('bar')
  const svg = 'http://www.w3.org/2000/svg'
  const bars = Array.from(page.querySelectorAll('rect[data-color]'))
  expect(bars).toHaveLength(4)
  expect(bars.every(bar => bar.namespaceURI === svg)).toBe(true)
  expect(
    Array.from(page.querySelectorAll('tbody tr')).map(row =>
      Array.from(row.children).map(cell => cell.textContent),
    ),
  ).toEqual([
    ['Jan', '186', '80'],
    ['Feb', '305', '200'],
  ])
  expect(page.querySelector('[role="status"]')?.textContent).toBe('Feb: Desktop 305, Mobile 200')
})

test('an area chart serves its stretched box and its paths', async () => {
  const page = await parsed('area')
  const box = page.querySelector('svg svg')
  expect(box?.getAttribute('viewBox')).toBe('0 0 100 100')
  expect(box?.getAttribute('preserveAspectRatio')).toBe('none')
  expect(page.querySelectorAll('path[data-color]')).toHaveLength(4)
  expect(page.querySelectorAll('circle')).toHaveLength(2)
})

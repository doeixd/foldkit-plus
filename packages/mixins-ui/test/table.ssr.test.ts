// @vitest-environment jsdom
/**
 * The table rendered on a server, as a browser parses it: a parser builds a
 * `tbody` the markup must already hold, so a table served before it hydrates
 * has to read back as it was drawn.
 */
import { Effect, Option } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { expect, test } from 'vitest'
import { view } from '../src/table.js'

const served = (h: HtmlBuilder<string>) =>
  view<{ readonly name: string; readonly price: string }, string>(
    {
      caption: 'Groceries',
      columns: [
        {
          header: 'Product',
          sortKey: 'name',
          rowHeader: true,
          value: row => h.strong([], [row.name]),
        },
        { header: 'Price', numeric: true, value: row => row.price },
      ],
      rows: [
        { name: 'Apples', price: '4.99' },
        { name: 'Bread', price: '2.50' },
      ],
      rowKey: row => row.name,
      sort: {
        by: Option.some({ column: 'name', direction: 'ascending' }),
        onSort: () => 'pressed',
      },
      expansion: {
        id: 'details',
        isExpanded: row => row.name === 'Bread',
        onToggle: () => 'pressed',
        detail: row => h.p([], [`About ${row.name}`]),
      },
    },
    h,
  )

const parsed = async () =>
  new DOMParser().parseFromString(
    injectIntoTemplate(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      await Effect.runPromise(
        renderToString(
          {
            init: () => ({ model: {} }),
            view: (_model: object, h: HtmlBuilder<string>) => ({ title: 'Table', body: served(h) }),
          },
          { buildId: 'b' },
        ),
      ),
    ),
    'text/html',
  )

test('a sorted, expandable table with a row header and an Html cell parses back as drawn', async () => {
  const page = await parsed()
  const rows = Array.from(page.querySelectorAll('table > tbody > tr'))
  expect(page.querySelectorAll('table > tr, table > td')).toHaveLength(0)
  expect(rows).toHaveLength(3)
  expect(Array.from(rows[0]!.children).map(cell => cell.tagName)).toEqual(['TD', 'TH', 'TD'])
  expect(rows[0]!.querySelector('th')?.getAttribute('scope')).toBe('row')
  expect(rows[0]!.querySelector('th > strong')?.textContent).toBe('Apples')
  expect(rows[2]!.textContent).toBe('About Bread')
  const heads = Array.from(page.querySelectorAll('table > thead > tr > th'))
  expect(heads.map(head => head.getAttribute('scope'))).toEqual(['col', 'col', 'col'])
  expect(heads[0]!.textContent).toBe('Details')
  expect(heads[1]!.getAttribute('aria-sort')).toBe('ascending')
  expect(page.querySelectorAll('table > caption')).toHaveLength(1)
})

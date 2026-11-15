// @vitest-environment jsdom
/**
 * The field rendered on a server, as a browser parses it: a search input
 * holding the text, named, with the clear button beside it, and the markup
 * unchanged by the parse.
 */
import { Effect } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { expect, test } from 'vitest'
import * as SearchField from '../src/searchField.js'
import { message, type TestMessage } from './fixture.js'

test('a served field parses back to a named search input and its clear button', async () => {
  const served = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: {} }),
        view: (_: object, h: HtmlBuilder<TestMessage>) => ({
          title: 'Shop',
          body: SearchField.view(
            {
              id: 'find',
              label: 'Search products',
              value: 'lamp',
              onInput: () => message('Other'),
              onClear: message('Clicked'),
              placeholder: 'Lamps',
            },
            h,
          ),
        }),
      },
      { buildId: 'b' },
    ),
  )
  const page = new DOMParser().parseFromString(
    injectIntoTemplate(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      served,
    ),
    'text/html',
  )
  const input = page.querySelector('input')
  expect(input?.getAttribute('type')).toBe('search')
  expect(input?.getAttribute('aria-label')).toBe('Search products')
  expect(input?.getAttribute('placeholder')).toBe('Lamps')
  expect(input?.getAttribute('value')).toBe('lamp')
  expect(page.querySelector('button#find-clear')?.getAttribute('aria-label')).toBe('Clear search')
})

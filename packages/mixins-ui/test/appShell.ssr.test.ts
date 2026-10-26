// @vitest-environment jsdom
/**
 * The frame rendered on a server, as a browser parses it: one banner, one main
 * region with the id the skip link names, and the side column's content, so a
 * page served before it hydrates already has its landmarks.
 */
import { Effect } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { expect, test } from 'vitest'
import * as AppShell from '../src/appShell.js'

test('a served frame parses back to its landmarks', async () => {
  const served = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: {} }),
        view: (_: object, h: HtmlBuilder<never>) => ({
          title: 'Journal',
          body: AppShell.view(
            {
              title: 'Journal',
              side: h.nav([h.AriaLabel('Sections')], [h.a([h.Href('/posts')], ['Posts'])]),
              footer: [h.span([], ['MIT'])],
            },
            [h.h1([], ['Posts'])],
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
  expect(page.querySelectorAll('header')).toHaveLength(1)
  expect(page.querySelectorAll('main')).toHaveLength(1)
  expect(page.querySelectorAll('footer')).toHaveLength(1)
  const skip = page.querySelector('a[href="#main"]')
  expect(skip?.textContent).toBe('Skip to content')
  expect(page.querySelector('main')?.id).toBe('main')
  // Served focusable, so the skip link works before the page hydrates.
  expect(page.querySelector('main')?.getAttribute('tabindex')).toBe('-1')
  expect(page.querySelector('main h1')?.textContent).toBe('Posts')
  expect(page.querySelector('[data-side] nav[aria-label="Sections"] a')?.getAttribute('href')).toBe(
    '/posts',
  )
})

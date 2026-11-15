// @vitest-environment jsdom
/**
 * The toolbar rendered on a server, as a browser parses it: a named toolbar
 * with one control holding the tab stop, and the markup unchanged by the parse.
 */
import { Effect } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { expect, test } from 'vitest'
import * as Toolbar from '../src/toolbar.js'
import { message, type TestMessage } from './fixture.js'

test('a served toolbar parses back to a named toolbar with one tab stop', async () => {
  const served = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: {} }),
        view: (_: object, h: HtmlBuilder<TestMessage>) => ({
          title: 'Editor',
          body: Toolbar.view(
            {
              id: 'bar',
              label: 'Formatting',
              roving: { current: 'link' },
              onFocus: () => message('Clicked'),
              items: ['bold', 'link'].map((id): Toolbar.ToolbarControl<TestMessage> => ({
                id,
                draw: ({ attributes }) => h.button([...attributes], [id]),
              })),
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
  const bar = page.querySelector('[role="toolbar"]')
  expect(bar?.getAttribute('aria-label')).toBe('Formatting')
  expect(bar?.getAttribute('aria-orientation')).toBe('horizontal')
  const buttons = [...page.querySelectorAll('button')]
  expect(buttons.map(each => each.id)).toEqual(['bar-bold', 'bar-link'])
  expect(buttons.map(each => each.getAttribute('tabindex'))).toEqual(['-1', '0'])
})

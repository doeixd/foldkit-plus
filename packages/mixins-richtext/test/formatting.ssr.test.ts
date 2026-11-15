// @vitest-environment jsdom
/**
 * The formatting toolbar rendered on a server and parsed back as a browser reads it: one tab stop,
 * the controls in order, a refused control `aria-disabled` rather than `disabled`, and the open
 * panels with the application's entries beside the editor's.
 */
import { Effect } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { expect, test } from 'vitest'
import { InsertEntry } from '../src/index.js'
import { Message, Toolbar, base, given, type Model } from './formatting.js'

const served = () =>
  Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: given({ menu: 'insert' }) }),
        view: (model: Model, h: HtmlBuilder<Message>) => ({
          title: 'Bar',
          body: Toolbar(
            {
              ...base,
              selection: model.selection,
              menu: model.menu,
              items: [
                'undo',
                { mark: 'Bold' },
                {
                  control: {
                    id: 'find',
                    label: 'Find',
                    icon: 'search',
                    message: Message.Picked({ what: 'find' }),
                  },
                },
                'separator',
                'insert',
              ],
              inserts: [
                InsertEntry.App({
                  id: 'file',
                  label: 'Image, video or file',
                  message: Message.Picked({ what: 'file' }),
                }),
              ],
            },
            h,
          ),
        }),
      },
      { buildId: 'b' },
    ),
  )

test('the bar parses back as one tab stop over its controls, with the open panel', async () => {
  const page = new DOMParser().parseFromString(
    injectIntoTemplate(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      await served(),
    ),
    'text/html',
  )
  const bar = page.querySelector('[role="toolbar"]')
  expect(bar?.getAttribute('aria-label')).toBe('Formatting')
  const buttons = [...(bar?.querySelectorAll(':scope > button, :scope > div > button') ?? [])]
  expect(buttons.map(button => button.getAttribute('data-item'))).toEqual([
    'undo',
    'mark-Bold',
    'app-find',
    'insert',
  ])
  expect(buttons.map(button => button.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1'])
  expect(buttons.map(button => button.getAttribute('aria-expanded'))).toEqual([
    null,
    null,
    null,
    'true',
  ])
  expect(buttons.some(button => button.hasAttribute('disabled'))).toBe(false)
  expect(
    [...page.querySelectorAll('[role="menu"] [role="menuitem"]')].map(item =>
      item.getAttribute('data-insert'),
    ),
  ).toEqual(['file'])
  expect(bar?.querySelector('svg')).not.toBeNull()
  expect(new Set(buttons.map(button => button.id)).size).toBe(buttons.length)
})

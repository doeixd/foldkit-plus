// @vitest-environment jsdom
/**
 * The leaving page rendered on a server: a hiding row and a shown popup are in
 * the markup, and the hiding row carries the leaving marker before any script.
 */
import { Effect, Option } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { expect, test } from 'vitest'
import { LEAVING } from 'foldkit-primitives/dom'
import { Message, Model, initial, view } from '../src/ui-sdk-leaving.js'

test('a hiding row and an open popup are in the first markup', async () => {
  const served = await Effect.runPromise(
    renderToString(
      {
        init: () => ({
          model: {
            ...initial.model,
            closing: Option.some('design'),
            rowExit: { phase: 'hiding' as const, generation: 2 },
            popup: { phase: 'shown' as const, generation: 1 },
          },
        }),
        view: (model: Model, h: HtmlBuilder<Message>) => ({
          title: 'Leaving',
          body: view(model, h),
        }),
      },
      { buildId: 'leaving' },
    ),
  )
  const template =
    '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'
  const parsed = new DOMParser().parseFromString(injectIntoTemplate(template, served), 'text/html')
  const row = [...parsed.querySelectorAll('li')].find(node => node.textContent?.includes('design'))
  expect(row?.hasAttribute(LEAVING)).toBe(true)
  expect(parsed.querySelector('button')?.textContent).toBeTruthy()
  expect(
    [...parsed.querySelectorAll('button')].some(node => node.textContent === 'Dialog action'),
  ).toBe(true)
  const panel = [...parsed.querySelectorAll('div')].find(node =>
    node.textContent?.includes('Dialog action'),
  )
  expect(panel?.hasAttribute(LEAVING)).toBe(false)
  expect(parsed.querySelector('input')?.id).toBe('main-filter:a [b]')
})

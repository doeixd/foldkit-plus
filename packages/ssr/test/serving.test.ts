// @vitest-environment jsdom
/**
 * `SSR.serving`: a view can tell the server's render of a page from the browser's, as an editor
 * host that sends markup for the browser to adopt needs to.
 */
import { Effect } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import {
  config,
  load,
  plan,
  settle,
  template,
  type Message,
  type Model,
} from './handoverFixture.js'

const telling = {
  ...config,
  view: (model: Model, h: HtmlBuilder<Message>) => ({
    title: 'Where',
    body: h.div(
      [],
      [config.view(model, h).body, h.p([h.Id('where')], [SSR.serving() ? 'server' : 'browser'])],
    ),
  }),
}

it('is true while the server renders a page, and false in the browser and outside a render', async () => {
  expect(SSR.serving()).toBe(false)
  load(SSR.page(template, await Effect.runPromise(SSR.render(telling, plan, { buildId: 'b' }))))
  expect(document.getElementById('where')?.textContent).toBe('server')

  SSR.hydrate(telling, plan, { buildId: 'b' })
  await settle()
  expect(document.getElementById('where')?.textContent).toBe('browser')
})

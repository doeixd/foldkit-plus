/**
 * Phase G6: the envelope lists every event the page's markers name, those a
 * handler the page cannot name marks `*` alone included, so the browser
 * listens without reading every element's attributes to find them.
 */
import { Effect } from 'effect'
import { expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { config, plan } from './bindingsFixture.js'

it("lists every event the page's markers name, once each", async () => {
  const { envelope } = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
  const body = JSON.parse(envelope.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''))
  // `pointerdown` has only a closure (#point): no binding names it.
  expect(body.events).toEqual(['change', 'click', 'input', 'keydown', 'pointerdown'])
})

// @vitest-environment jsdom
/**
 * While a lazy bundle's bodies load, an event whose walk meets a handler the
 * page cannot name is held and sent again once the page boots, to the element
 * it first reached, so every handler on its path answers it: the named one
 * inside, and the unnamed one around it.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { body, byId, deferred, load, make, template } from './lazyFixture.js'

it('sends a held event back to its own target', async () => {
  const served = make(() => Promise.resolve(body))
  load(
    SSR.page(
      template,
      await Effect.runPromise(SSR.render(served.config, served.plan(), { buildId: 'b' })),
    ),
  )
  const { load: loadBodies, release } = deferred()
  const browser = make(loadBodies)
  SSR.hydrate(browser.config, browser.plan(), { buildId: 'b' })

  byId('keys').dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))
  release()
  // The unnamed handler around it ran, and so did the named one on the input.
  await vi.waitFor(() => expect(byId('press').textContent).toBe('5'))
  await vi.waitFor(() => expect(byId('count').textContent).toBe('1'))
})

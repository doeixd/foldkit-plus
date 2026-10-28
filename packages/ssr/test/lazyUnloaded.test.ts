// @vitest-environment jsdom
/**
 * A page whose lazy bundle's bodies fail to load still boots, and reports the
 * failure rather than leaving the page to work without them in silence.
 */
import { Effect } from 'effect'
import { FOLDKIT_APP_ATTRIBUTE } from 'foldkit/experimental/server'
import { expect, it, vi } from 'vitest'
import { Diagnostics, SSR } from 'foldkit-ssr'
import { body, load, make, template } from './lazyFixture.js'

it('reports a bundle whose bodies did not load, and boots anyway', async () => {
  const served = make(() => Promise.resolve(body))
  load(
    SSR.page(
      template,
      await Effect.runPromise(SSR.render(served.config, served.plan(), { buildId: 'b' })),
    ),
  )
  const unloadable = new Error('the chunk is gone')
  const browser = make(() => Promise.reject(unloadable))
  const collected = Diagnostics.collect()
  SSR.hydrate(browser.config, browser.plan(), { buildId: 'b', diagnostics: collected.report })

  await vi.waitFor(() =>
    expect(collected.reported).toEqual([
      expect.objectContaining({
        _tag: 'BundleUnloaded',
        source: 'foldkit-ssr',
        level: 'error',
        error: unloadable,
        message: expect.stringContaining('the chunk is gone'),
      }),
    ]),
  )
  await vi.waitFor(() => expect(document.querySelector(`[${FOLDKIT_APP_ATTRIBUTE}]`)).toBeNull())
})

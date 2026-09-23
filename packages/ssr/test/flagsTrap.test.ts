// @vitest-environment jsdom
/**
 * Phase 2 pins the trap that makes `SSR.hydrate` delete the `Flags` key rather
 * than set it to `undefined`: Foldkit's client asks whether the key exists, so
 * a config with `Flags: undefined` expects a Flags payload the page does not
 * carry, and the page is refused.
 */
import { Effect } from 'effect'
import { FOLDKIT_APP_ATTRIBUTE } from 'foldkit/experimental/server'
import { hydrate, makeApplication } from 'foldkit/runtime'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { load, template } from './handoverFixture.js'
import { config, flags, plan } from './flagsFixture.js'

it('refuses a resumed page when the config keeps a Flags key set to undefined', async () => {
  load(
    SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b', flags }))),
  )
  const root = document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)

  hydrate(
    makeApplication({
      ...config,
      // @ts-expect-error: Foldkit's types refuse this; the test pins what it does anyway
      Flags: undefined,
      init: () => ({ model: { theme: 'dark' } }),
      container: root,
    }),
    { buildId: 'b' },
  )
  await vi.waitFor(() => expect(document.body.inert).toBe(true))
})

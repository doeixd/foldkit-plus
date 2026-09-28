// @vitest-environment jsdom
/**
 * Phase G5: the boot does not depend on when `hydrate` commits. Foldkit
 * renders its first frame before `hydrate` returns today, but does not promise
 * it; here `hydrate` is held to a later task. The click that boots the page
 * still counts once, and a click in the window before the first render is not
 * lost.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { booted, byId, config, load, planned, settle, template } from './deferredFixture.js'

vi.mock('foldkit/runtime', async importOriginal => {
  const actual = await importOriginal<typeof import('foldkit/runtime')>()
  return {
    ...actual,
    hydrate: (...args: Parameters<typeof actual.hydrate>) => {
      setTimeout(() => actual.hydrate(...args), 50)
    },
  }
})

it('counts the booting click once, and a click before the first render too', async () => {
  const plan = planned('on-interaction')
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()

  byId('plain').click()
  // The runtime has started, and its first render is still to come.
  await settle(10)
  expect(booted()).toBe(false)
  byId('plain').click()

  await vi.waitFor(() => expect(booted()).toBe(true))
  await vi.waitFor(() => expect(byId('like').textContent).toBe('2'))
  // Long enough for a third Liked, had either click been answered twice.
  await settle(100)
  expect(byId('like').textContent).toBe('2')
})

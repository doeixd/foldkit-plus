// @vitest-environment jsdom
/**
 * Phase G5: an event only the live page can answer still reaches it when the
 * boot it starts commits late. Here `hydrate` is held to a later task, so the
 * event has finished its dispatch before the live page is listening, and must
 * be dispatched again once it is.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { byId, config, load, planned, settle, template } from './deferredFixture.js'

vi.mock('foldkit/runtime', async importOriginal => {
  const actual = await importOriginal<typeof import('foldkit/runtime')>()
  return {
    ...actual,
    hydrate: (...args: Parameters<typeof actual.hydrate>) => {
      setTimeout(() => actual.hydrate(...args), 50)
    },
  }
})

it("reaches the live page with a closure's event when the boot commits late", async () => {
  const plan = planned('on-interaction')
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()

  // The closure upper-cases what was typed; only the live page can do that.
  const closure = byId('closure')
  if (!(closure instanceof HTMLInputElement)) throw new Error('#closure is not an input')
  closure.value = 'atlas'
  closure.dispatchEvent(new Event('input', { bubbles: true }))

  await vi.waitFor(() => expect(byId('echo').textContent).toBe('ATLAS'))
})

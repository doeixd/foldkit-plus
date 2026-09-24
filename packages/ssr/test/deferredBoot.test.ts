// @vitest-environment jsdom
/**
 * Phase C: a page planned to start on interaction answers from its bindings
 * until then. What was typed before boot is in the Model after it, because
 * the same Messages went through the same update in the same order.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { booted, byId, config, load, planned, settle, template } from './deferredFixture.js'

it('boots on the first interaction and replays what happened before it', async () => {
  const plan = planned('on-interaction')
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()
  expect(booted()).toBe(false)

  const search = byId('search')
  if (!(search instanceof HTMLInputElement)) throw new Error('#search is not an input')
  search.value = 'atlas'
  search.dispatchEvent(new Event('input', { bubbles: true }))

  await vi.waitFor(() => expect(byId('echo').textContent).toBe('atlas'))
  expect(booted()).toBe(true)
  expect(search.value).toBe('atlas')
  // Hydration found the value it rendered, so it adopted the input rather than rebuilding it.
  expect(byId('search')).toBe(search)
})

// @vitest-environment jsdom
/**
 * Phase C: an event at a handler the page could not name boots the runtime
 * and is dispatched again once the live page can answer it, so it is not lost.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { booted, byId, config, load, planned, settle, template } from './deferredFixture.js'

it('boots on an event it cannot answer, and lets the live page answer it', async () => {
  const plan = planned('on-interaction')
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()
  expect(booted()).toBe(false)

  // The closure upper-cases what was typed; only the live page can do that.
  const closure = byId('closure')
  if (!(closure instanceof HTMLInputElement)) throw new Error('#closure is not an input')
  closure.value = 'atlas'
  closure.dispatchEvent(new Event('input', { bubbles: true }))

  await vi.waitFor(() => expect(byId('echo').textContent).toBe('ATLAS'))
  expect(booted()).toBe(true)
})

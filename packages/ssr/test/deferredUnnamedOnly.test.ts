// @vitest-environment jsdom
/**
 * Phase C: an event whose every handler is unnamed, at an event no binding
 * names, still boots the page, and the live page answers it exactly once.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { booted, byId, config, load, planned, settle, template } from './deferredFixture.js'

it('boots on an event only unnamed handlers answer, which the live page answers once', async () => {
  const plan = planned('on-interaction')
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()
  expect(booted()).toBe(false)

  byId('point').dispatchEvent(new Event('pointerdown', { bubbles: true }))
  await vi.waitFor(() => expect(byId('like').textContent).toBe('1'))
  expect(booted()).toBe(true)
  await settle(100)
  expect(byId('like').textContent).toBe('1')
})

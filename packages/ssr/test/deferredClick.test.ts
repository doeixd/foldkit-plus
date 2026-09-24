// @vitest-environment jsdom
/**
 * Phase C: the interaction that boots the page counts once. Foldkit's hydrate
 * commits during that event's dispatch, so the live page would answer it too
 * if the markers' answer did not stop it.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { booted, byId, config, load, planned, settle, template } from './deferredFixture.js'

it('counts the click that boots the page once, and lets the live page answer the next', async () => {
  const plan = planned('on-interaction')
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()
  expect(booted()).toBe(false)

  byId('plain').click()
  await vi.waitFor(() => expect(byId('like').textContent).toBe('1'))
  expect(booted()).toBe(true)
  // Long enough for a second Liked, had the live page answered the click too.
  await settle(100)
  expect(byId('like').textContent).toBe('1')

  // After boot the live page answers, not the markers.
  byId('plain').click()
  await vi.waitFor(() => expect(byId('like').textContent).toBe('2'))
})

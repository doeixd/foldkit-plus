// @vitest-environment jsdom
/** Phase C: a page planned to start when idle boots without an interaction. */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { booted, byId, config, load, planned, template } from './deferredFixture.js'

it('boots when the browser is idle', async () => {
  const plan = planned('idle')
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  SSR.hydrate(config, plan, { buildId: 'b' })
  expect(booted()).toBe(false)

  await vi.waitFor(() => expect(booted()).toBe(true))
  byId('like').click()
  await vi.waitFor(() => expect(byId('like').textContent).toBe('1'))
})

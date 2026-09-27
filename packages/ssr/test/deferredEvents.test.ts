// @vitest-environment jsdom
/**
 * Phase G6: a deferred page listens for the events its envelope lists, not
 * the ones it finds by reading the markers. With the `*` marker of #point
 * removed after the page was served, only the envelope says the page has a
 * pointerdown handler, and the press still boots it.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { BINDING_ATTRIBUTE, SSR } from 'foldkit-ssr'
import { booted, byId, config, load, planned, settle, template } from './deferredFixture.js'

it('boots on an event the envelope lists though no marker names it', async () => {
  const plan = planned('on-interaction')
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  byId('point').removeAttribute(`${BINDING_ATTRIBUTE}pointerdown`)
  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()
  expect(booted()).toBe(false)

  byId('point').dispatchEvent(new Event('pointerdown', { bubbles: true }))
  await vi.waitFor(() => expect(booted()).toBe(true))
})

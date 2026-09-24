// @vitest-environment jsdom
/**
 * Phase F, in the browser: a page whose bundle bodies have not loaded answers
 * from its markers until they have, then boots. A click meanwhile is counted
 * once; an event only the live page can answer reaches it after the boot.
 */
import { Effect } from 'effect'
import { FOLDKIT_APP_ATTRIBUTE } from 'foldkit/experimental/server'
import { expect, it, vi } from 'vitest'
import { SLOT_ATTRIBUTE, SSR } from 'foldkit-ssr'
import { body, byId, deferred, load, make, settle, template } from './lazyFixture.js'

const booted = () => document.querySelector(`[${FOLDKIT_APP_ATTRIBUTE}]`) === null

it('boots once the bodies load, replaying the click and re-dispatching the press', async () => {
  const served = make(() => Promise.resolve(body))
  load(
    SSR.page(
      template,
      await Effect.runPromise(SSR.render(served.config, served.plan(), { buildId: 'b' })),
    ),
  )
  expect(byId('clicker').getAttribute(SLOT_ATTRIBUTE)).toBe('Clicker@clicker')

  const { load: loadBodies, release, calls } = deferred()
  const browser = make(loadBodies)
  SSR.hydrate(browser.config, browser.plan(), { buildId: 'b' })
  await settle()
  // Starting now, but the bodies are on their way: no boot yet, and one load.
  expect(booted()).toBe(false)
  expect(calls()).toBe(1)

  byId('count').click()
  byId('press').dispatchEvent(new Event('pointerdown', { bubbles: true }))
  const text = byId('text')
  if (!(text instanceof HTMLInputElement)) throw new Error('#text is not an input')
  text.value = 'abc'
  text.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
  expect(booted()).toBe(false)
  expect(byId('count').textContent).toBe('0')

  release()
  await vi.waitFor(() => expect(byId('count').textContent).toBe('1'))
  expect(booted()).toBe(true)
  await vi.waitFor(() => expect(byId('press').textContent).toBe('2'))
  // The stamp went with the first patch, as the markers do.
  expect(byId('clicker').hasAttribute(SLOT_ATTRIBUTE)).toBe(false)
  await settle(100)
  expect(byId('count').textContent).toBe('1')
  expect(byId('press').textContent).toBe('2')
  // The hole was filled inside the wrapper, so the child's update saw the text.
  expect(byId('echo').textContent).toBe('abc')

  // After boot the live page answers, not the markers.
  byId('count').click()
  await vi.waitFor(() => expect(byId('count').textContent).toBe('2'))
})

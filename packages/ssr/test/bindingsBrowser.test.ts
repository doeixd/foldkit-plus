// @vitest-environment jsdom
/**
 * Phase A, in the browser: the resumable builder marks nothing there, so
 * Foldkit's first patch removes the server's markers, and each binding,
 * the hole forms included, dispatches the Message its closure would have.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { BINDING_ATTRIBUTE, SSR } from 'foldkit-ssr'
import { config, load, plan, template } from './bindingsFixture.js'

/** The element the server rendered with this id. */
const byId = (id: string): HTMLElement => {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`the page has no #${id}`)
  return element
}

it('adopts a marked page, drops the markers, and dispatches each binding', async () => {
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  const like = byId('like')
  expect(like.getAttribute(`${BINDING_ATTRIBUTE}click`)).toBe('0')

  SSR.hydrate(config, plan, { buildId: 'b' })

  await vi.waitFor(() => expect(like.hasAttribute(`${BINDING_ATTRIBUTE}click`)).toBe(false))
  expect(document.getElementById('like')).toBe(like)
  expect(document.querySelector(`[${BINDING_ATTRIBUTE}input]`)).toBeNull()

  like.click()
  await vi.waitFor(() => expect(like.textContent).toBe('1'))

  const search = byId('search')
  if (!(search instanceof HTMLInputElement)) throw new Error('#search is not an input')
  search.value = 'atlas'
  search.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.waitFor(() => expect(document.getElementById('echo')?.textContent).toBe('atlas'))

  const keys = byId('keys')
  keys.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await vi.waitFor(() => expect(keys.textContent).toBe('Enter'))
})

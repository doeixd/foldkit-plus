/**
 * The published demo's in-page server: seeded once, kept in the browser's
 * storage after a change, opened again from it (so a change of chair keeps
 * what was written), and started afresh by `?reset`.
 */
import { afterEach, expect, it } from 'vitest'
import { openSandbox } from '../src/browser.js'

const KEY = 'foldkit-cms-demo'

afterEach(() => {
  localStorage.removeItem(KEY)
  window.history.replaceState(null, '', '/')
})

it('keeps its database, opens it again, and starts afresh on ?reset', async () => {
  localStorage.removeItem(KEY)
  const send = await openSandbox()
  const seeded = localStorage.getItem(KEY)
  expect(seeded).not.toBeNull()
  // A body that is no request is answered as one that fails, not thrown.
  const refused = await send('visitor', JSON.stringify({ operation: 'nothing' }))
  expect(refused.ok).toBe(false)
  // Opened again over what was kept: its tables are there, so none is made twice.
  await openSandbox()
  expect(localStorage.getItem(KEY)).toBe(seeded)
  // Reset: what was kept is dropped, and the address loses the word, so a reload keeps.
  localStorage.setItem(KEY, 'not a database')
  window.history.replaceState(null, '', '/?reset')
  await openSandbox()
  expect(localStorage.getItem(KEY)).not.toBe('not a database')
  expect(new URLSearchParams(window.location.search).has('reset')).toBe(false)
})

it('starts afresh from something kept that is no sandbox, rather than failing to open', async () => {
  localStorage.setItem(KEY, btoa('these bytes are no SQLite database at all'))
  const send = await openSandbox()
  expect(localStorage.getItem(KEY)).not.toBe(btoa('these bytes are no SQLite database at all'))
  expect((await send('visitor', '{}')).ok).toBe(false)
})

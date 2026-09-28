/**
 * The published demo's in-page server: seeded once, kept in the browser's
 * storage after a change, opened again from it (so a change of chair keeps
 * what was written), and started afresh when the address asks (`?reset`).
 */
import { afterEach, expect, it } from 'vitest'
import { openSandbox } from '../src/browser.js'
import { clearEdited, edited, SANDBOX_KEY } from '../src/sandboxKey.js'
import type { Send } from '../src/transport.js'

const KEY = SANDBOX_KEY

/** A change the sandbox stores: the home page archived, as its editor. */
const archiveHome = (send: Send) =>
  send(
    'edda',
    JSON.stringify({
      operation: 'mutate',
      payload: { requestId: 'r1', mutation: 'CmsArchive', input: { entry: 'entry-page-home' } },
    }),
  )

afterEach(() => {
  localStorage.removeItem(KEY)
  clearEdited()
})

it('keeps its database, opens it again, and starts afresh when asked', async () => {
  localStorage.removeItem(KEY)
  const send = await openSandbox({ fresh: false })
  const seeded = localStorage.getItem(KEY)
  expect(seeded).not.toBeNull()
  // A body that is no request is answered as one that fails, not thrown.
  const refused = await send('visitor', JSON.stringify({ operation: 'nothing' }))
  expect(refused.ok).toBe(false)
  // Opened again over what was kept: its tables are there, so none is made twice.
  await openSandbox({ fresh: false })
  expect(localStorage.getItem(KEY)).toBe(seeded)
  // Fresh: a sandbox changed since is not read, and a seeded one is stored over it.
  await archiveHome(send)
  window.dispatchEvent(new Event('pagehide'))
  const changed = localStorage.getItem(KEY)
  await openSandbox({ fresh: true })
  expect(localStorage.getItem(KEY)).not.toBe(changed)
})

it('starts afresh from something kept that is no sandbox, rather than failing to open', async () => {
  localStorage.setItem(KEY, btoa('these bytes are no SQLite database at all'))
  const send = await openSandbox({ fresh: false })
  expect(localStorage.getItem(KEY)).not.toBe(btoa('these bytes are no SQLite database at all'))
  expect((await send('visitor', '{}')).ok).toBe(false)
})

it('keeps a change a moment after it, or at once when the page is left', async () => {
  localStorage.removeItem(KEY)
  const send = await openSandbox({ fresh: false })
  const seeded = localStorage.getItem(KEY)
  expect((await archiveHome(send)).ok).toBe(true)
  // Not yet: saves come in runs while someone types.
  expect(localStorage.getItem(KEY)).toBe(seeded)
  window.dispatchEvent(new Event('pagehide'))
  expect(localStorage.getItem(KEY)).not.toBe(seeded)
})

it('lets go of a sandbox kept from an older seed, and starts from this one', async () => {
  localStorage.setItem('foldkit-cms-demo', 'kept from the first seed')
  await openSandbox({ fresh: false })
  expect(localStorage.getItem('foldkit-cms-demo')).toBeNull()
  expect(localStorage.getItem(KEY)).not.toBeNull()
})

it('marks itself edited on a change, and holds the seed again once started afresh', async () => {
  const send = await openSandbox({ fresh: false })
  // Seeded and read: the generated pages still show what it holds.
  await send('visitor', JSON.stringify({ operation: 'nothing' }))
  expect(edited()).toBe(false)
  await archiveHome(send)
  expect(edited()).toBe(true)
  await openSandbox({ fresh: true })
  expect(edited()).toBe(false)
})

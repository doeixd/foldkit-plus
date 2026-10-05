/**
 * The published demo's server: seeded once and kept in IndexedDB, opened
 * again from it, started afresh when a page asks (`?reset`), and one database
 * for every conversation, so two tabs write to the same sandbox, and a reset
 * from one is what the other's next call meets.
 */
import { Effect, ManagedRuntime, Option } from 'effect'
import { RemoteClient } from 'foldkit-remote'
import { afterEach, expect, it } from 'vitest'
import { openHost } from '../src/server/host.js'
import { edited, read, write } from '../src/server/store.js'
import { hostedRemote } from './hosted.js'

/** The bytes kept now, or none. */
const keptBytes = async () => Option.map(await read(), ({ bytes }) => bytes)

/** A change the sandbox keeps: the home page archived, as its editor. */
const archiveHome = (remote: ReturnType<typeof hostedRemote>, requestId: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* RemoteClient
      return yield* client.mutate({
        requestId,
        mutation: 'CmsArchive',
        input: { entry: 'entry-page-home' },
      })
    }).pipe(Effect.provide(remote)),
  )

/**
 * A page's first call, which is what opens its conversation: a mutation no
 * server knows, so it changes nothing.
 */
const firstCall = (remote: ReturnType<typeof hostedRemote>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* RemoteClient
      return yield* client.mutate({ requestId: 'first', mutation: 'Nothing', input: {} })
    }).pipe(Effect.provide(remote), Effect.exit),
  )

/** Waits until what is kept is no longer `before`. */
const keptAfter = async (before: Option.Option<Uint8Array>) => {
  await expect.poll(async () => String(await keptBytes()) !== String(before)).toBe(true)
  return keptBytes()
}

afterEach(async () => {
  await new Promise<void>(resolve => {
    const request = indexedDB.deleteDatabase('foldkit-cms-demo')
    request.onsuccess = request.onerror = request.onblocked = () => resolve()
  })
})

it('keeps its database, opens it again, and starts afresh when a page asks', async () => {
  await openHost()
  const seeded = await keptAfter(Option.none())
  expect(await edited()).toBe(false)
  // Opened again over what was kept: nothing is seeded or kept anew.
  await openHost()
  expect(await keptBytes()).toEqual(seeded)
  const host = await openHost()
  await archiveHome(hostedRemote(host, 'edda'), 'r1')
  const changed = await keptAfter(seeded)
  expect(await edited()).toBe(true)
  // A page asking afresh: the seed again, and no longer edited.
  await firstCall(hostedRemote(host, 'visitor', { fresh: true }))
  await keptAfter(changed)
  expect(await edited()).toBe(false)
})

it('starts from the seed over something kept that is no sandbox', async () => {
  await write({ bytes: new TextEncoder().encode('no SQLite database at all'), edited: true })
  await openHost()
  await expect.poll(() => edited()).toBe(false)
})

it('lets go of a sandbox kept from an older edition', async () => {
  await openHost()
  const seeded = await keptAfter(Option.none())
  // An older edition's record, as its build kept it.
  await new Promise<void>((resolve, reject) => {
    const opened = indexedDB.open('foldkit-cms-demo', 1)
    opened.onsuccess = () => {
      const transaction = opened.result.transaction('sandbox', 'readwrite')
      transaction
        .objectStore('sandbox')
        .put({ edition: 4, bytes: Option.getOrThrow(seeded), edited: true }, 'sandbox')
      transaction.oncomplete = () => {
        opened.result.close()
        resolve()
      }
      transaction.onerror = () => reject(transaction.error)
    }
  })
  expect(await read()).toEqual(Option.none())
  expect(await edited()).toBe(false)
})

it('answers every tab from one database, the one a reset left', async () => {
  const host = await openHost()
  await keptAfter(Option.none())
  // Tab A's one conversation, open across what follows.
  const tabA = ManagedRuntime.make(hostedRemote(host, 'edda'))
  const archive = (requestId: string) =>
    tabA.runPromise(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        return yield* client.mutate({
          requestId,
          mutation: 'CmsArchive',
          input: { entry: 'entry-page-home' },
        })
      }),
    )
  await archive('r2')
  await expect.poll(() => edited()).toBe(true)
  // Tab B asks afresh while A's conversation is open.
  await firstCall(hostedRemote(host, 'wren', { fresh: true }))
  await expect.poll(() => edited()).toBe(false)
  const reset = await keptBytes()
  // A's next change lands in the database the reset made, so it is what is kept.
  await archive('r3')
  await keptAfter(reset)
  expect(await edited()).toBe(true)
  await tabA.dispose()
})

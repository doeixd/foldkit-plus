/**
 * The transports the browser uses, over real HTTP and a real WebSocket to the
 * server seeded with all 100,000 products: the first page is read, an edit
 * sent over the socket is committed by the journal and read back through
 * Remote, and a request naming no operation the server has is refused.
 */
import { Effect, Fiber, Option } from 'effect'
import { Remote } from 'foldkit-remote'
import { ReplicaId, Sync, type Storage } from 'foldkit-sync'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { Data, Message, Products, initial } from '../src/app.js'
import { ProductId } from '../src/domain.js'
import { startHttpServer } from '../src/http.js'
import { productId, seedOf } from '../src/server.js'
import { RegistrySync } from '../src/sync.js'

let server: Awaited<ReturnType<typeof startHttpServer>>
beforeAll(async () => {
  server = await startHttpServer(0)
}, 60_000)
afterAll(() => server.close())

/** The first page, read over HTTP afresh. */
const read = () =>
  Effect.runPromise(
    Data.prefetch(initial(), Option.getOrThrow(Products.active.projectionOf(initial()))).pipe(
      Effect.provide(Remote.clientLayer(Remote.http(server.url))),
    ),
  )

const memoryStorage = (): Storage => {
  let stored: unknown
  return {
    load: () => Effect.sync(() => stored),
    save: next => Effect.sync(() => (stored = structuredClone(next))),
    close: Effect.void,
  }
}

test('reads the first page over HTTP', async () => {
  const page = Products.page(await read())
  expect(page._tag === 'Ready' && page.value.items.length).toBe(100)
  expect(page._tag === 'Ready' && page.value.hasNext).toBe(true)
})

test('an edit sent over the socket is committed and read back through Remote', async () => {
  const replica = await Effect.runPromise(
    RegistrySync.openReplica(ReplicaId.make('http-test'), memoryStorage()),
  )
  await Effect.runPromise(
    replica.submit(
      Message.EditedProducts({
        changes: [
          { id: ProductId.make(productId(7)), member: 'description', value: 'Over the socket' },
        ],
      }),
    ),
  )
  await Effect.runPromise(
    replica.synchronize.pipe(Effect.provide(Sync.transport.socket({ url: server.syncUrl }))),
  )
  expect(Effect.runSync(replica.status).pending).toBe(0)

  const page = Products.page(await read())
  expect(
    page._tag === 'Ready' && page.value.items.find(row => row.id === productId(7))?.description,
  ).toBe('Over the socket')
  expect(seedOf(7).description).not.toBe('Over the socket')
  await Effect.runPromise(replica.close)
})

test('a commit wakes another replica’s exchange loop, which brings it the edit', async () => {
  const watching = await Effect.runPromise(
    RegistrySync.openReplica(ReplicaId.make('watching'), memoryStorage()),
  )
  // The loop exchanges once, then waits: for its own submit, or the server's notice.
  const loop = Effect.runFork(
    watching.start.pipe(Effect.provide(Sync.transport.socket({ url: server.syncUrl }))),
  )
  const writing = await Effect.runPromise(
    RegistrySync.openReplica(ReplicaId.make('writing'), memoryStorage()),
  )
  await new Promise(resolve => setTimeout(resolve, 200))
  await Effect.runPromise(
    writing.submit(
      Message.EditedProducts({
        changes: [{ id: ProductId.make(productId(9)), member: 'cents', value: 42 }],
      }),
    ),
  )
  await Effect.runPromise(
    writing.synchronize.pipe(Effect.provide(Sync.transport.socket({ url: server.syncUrl }))),
  )
  await expect
    .poll(
      () =>
        Effect.runSync(watching.shared).edits.map(edit => [
          edit.id,
          edit.member,
          edit.value,
          // It arrived committed: the journal stamped the sequence it committed at.
          Option.isSome(edit.at),
        ]),
      { timeout: 5_000 },
    )
    .toContainEqual([productId(9), 'cents', 42, true])
  await Effect.runPromise(Fiber.interrupt(loop))
  await Effect.runPromise(watching.close)
  await Effect.runPromise(writing.close)
})

test('a request naming an operation the server does not have is refused', async () => {
  const response = await fetch(server.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'constructor', payload: {} }),
  })
  expect(response.status).toBe(400)
  // Refused by the protocol's schema before any handler, `Object`'s names included.
  expect(await response.json()).toEqual({
    error: expect.stringContaining('"read" | "query" | "mutate"'),
  })
})

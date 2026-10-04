/**
 * The transport the browser uses, over real HTTP to the server seeded with all
 * 100,000 products: the first page is read and an edit is written, and a
 * request naming no operation the server has is refused.
 */
import { Effect, Option } from 'effect'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { Data, Grid, Message, Products, initial, update } from '../src/app.js'
import { startHttpServer } from '../src/http.js'
import { productId, seedOf } from '../src/server.js'
import { httpClient } from '../src/transport.js'

let server: Awaited<ReturnType<typeof startHttpServer>>
beforeAll(async () => {
  server = await startHttpServer(0)
}, 60_000)
afterAll(() => server.close())

const run = <A, E>(effect: Effect.Effect<A, E, RemoteClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Remote.clientLayer(httpClient(server.url)))))

test('reads the first page and writes an edit over HTTP', async () => {
  const listed = await run(
    Data.prefetch(initial(), Option.getOrThrow(Products.active.projectionOf(initial()))),
  )
  const page = Products.page(listed)
  expect(page._tag === 'Ready' && page.value.items.length).toBe(100)
  expect(page._tag === 'Ready' && page.value.hasNext).toBe(true)

  // The grid's own OutMessage, as an edit committed in a cell would send it.
  const edited = update(
    listed,
    Message.GotGridMessage({
      message: Grid.Message.EditStarted({
        address: { row: productId(7), column: 'description' },
        draft: 'Over HTTP',
      }),
    }),
  ).model
  const committed = update(
    edited,
    Message.GotGridMessage({
      message: Grid.Message.EditCommitted({ next: Option.none(), reveal: Option.none() }),
    }),
  )
  const settled = await run(committed.commands![0]!.effect)
  const saved = update(committed.model, settled).model
  const after = Products.page(saved)
  expect(
    after._tag === 'Ready' && after.value.items.find(row => row.id === productId(7))?.description,
  ).toBe('Over HTTP')
  expect(seedOf(7).description).not.toBe('Over HTTP')
})

test('a request naming an operation the server does not have is refused', async () => {
  const response = await fetch(server.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'constructor', payload: {} }),
  })
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'unknown operation' })
})

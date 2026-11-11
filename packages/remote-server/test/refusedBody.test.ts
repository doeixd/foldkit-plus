/**
 * A refused POST is answered only after its body is consumed or cancelled
 * (workerd drops the next request on the connection otherwise): each path
 * that answers before reading, with a body that records what became of it.
 */
import { Effect, Layer, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { serveFetch } from '../src/fetch.js'
import { RemoteServer } from '../src/index.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String }))
const Items = Query.make('Items', { Input: {}, Result: Query.connection(Item) })
const server = RemoteServer.make<string>({
  entities: [
    RemoteServer.entity(Item, {
      read: ({ ids }) => Effect.succeed(ids.map(id => ({ id, values: {} }))),
    }),
  ],
  queries: [
    RemoteServer.query(Items, () =>
      Effect.succeed({
        edges: [],
        start: { _tag: 'Terminal' as const },
        end: { _tag: 'Terminal' as const },
      }),
    ),
  ],
  mutations: [],
})

const limit = 1024
const served = serveFetch({
  server,
  maxBodyBytes: limit,
  resolvePrincipal: request =>
    request.headers.has('x-csrf')
      ? Effect.succeed('member')
      : Effect.fail(RemoteServer.unauthenticated('No CSRF header.')),
  layer: () => Layer.empty,
})
const breaking = serveFetch({
  server,
  maxBodyBytes: limit,
  resolvePrincipal: () => Effect.succeed('member'),
  layer: () => Layer.effectDiscard(Effect.die('the layer broke')),
})

/** A body of `chunks` chunks of `size` bytes that says whether it was read to its end or cancelled. */
const recorded = (chunks: number, size: number) => {
  const state = { sent: 0, ended: false, cancelled: false }
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.sent === chunks) {
        state.ended = true
        controller.close()
        return
      }
      state.sent++
      controller.enqueue(new Uint8Array(size))
    },
    cancel() {
      state.cancelled = true
    },
  })
  return { state, body }
}

const post = (url: string, headers: Record<string, string>, body: ReadableStream<Uint8Array>) =>
  new Request(url, { method: 'POST', headers, body, duplex: 'half' } as RequestInit)

const cases: ReadonlyArray<{
  readonly name: string
  readonly handler: typeof served
  readonly url: string
  readonly headers: Record<string, string>
  readonly chunks: number
  readonly size: number
  readonly status: number
  readonly outcome: 'ended' | 'cancelled'
}> = [
  {
    name: 'no CSRF header',
    handler: served,
    url: 'http://w.test/remote',
    headers: {},
    chunks: 4,
    size: 100,
    status: 401,
    outcome: 'ended',
  },
  {
    name: 'another path',
    handler: served,
    url: 'http://w.test/elsewhere',
    headers: { 'x-csrf': '1' },
    chunks: 4,
    size: 100,
    status: 404,
    outcome: 'ended',
  },
  {
    name: 'a body declared too large',
    handler: served,
    url: 'http://w.test/remote',
    headers: { 'x-csrf': '1', 'content-length': '999999' },
    chunks: 50,
    size: 100,
    status: 413,
    outcome: 'cancelled',
  },
  {
    name: 'a refused principal with a body over the limit',
    handler: served,
    url: 'http://w.test/remote',
    headers: {},
    chunks: 50,
    size: 100,
    status: 401,
    outcome: 'cancelled',
  },
  {
    name: 'a body over the limit that declared none',
    handler: served,
    url: 'http://w.test/remote',
    headers: { 'x-csrf': '1' },
    chunks: 50,
    size: 100,
    status: 413,
    outcome: 'cancelled',
  },
  {
    name: 'a body that is not JSON',
    handler: served,
    url: 'http://w.test/remote',
    headers: { 'x-csrf': '1' },
    chunks: 2,
    size: 10,
    status: 400,
    outcome: 'ended',
  },
  {
    name: 'a layer that fails',
    handler: breaking,
    url: 'http://w.test/remote',
    headers: {},
    chunks: 4,
    size: 100,
    status: 500,
    outcome: 'ended',
  },
]

describe('a refused call', () => {
  it.each(cases)('consumes or cancels the body before answering: $name', async test => {
    const { state, body } = recorded(test.chunks, test.size)
    const response = await test.handler(post(test.url, test.headers, body), undefined)
    expect(response.status).toBe(test.status)
    expect(state.ended || state.cancelled).toBe(true)
    expect(test.outcome === 'ended' ? state.ended : state.cancelled).toBe(true)
    // Never reads past the limit.
    expect(state.sent * test.size).toBeLessThanOrEqual(limit + 2 * test.size)
  })
})

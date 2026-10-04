/**
 * Remote's calls as JSON, end to end: `Remote.json` sends a request,
 * `RemoteServer.answer` decodes it by the protocol's own schemas and runs the
 * handler. A body that is not a request, or names an operation Remote does not
 * have, is a 400 that reaches no handler; a handler's failure a 500 with its
 * message; a defect a 500 that says nothing of it.
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import {
  REMOTE_PROTOCOL_VERSION,
  Remote,
  RemoteClient,
  RemoteReadError,
  type RemoteRpcClient,
} from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { RemoteServer } from '../src/index.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const domain = Remote.make({ model: App.model.remote, entities: [Item] })
const { server } = RemoteServer.memory({ domain, rows: { Item: [{ id: 'a', name: 'Anchor' }] } })
const handlers = RemoteServer.handlers(server, undefined)

const answer = (body: unknown) => Effect.runPromise(RemoteServer.answer(handlers, body))
const readA = {
  version: REMOTE_PROTOCOL_VERSION,
  requests: [{ entity: 'Item', id: 'a', fields: ['name'] }],
}

describe('RemoteServer.answer', () => {
  it('answers a request through its handler', async () => {
    expect(await answer({ operation: 'read', payload: readA })).toEqual({
      status: 200,
      body: {
        result: {
          entities: [{ entity: 'Item', id: 'a', values: { name: 'Anchor' } }],
          settled: [],
        },
      },
    })
  })

  it.each([
    ['an operation Remote does not have', { operation: 'drop', payload: readA }],
    ['an operation named by Object', { operation: 'constructor', payload: readA }],
    ['a payload its schema refuses', { operation: 'read', payload: { requests: 'all' } }],
    ['a body that is not a request', 'read'],
  ])('refuses %s with a 400, reaching no handler', async (_, body) => {
    let reached = false
    const watched: RemoteRpcClient = {
      ...handlers,
      FoldkitRemoteRead: payload => {
        reached = true
        return handlers.FoldkitRemoteRead(payload)
      },
    }
    const answered = await Effect.runPromise(RemoteServer.answer(watched, body))
    expect(answered.status).toBe(400)
    expect(answered.body).toHaveProperty('error')
    expect(reached).toBe(false)
  })

  it('answers a handler’s failure with a 500 and its message', async () => {
    const failing: RemoteRpcClient = {
      ...handlers,
      FoldkitRemoteRead: () => Effect.fail(new RemoteReadError({ message: 'no items today' })),
    }
    expect(
      await Effect.runPromise(RemoteServer.answer(failing, { operation: 'read', payload: readA })),
    ).toEqual({
      status: 500,
      body: { error: 'no items today' },
    })
  })

  it('answers a defect with a 500 that says nothing of it', async () => {
    const broken: RemoteRpcClient = {
      ...handlers,
      FoldkitRemoteRead: () => Effect.die(new Error('the password is hunter2')),
    }
    expect(
      await Effect.runPromise(RemoteServer.answer(broken, { operation: 'read', payload: readA })),
    ).toEqual({
      status: 500,
      body: { error: 'Internal error' },
    })
  })
})

describe('Remote.json', () => {
  // The client over a server answering in process: what a worker or a page server is.
  const client = Remote.json(request =>
    Effect.runPromise(RemoteServer.answer(handlers, JSON.parse(request))).then(
      answered => answered.body,
    ),
  )
  const run = <A, E>(effect: Effect.Effect<A, E, RemoteClient>) =>
    Effect.runPromise(effect.pipe(Effect.provide(Remote.clientLayer(client))))

  it('reads through the server, and fails with the server’s message', async () => {
    const read = await run(
      Effect.gen(function* () {
        const remote = yield* RemoteClient
        return yield* remote.read(readA)
      }),
    )
    expect(read.entities).toEqual([{ entity: 'Item', id: 'a', values: { name: 'Anchor' } }])
    const refused = Remote.json(() => Promise.resolve({ error: 'not today' }))
    const failed = await Effect.runPromise(Effect.flip(refused.FoldkitRemoteRead(readA)))
    expect(failed.message).toBe('not today')
  })

  it('fails when the answer is not an answer, or nothing came back', async () => {
    const garbled = Remote.json(() => Promise.resolve({ maybe: 1 }))
    expect(
      (await Effect.runPromise(Effect.flip(garbled.FoldkitRemoteRead(readA)))).message,
    ).toMatch(/not an answer/)
    const lost = Remote.json(() => Promise.reject(new Error('offline')))
    expect((await Effect.runPromise(Effect.flip(lost.FoldkitRemoteRead(readA)))).message).toBe(
      'offline',
    )
  })
})

describe('Remote.http', () => {
  it('posts each call to the server, with its headers read per call', async () => {
    const seen: Array<string | undefined> = []
    const node = createServer((request, response) => {
      seen.push(request.headers['x-session'] as string | undefined)
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(chunk as Buffer))
      request.on('end', () => {
        void Effect.runPromise(
          RemoteServer.answer(handlers, JSON.parse(Buffer.concat(chunks).toString('utf8'))),
        ).then(answered => {
          response.writeHead(answered.status, { 'content-type': 'application/json' })
          response.end(JSON.stringify(answered.body))
        })
      })
    })
    await new Promise<void>(resolve => node.listen(0, '127.0.0.1', resolve))
    const { port } = node.address() as AddressInfo
    let session = 'first'
    const client = Remote.http(`http://127.0.0.1:${port}/remote`, {
      headers: () => ({ 'x-session': session }),
    })
    try {
      const read = await Effect.runPromise(client.FoldkitRemoteRead(readA))
      expect(read.entities).toEqual([{ entity: 'Item', id: 'a', values: { name: 'Anchor' } }])
      session = 'second'
      await Effect.runPromise(client.FoldkitRemoteRead(readA))
      expect(seen).toEqual(['first', 'second'])
    } finally {
      await new Promise<void>(resolve => node.close(() => resolve()))
    }
  })

  it('fails with the status when the body is not JSON', async () => {
    const node = createServer((_, response) => {
      response.writeHead(502, { 'content-type': 'text/html' })
      response.end('<h1>Bad gateway</h1>')
    })
    await new Promise<void>(resolve => node.listen(0, '127.0.0.1', resolve))
    const { port } = node.address() as AddressInfo
    try {
      const failed = await Effect.runPromise(
        Effect.flip(Remote.http(`http://127.0.0.1:${port}/remote`).FoldkitRemoteRead(readA)),
      )
      expect(failed.message).toBe('502 Bad Gateway')
    } finally {
      await new Promise<void>(resolve => node.close(() => resolve()))
    }
  })
})

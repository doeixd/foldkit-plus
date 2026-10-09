/**
 * Live over fetch: `serveFetch` answers a live open with a
 * `text/event-stream` of `LiveChange` frames, re-read through each
 * subscriber's own principal, and unsubscribes when the client leaves. A
 * payload no stream speaks is a 400; a version the protocol refuses ends the
 * stream with an `error` frame.
 */
import { Effect, Fiber, Layer, Schema, Stream, type Duration } from 'effect'
import { Entity, Mutation, REMOTE_PROTOCOL_VERSION, Remote, RemoteClient } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { serveFetch } from '../src/fetch.js'
import { RemoteServer } from '../src/index.js'

const Item = Entity.make('Item', Schema.Struct({ id: Schema.String, name: Schema.String }))
const RenameItem = Mutation.make('RenameItem', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})

const rows = new Map<string, Record<string, unknown>>()

const ItemSource = RemoteServer.entity<string>(Item, {
  authorize: (principal, fields) => (principal === 'admin' ? fields : []),
  read: ({ ids, fields }) =>
    Effect.succeed(
      ids.flatMap(id => {
        const row = rows.get(id)
        return row === undefined
          ? []
          : [
              {
                id,
                values: Object.fromEntries(
                  fields.flatMap(field => (Object.hasOwn(row, field) ? [[field, row[field]]] : [])),
                ),
              },
            ]
      }),
    ),
})

const fixture = (heartbeat?: Duration.Input) => {
  rows.clear()
  rows.set('a', { id: 'a', name: 'Anchor' })
  const hub = Effect.runSync(RemoteServer.liveHub([ItemSource]))
  const RenameItemSource = RemoteServer.mutation(RenameItem, ({ input }) =>
    Effect.gen(function* () {
      rows.set(input.id, { ...rows.get(input.id), name: input.name })
      yield* hub.changed({ entity: 'Item', id: input.id }, ['name'])
      return { output: { id: input.id } }
    }),
  )
  const server = RemoteServer.make({ entities: [ItemSource], mutations: [RenameItemSource] })
  const fetch = serveFetch({
    server,
    resolvePrincipal: request => (request.headers.get('x-admin') === 'yes' ? 'admin' : 'guest'),
    layer: () => Layer.empty,
    live: hub,
    ...(heartbeat === undefined ? {} : { liveHeartbeat: heartbeat }),
  })
  const call = (body: unknown, admin: boolean) =>
    fetch(
      new Request('http://worker.test/remote', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(admin ? { 'x-admin': 'yes' } : {}),
        },
        body: JSON.stringify(body),
      }),
      undefined,
    )
  const rename = (name: string) =>
    call(
      {
        operation: 'mutate',
        payload: {
          requestId: `live-test:${name}`,
          mutation: 'RenameItem',
          input: { id: 'a', name },
        },
      },
      true,
    )
  const openLive = (admin: boolean, after = 0) =>
    call(
      {
        operation: 'live',
        payload: {
          version: REMOTE_PROTOCOL_VERSION,
          requirements: [{ entity: 'Item', id: 'a', fields: ['name'] }],
          after,
        },
      },
      admin,
    )
  return { hub, rename, openLive, call, serve: fetch }
}

const waitFor = async (done: () => Promise<boolean> | boolean): Promise<void> => {
  const start = Date.now()
  for (;;) {
    if (await done()) return
    if (Date.now() - start > 2000) throw new Error('timed out waiting for the stream')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

/**
 * Every SSE frame of a body, in order, heartbeat comments left out: a `: ping`
 * says the stream lives, never what changed.
 */
async function* framesOf(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const next = await reader.read()
    if (next.done) return
    buffer += decoder.decode(next.value, { stream: true })
    for (;;) {
      const at = buffer.indexOf('\n\n')
      if (at < 0) break
      const frame = buffer.slice(0, at)
      buffer = buffer.slice(at + 2)
      if (frame.startsWith(':')) continue
      yield frame
    }
  }
}

/** Reads the next frame that is not a heartbeat comment. */
const readFrame = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
  for await (const frame of framesOf(reader)) return frame
  throw new Error('the stream ended before a frame arrived')
}

/** Reads the next frame whatever it is, heartbeat comment included. */
const readRawFrame = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const next = await reader.read()
    if (next.done) throw new Error('the stream ended before a frame arrived')
    buffer += decoder.decode(next.value, { stream: true })
    const at = buffer.indexOf('\n\n')
    if (at < 0) continue
    return buffer.slice(0, at)
  }
}

/** Reads every frame until the stream ends, heartbeat comments left out. */
const readAllFrames = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
  const frames: string[] = []
  for await (const frame of framesOf(reader)) frames.push(frame)
  return frames
}

describe('serveFetch live', () => {
  it('streams changed fields as SSE frames and unsubscribes on disconnect', async () => {
    const { hub, rename, openLive } = fixture()
    const response = await openLive(true)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    await waitFor(() => Effect.runPromise(hub.size).then(size => size === 1))
    expect((await rename('Anchor II')).status).toBe(200)
    const reader = response.body!.getReader()
    const frame = await readFrame(reader)
    expect(frame.startsWith('data: ')).toBe(true)
    expect(JSON.parse(frame.slice('data: '.length))).toEqual({
      _tag: 'EntityPatched',
      cursor: 1,
      entity: 'Item',
      id: 'a',
      values: { name: 'Anchor II' },
      changed: ['name'],
    })
    await reader.cancel()
    await waitFor(() => Effect.runPromise(hub.size).then(size => size === 0))
  })

  it('re-reads under each subscriber principal: a guest sees nothing of a withheld field', async () => {
    const { hub, rename, openLive } = fixture()
    const adminResponse = await openLive(true)
    const guestResponse = await openLive(false)
    await waitFor(() => Effect.runPromise(hub.size).then(size => size === 2))
    await rename('Anchor III')
    const adminFrame = await readFrame(adminResponse.body!.getReader())
    expect(JSON.parse(adminFrame.slice('data: '.length)).values).toEqual({ name: 'Anchor III' })
    // The hub already fanned the change out: had the guest been owed a frame,
    // it would be queued by now, so a short wait settles the negative.
    const guestReader = guestResponse.body!.getReader()
    const guestFrame = await Promise.race([
      readFrame(guestReader).then(frame => frame),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 100)),
    ])
    expect(guestFrame).toBeNull()
    await guestReader.cancel()
  })

  it('ends the stream with no frames when no source serves the entity', async () => {
    rows.clear()
    const server = RemoteServer.make({ entities: [ItemSource] })
    const served = serveFetch({
      server,
      resolvePrincipal: () => 'admin',
      layer: () => Layer.empty,
    })
    const response = await served(
      new Request('http://worker.test/remote', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'live',
          payload: {
            version: REMOTE_PROTOCOL_VERSION,
            requirements: [{ entity: 'Item', id: 'a', fields: ['name'] }],
            after: 0,
          },
        }),
      }),
      undefined,
    )
    expect(response.status).toBe(200)
    // A stream that serves nothing ends; only heartbeats, if any, moved.
    expect(await readAllFrames(response.body!.getReader())).toEqual([])
  })

  it('refuses a live payload no stream speaks with a 400', async () => {
    const { call } = fixture()
    const response = await call({ operation: 'live', payload: { bogus: true } }, true)
    expect(response.status).toBe(400)
    expect(await response.json()).toHaveProperty('error')
  })

  it('ends a version the protocol refuses with an error frame', async () => {
    const { call } = fixture()
    const response = await call(
      { operation: 'live', payload: { version: -1, requirements: [], after: 0 } },
      true,
    )
    expect(response.status).toBe(200)
    const frames = await readAllFrames(response.body!.getReader())
    // The heartbeat that opens the stream comes first; the error ends it.
    expect(frames).toHaveLength(1)
    expect(frames[0]!.startsWith('event: error\ndata: ')).toBe(true)
    expect(JSON.parse(frames[0]!.slice('event: error\ndata: '.length).trim()).message).toMatch(
      /protocol version/,
    )
  })

  it('is read end to end by Remote.httpWithLive through Remote.clientLayer', async () => {
    const { hub, rename, serve } = fixture()
    const viaServe = (input: string | URL | Request, init?: RequestInit) =>
      serve(new Request(input, init), undefined)
    const client = Remote.httpWithLive('http://worker.test/remote', {
      fetch: viaServe,
      headers: () => ({ 'x-admin': 'yes' }),
    })
    const run = <A, E>(effect: Effect.Effect<A, E, RemoteClient>) =>
      Effect.runPromise(effect.pipe(Effect.provide(Remote.clientLayer(client))))
    const read = await run(
      Effect.gen(function* () {
        const remote = yield* RemoteClient
        return yield* remote.read({
          version: REMOTE_PROTOCOL_VERSION,
          requests: [{ entity: 'Item', id: 'a', fields: ['name'] }],
        })
      }),
    )
    expect(read.entities).toEqual([{ entity: 'Item', id: 'a', values: { name: 'Anchor' } }])
    const fiber = Effect.runFork(
      RemoteClient.pipe(
        Effect.flatMap(remote =>
          remote
            .live({ requirements: [{ entity: 'Item', id: 'a', fields: ['name'] }], after: 0 })
            .pipe(Stream.take(1), Stream.runCollect),
        ),
        Effect.provide(Remote.clientLayer(client)),
      ),
    )
    await waitFor(() => Effect.runPromise(hub.size).then(size => size === 1))
    expect((await rename('Anchor IV')).status).toBe(200)
    expect([...(await Effect.runPromise(Fiber.join(fiber)))]).toEqual([
      {
        _tag: 'EntityPatched',
        ref: { entity: 'Item', id: 'a' },
        values: { name: 'Anchor IV' },
        changed: ['name'],
        cursor: 1,
      },
    ])
  })

  it('pings an idle stream so proxies and workers keep it', async () => {
    const { hub, openLive } = fixture('50 millis')
    const response = await openLive(true)
    expect(response.status).toBe(200)
    const reader = response.body!.getReader()
    // Nothing changes: every frame is a heartbeat, which is the point.
    expect(await readRawFrame(reader)).toBe(': ping')
    expect(await readRawFrame(reader)).toBe(': ping')
    await reader.cancel()
    await waitFor(() => Effect.runPromise(hub.size).then(size => size === 0))
  })

  it('ends with the events, so a heartbeat outlives nothing it serves', async () => {
    rows.clear()
    const server = RemoteServer.make({ entities: [ItemSource] })
    const served = serveFetch({
      server,
      resolvePrincipal: () => 'admin',
      layer: () => Layer.empty,
      // A heartbeat far shorter than the wait: a stream that cannot end
      // keeps pinging through this whole second.
      liveHeartbeat: '50 millis',
    })
    const response = await served(
      new Request('http://worker.test/remote', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'live',
          payload: {
            version: REMOTE_PROTOCOL_VERSION,
            requirements: [{ entity: 'Item', id: 'a', fields: ['name'] }],
            after: 0,
          },
        }),
      }),
      undefined,
    )
    expect(response.status).toBe(200)
    const reader = response.body!.getReader()
    const frames = await Promise.race([
      readAllFrames(reader),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 1000)),
    ])
    // `null` is the deadline: the stream never ended, so the heartbeat went on.
    expect(frames).toEqual([])
  })
})

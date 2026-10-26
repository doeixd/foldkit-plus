/// <reference types="@vitest/browser-playwright" />
/**
 * The browser upload client against a real `XMLHttpRequest`, with the route's
 * answers given by the browser itself (CDP `Fetch`), so what is sent and what
 * comes back are what a page meets.
 */
import { Effect, Exit, Fiber, Stream } from 'effect'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cdp } from 'vitest/browser'
import { upload, UploadFailed, type UploadEvent } from '../src/browser/index.js'

interface Paused {
  readonly requestId: string
  readonly request: {
    readonly url: string
    readonly method: string
    readonly headers: Record<string, string>
  }
}

const hash = 'a'.repeat(64)
const facts = { key: hash, width: 4, height: 2, alpha: false, hash, placeholder: null }

let paused: Array<Paused> = []
const hold = (event: Paused) => {
  paused.push(event)
}
const next = async (): Promise<Paused> => {
  await vi.waitFor(() => expect(paused.length).toBeGreaterThan(0))
  return paused.shift()!
}
const answer = (requestId: string, status: number, body: string) =>
  cdp().send('Fetch.fulfillRequest', {
    requestId,
    responseCode: status,
    responseHeaders: [{ name: 'content-type', value: 'application/json' }],
    body: btoa(body),
  })

beforeEach(async () => {
  paused = []
  cdp().on('Fetch.requestPaused', hold)
  await cdp().send('Fetch.enable', {
    patterns: [{ urlPattern: '*/_media/upload*', requestStage: 'Request' }],
  })
})
afterEach(async () => {
  cdp().off('Fetch.requestPaused', hold)
  await cdp().send('Fetch.disable')
  vi.restoreAllMocks()
})

const image = (size: number) => new Blob([new Uint8Array(size)], { type: 'image/png' })
const run = (file: Blob, options?: Parameters<typeof upload>[1]) =>
  Effect.runPromiseExit(Stream.runCollect(upload(file, options)))

test('sends the bytes typed by the file, with its headers, and ends with the facts', async () => {
  const file = image(256 * 1024)
  const done = run(file, { url: '/_media/upload?to=a', headers: { authorization: 'Bearer t' } })
  const { requestId, request } = await next()
  expect([request.method, new URL(request.url).search]).toEqual(['POST', '?to=a'])
  const header = (name: string) =>
    Object.entries(request.headers).find(([key]) => key.toLowerCase() === name)?.[1]
  expect([header('content-type'), header('authorization')]).toEqual(['image/png', 'Bearer t'])
  await answer(requestId, 201, JSON.stringify(facts))
  const exit = await done
  if (!Exit.isSuccess(exit)) throw new Error(`the upload failed: ${exit.cause}`)
  const events = exit.value
  const last = events.at(-1)
  expect(last?._tag === 'Uploaded' && [last.asset.key, last.asset.width]).toEqual([hash, 4])
})

// Chromium reports no upload progress for a request CDP holds, so this one goes
// to the dev server, which has no such route.
test('reports progress as the bytes go, before an answer it does not know', async () => {
  const file = image(2 * 1024 * 1024)
  const seen: Array<UploadEvent> = []
  const exit = await Effect.runPromiseExit(
    Stream.runForEach(upload(file, { url: '/_no_route' }), event =>
      Effect.sync(() => seen.push(event)),
    ),
  )
  expect(seen.at(-1)).toEqual({ _tag: 'Progressed', loaded: file.size, total: file.size })
  expect(exit).toEqual(Exit.fail(new UploadFailed({ reason: 'Unexpected', status: 404 })))
})

test.each([
  [403, '{"error":"UploadForbidden"}', 'Forbidden'],
  [401, '{"error":"UploadUnauthenticated"}', 'Unauthenticated'],
  [413, '{"error":"UploadTooLarge"}', 'TooLarge'],
  [415, '{"error":"UploadUnsupported"}', 'Unsupported'],
  [400, '{"error":"UploadMalformed"}', 'Malformed'],
  [500, 'oops', 'Unexpected'],
  // The route answers facts with a 201 alone; anything else is not the route.
  [200, JSON.stringify(facts), 'Unexpected'],
  [201, '{"key":"x"}', 'Unexpected'],
  [201, 'not json', 'Unexpected'],
] as const)('a %i answering %s fails as %s', async (status, body, reason) => {
  const done = run(image(16))
  await answer((await next()).requestId, status, body)
  expect(await done).toEqual(Exit.fail(new UploadFailed({ reason, status })))
})

test('no answer at all fails as Network, status 0', async () => {
  const done = run(image(16))
  await cdp().send('Fetch.failRequest', {
    requestId: (await next()).requestId,
    errorReason: 'ConnectionRefused',
  })
  expect(await done).toEqual(Exit.fail(new UploadFailed({ reason: 'Network', status: 0 })))
})

test('interrupting the stream aborts the request still in flight', async () => {
  const states: Array<number> = []
  const abort = XMLHttpRequest.prototype.abort
  vi.spyOn(XMLHttpRequest.prototype, 'abort').mockImplementation(function (this: XMLHttpRequest) {
    states.push(this.readyState)
    abort.call(this)
  })
  const fiber = Effect.runFork(Stream.runCollect(upload(image(16))))
  const { requestId } = await next()
  await Effect.runPromise(Fiber.interrupt(fiber))
  // Opened and sent, not done: the abort reached a request still waiting.
  expect(states).toEqual([XMLHttpRequest.OPENED])
  await cdp()
    .send('Fetch.continueRequest', { requestId })
    .catch(() => {})
})

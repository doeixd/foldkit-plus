/**
 * Remote live over fetch with SSE framing: the other end of
 * `foldkit-remote-server/fetch`'s live open. One `POST` carries the live
 * requirement; the answer is a `text/event-stream` of `LiveChange` frames,
 * one `data:` frame per change, closing when the server has nothing more or
 * failing on a terminal `event: error` frame. Abandoning the stream aborts
 * the request, which interrupts the subscription server-side.
 *
 * `httpWithLive` is this live stream beside `http`'s reads, queries, and
 * mutations, for `Remote.clientLayer`.
 */
import { Effect, Predicate, Schema, Stream } from 'effect'
import type { RemoteRpcClient } from './client.js'
import { http } from './json.js'
import { LiveChange, RemoteLiveError, type LiveRequirement } from './wire.js'

/** What `httpWithLive` needs besides the URL. Mirrors `http`, plus the fetch itself. */
export interface LiveFetchOptions {
  /** Read per request, so a token that changes reaches the next call. */
  readonly headers?: (() => Readonly<Record<string, string>>) | undefined
  /** Defaults to the global one; pass it to route calls elsewhere in tests. */
  readonly fetch?: typeof fetch | undefined
}

const decodeChange = Schema.decodeUnknownSync(LiveChange)

/**
 * One SSE frame: its event (default `message`) and its data lines. Comment
 * and other lines decide nothing and are left out rather than kept.
 */
interface Frame {
  readonly event: string
  readonly data: ReadonlyArray<string>
}

const parseFrame = (text: string): Frame => {
  let event = 'message'
  const data: string[] = []
  for (const line of text.split(/\r\n|\n/)) {
    if (line.startsWith(':') || line === '') continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const field = line.slice(0, colon)
    const value = line.slice(colon + 1).startsWith(' ')
      ? line.slice(colon + 2)
      : line.slice(colon + 1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  return { event, data }
}

/** The frames of a body, split liberally: a blank line ends a frame. */
async function* frames(body: ReadableStream<Uint8Array>): AsyncGenerator<Frame> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      buffer += decoder.decode(next.value, { stream: true })
      for (;;) {
        const found = /(?:\r\n|\n){2}/.exec(buffer)
        if (found === null) break
        yield parseFrame(buffer.slice(0, found.index))
        buffer = buffer.slice(found.index + found[0].length)
      }
    }
    buffer += decoder.decode()
    if (buffer.trim() !== '') yield parseFrame(buffer)
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** The wire changes of a live body: data frames decoded, error frames failed. */
async function* changes(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Schema.Schema.Type<typeof LiveChange>> {
  for await (const frame of frames(body)) {
    if (frame.data.length === 0) continue
    const text = frame.data.join('\n')
    if (frame.event === 'error') {
      const message = (JSON.parse(text) as { readonly message?: unknown }).message
      throw new RemoteLiveError({ message: typeof message === 'string' ? message : text })
    }
    yield decodeChange(JSON.parse(text))
  }
}

const liveError = (error: unknown): RemoteLiveError =>
  error instanceof RemoteLiveError
    ? error
    : new RemoteLiveError({ message: error instanceof Error ? error.message : String(error) })

/** Remote's live stream over fetch: `serveFetch`'s live open as a `Stream`. */
export const liveFetch =
  (url: string, options: LiveFetchOptions = {}): RemoteRpcClient['FoldkitRemoteLive'] =>
  (payload: Schema.Schema.Type<typeof LiveRequirement>) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const via = options.fetch ?? fetch
        const controller = yield* Effect.acquireRelease(
          Effect.sync(() => new AbortController()),
          open => Effect.sync(() => open.abort()),
        )
        const response = yield* Effect.tryPromise({
          try: () =>
            via(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json', ...options.headers?.() },
              body: JSON.stringify({ operation: 'live', payload }),
              signal: controller.signal,
            }),
          catch: liveError,
        })
        if (!response.ok) {
          // A body that is not an answer still answers: null stands in for it.
          const answered = yield* Effect.tryPromise({
            try: () => response.json().catch(() => null) as Promise<unknown>,
            catch: liveError,
          })
          const message =
            Predicate.isObject(answered) && 'error' in answered
              ? String(answered.error)
              : `HTTP ${response.status} ${response.statusText}`
          return yield* new RemoteLiveError({ message })
        }
        if (response.body === null) {
          return yield* new RemoteLiveError({ message: 'The server answered live with no body' })
        }
        return Stream.fromAsyncIterable(changes(response.body), liveError)
      }),
    )

/**
 * Remote's client over HTTP with live: reads, queries, and mutations as
 * `http` sends them, live as `liveFetch` streams it, for `clientLayer`.
 */
export const httpWithLive = (url: string, options: LiveFetchOptions = {}): RemoteRpcClient => ({
  ...http(url, options),
  FoldkitRemoteLive: liveFetch(url, options),
})

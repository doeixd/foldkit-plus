/**
 * The same handler on Node's `http` server, for development and tests. A
 * Worker is handed a `Request` the platform built; Node hands over a raw
 * request target, which may be an absolute URL or a `//host/…` naming another
 * origin, so this adapter resolves it against the configured origin
 * (Foldkit's `resolveRequestUrl`) and refuses one that leaves it before any
 * handler sees the request.
 */
import { resolveRequestUrl } from 'foldkit/experimental/server'
import { isSet, unset, type Handler, type Variable } from './routes.js'

/** What the adapter reads of Node's `IncomingMessage`. */
export interface NodeRequest extends AsyncIterable<Uint8Array | string> {
  readonly method?: string | undefined
  readonly url?: string | undefined
  readonly headers: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>
}

/** What the adapter writes of Node's `ServerResponse`. */
export interface NodeResponse {
  writeHead(status: number, headers: Record<string, string | Array<string>>): unknown
  write(chunk: Uint8Array): unknown
  end(): unknown
  on(event: 'close', listener: () => void): unknown
}

export interface NodeConfig<Env, K extends Variable<Env>> {
  /** The bindings every request is handed, given once. */
  readonly env: Env
  /** The variable in `env` naming the origin served; unset, every request is `500` naming it. */
  readonly origin: K
  /** The largest request body read, in bytes; a larger one is answered `413` unread by the handler. Default 32 MiB. */
  readonly maxBodyBytes?: number
}

const DEFAULT_MAX_BODY_BYTES = 32 * 1024 * 1024

class BodyTooLarge extends Error {}

const bodyOf = async (request: NodeRequest, limit: number): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array> = []
  let read = 0
  for await (const chunk of request) {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
    read += bytes.length
    if (read > limit) throw new BodyTooLarge()
    chunks.push(bytes)
  }
  const body = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0))
  chunks.reduce((offset, chunk) => (body.set(chunk, offset), offset + chunk.length), 0)
  return body
}

const write = async (answer: Response, response: NodeResponse, closed: AbortSignal) => {
  const headers: Record<string, string | Array<string>> = {}
  answer.headers.forEach((value, name) => {
    if (name !== 'set-cookie') headers[name] = value
  })
  const cookies = answer.headers.getSetCookie()
  if (cookies.length > 0) headers['set-cookie'] = cookies
  response.writeHead(answer.status, headers)
  if (answer.body === null) return response.end()
  const reader = answer.body.getReader()
  // A client that leaves ends a stream that would otherwise run on (a live read).
  // The signal may have aborted while the handler was still answering, and a listener added now never hears it.
  const cancel = () => void reader.cancel().catch(() => {})
  if (closed.aborted) cancel()
  else closed.addEventListener('abort', cancel)
  for (;;) {
    const next = await reader.read().catch(() => ({ done: true as const, value: undefined }))
    if (next.done) return response.end()
    response.write(next.value)
  }
}

/**
 * A Node `http` request listener over `handler` (a `Host.routes`, a
 * `serveFetch`), with `env` given once: `createServer(Host.node(handler, {
 * env, origin: 'ORIGIN' }))`. A request whose target names another origin is
 * `400`; the handler is handed a `Request` on the configured one, with a
 * signal that aborts when the client goes.
 */
export const node =
  <Env, K extends Variable<Env>>(handler: Handler<Env>, config: NodeConfig<Env, K>) =>
  (request: NodeRequest, response: NodeResponse): void => {
    const closed = new AbortController()
    response.on('close', () => closed.abort())
    const answered = async (): Promise<Response> => {
      const origin = config.env[config.origin]
      if (!isSet(origin)) return unset(config.origin)
      const url = resolveRequestUrl(request.url ?? '/', origin)
      if (url === undefined)
        return new Response('The request names another origin.', { status: 400 })
      const headers = new Headers()
      for (const [name, value] of Object.entries(request.headers))
        for (const each of [value ?? []].flat()) headers.append(name, each)
      const method = request.method ?? 'GET'
      const hasBody = method !== 'GET' && method !== 'HEAD'
      const body = hasBody
        ? await bodyOf(request, config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES)
        : undefined
      return handler(
        new Request(url, {
          method,
          headers,
          signal: closed.signal,
          ...(body === undefined ? {} : { body }),
        }),
        config.env,
      )
    }
    void answered()
      .catch(error => {
        if (error instanceof BodyTooLarge)
          return new Response('The request body is too large.', { status: 413 })
        console.error(error)
        return new Response('The request could not be answered.', { status: 500 })
      })
      .then(answer => write(answer, response, closed.signal))
      // Only a client gone mid-answer is left to fail here; there is no one to tell.
      .catch(() => {})
  }

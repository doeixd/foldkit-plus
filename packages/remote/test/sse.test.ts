/**
 * Live over fetch: `liveFetch` parses the server's SSE frames into wire
 * changes, fails on `error` frames and broken answers, and aborts the request
 * when the stream is abandoned.
 */
import { Effect, Fiber, Schema, Stream } from 'effect'
import { REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { liveFetch } from '../src/sse.js'
import { LiveRequirement } from '../src/wire.js'

const payload: Schema.Schema.Type<typeof LiveRequirement> = {
  version: REMOTE_PROTOCOL_VERSION,
  requirements: [],
  after: 0,
}

const patched =
  '{"_tag":"EntityPatched","cursor":1,"entity":"Item","id":"a","values":{"name":"Anchor II"},"changed":["name"]}'
const deleted = '{"_tag":"EntityDeleted","cursor":2,"entity":"Item","id":"a"}'

type StubFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const serve =
  (chunks: ReadonlyArray<string>, init?: ResponseInit): StubFetch =>
  async () =>
    new Response(
      new ReadableStream({
        start: controller => {
          for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
          controller.close()
        },
      }),
      init,
    )

const open = (fetch: StubFetch) => liveFetch('http://worker.test/remote', { fetch })(payload)

const collect = (fetch: StubFetch) => Effect.runPromise(Stream.runCollect(open(fetch)))

const failed = (fetch: StubFetch) => Effect.runPromise(Effect.flip(Stream.runCollect(open(fetch))))

describe('liveFetch', () => {
  it('opens with the live requirement as one POST', async () => {
    const seen: Array<{ readonly url: unknown; readonly init: RequestInit | undefined }> = []
    const recording: StubFetch = async (input, init) => {
      seen.push({ url: input, init })
      return new Response('', { headers: { 'content-type': 'text/event-stream' } })
    }
    await collect(recording)
    expect(seen.length).toBe(1)
    expect(seen[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({ operation: 'live', payload })
  })

  it('parses data frames split across chunks and ignores comments', async () => {
    const split = `{"_tag":\n"EntityDeleted","cursor":3,"entity":"Item","id":"b"}`
    const changes = await collect(
      serve([
        `data: ${patched.slice(0, 40)}`,
        `${patched.slice(40)}\n\n: keep-alive\n\n`,
        `data: ${deleted}\n\n`,
        `data: ${split.split('\n')[0]}\ndata: ${split.split('\n')[1]}\n\n`,
      ]),
    )
    expect([...changes]).toEqual([JSON.parse(patched), JSON.parse(deleted), JSON.parse(split)])
  })

  it('fails on an error frame with its message', async () => {
    const error = await failed(serve(['event: error\ndata: {"message":"gone"}\n\n']))
    expect(error._tag).toBe('RemoteLiveError')
    expect(error.message).toBe('gone')
  })

  it('fails when a data frame is not a change', async () => {
    const error = await failed(serve(['data: {"nope":1}\n\n']))
    expect(error._tag).toBe('RemoteLiveError')
  })

  it('fails with the answer error on a non-200', async () => {
    const error = await failed(async () => Response.json({ error: 'denied' }, { status: 401 }))
    expect(error.message).toBe('denied')
  })

  it('fails with the status when the body is not JSON', async () => {
    const error = await failed(
      async () => new Response('<h1>Bad gateway</h1>', { status: 502, statusText: 'Bad Gateway' }),
    )
    expect(error.message).toBe('HTTP 502 Bad Gateway')
  })

  it('aborts the request when the stream is abandoned', async () => {
    let observed: AbortSignal | undefined
    const hanging: StubFetch = async (_input, init) => {
      observed = init?.signal ?? undefined
      return new Response(new ReadableStream({}), {
        headers: { 'content-type': 'text/event-stream' },
      })
    }
    const fiber = Effect.runFork(Stream.runCollect(open(hanging)))
    const begun = Date.now()
    while (observed === undefined) {
      if (Date.now() - begun > 2000) throw new Error('the request never started')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    await Effect.runPromise(Fiber.interrupt(fiber))
    const start = Date.now()
    while (observed?.aborted !== true) {
      if (Date.now() - start > 2000) throw new Error('the request was never aborted')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  })
})

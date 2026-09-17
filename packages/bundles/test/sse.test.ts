// @vitest-environment node
/**
 * SSE: pure transitions, acquire/stream/release through a fake source, one
 * source per assembly, and a failing acquire without an EventSource
 * implementation.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { sse, SseMessage } from '../src/net/index.js'
import { takeMessages } from './support.js'

const fake = {
  readyState: 1,
  closed: false,
  close: () => {
    fake.closed = true
  },
  onopen: null as ((event: any) => void) | null,
  onmessage: null as ((event: any) => void) | null,
  onerror: null as ((event: any) => void) | null,
}
const resetFake = () => {
  fake.closed = false
  fake.onopen = null
  fake.onmessage = null
  fake.onerror = null
}

const Feed = sse({ name: 'Feed', createSource: () => fake })
const Doc = Bundle.declare(Feed, 'feed')
const Model = Schema.Struct({ ...Doc.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Doc.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Doc, { args: { url: 'https://example.com/feed' } })

const fold = (model: Model, message: Parameters<typeof Doc.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, Doc.wrapper.make(message))).model.feed
const fresh: Model = {
  feed: { url: 'https://example.com/feed', status: 'closed', lastError: null },
}

describe('SSE transitions', () => {
  it('connects, opens, receives without storing, and closes', () => {
    expect(placed.init({ feed: fresh.feed }).model.feed).toEqual(fresh.feed)
    const connecting = fold(fresh, SseMessage.Connecting())
    expect(connecting.status).toBe('connecting')
    const open = fold({ feed: connecting }, SseMessage.Opened())
    expect(open).toEqual({ ...fresh.feed, status: 'open', lastError: null })
    expect(fold({ feed: open }, SseMessage.Received({ data: 'hi' }))).toEqual(open)
    // A failure records the error but keeps retrying: the browser reconnects.
    expect(fold({ feed: open }, SseMessage.Failed({ message: 'boom' }))).toEqual({
      ...fresh.feed,
      status: 'connecting',
      lastError: 'boom',
    })
    expect(fold({ feed: open }, SseMessage.Closed())).toEqual({
      ...fresh.feed,
      status: 'closed',
    })
  })
})

describe('SSE acquire and stream', () => {
  it('wires handlers, flows events, and closes on release', async () => {
    resetFake()
    const entry = Feed.resources!({ url: 'https://example.com/feed' }).source!
    const acquired = await Effect.runPromise(
      Effect.scoped(entry.acquire('https://example.com/feed')),
    )
    fake.onopen!({})
    fake.onmessage!({ data: 'hello' })
    const events = await Effect.runPromise(
      takeMessages(Stream.fromQueue(acquired.events), 2, '5 seconds'),
    )
    expect(events).toEqual([SseMessage.Opened(), SseMessage.Received({ data: 'hello' })])
    await Effect.runPromise(entry.release(acquired))
    expect(fake.closed).toBe(true)
  })

  it('fails acquire without an EventSource implementation', async () => {
    const saved = (globalThis as Record<string, unknown>).EventSource
    ;(globalThis as Record<string, unknown>).EventSource = undefined
    try {
      const Plain = sse({ name: 'Plain' })
      const entry = Plain.resources!({ url: 'https://example.com/feed' }).source!
      await expect(
        Effect.runPromise(Effect.scoped(entry.acquire('https://example.com/feed'))),
      ).rejects.toThrow()
    } finally {
      if (saved === undefined) Reflect.deleteProperty(globalThis, 'EventSource')
      else (globalThis as Record<string, unknown>).EventSource = saved
    }
  })
})

describe('SSE assembly', () => {
  it('routes its Messages and refuses a second source in one assembly', () => {
    const assembly = Page.assemble(placed)
    const update = assembly.update(model => ({ model }))
    const opened = update(fresh, Doc.wrapper.make(SseMessage.Opened()))
    expect(opened.model.feed.status).toBe('open')
    expect(Object.keys(assembly.subscriptions())).toEqual(['Feed@feed/incoming'])

    const FeedA = Bundle.declare(Feed, 'feedA')
    const FeedB = Bundle.declare(Feed, 'feedB')
    const TwoModel = Schema.Struct({ ...FeedA.fields, ...FeedB.fields })
    type TwoModel = typeof TwoModel.Type
    const TwoMessage = defineMessageUnion({ ...FeedA.cases, ...FeedB.cases })
    const TwoPage = Bundle.parent({ Model: TwoModel, Message: TwoMessage })
    expect(() =>
      TwoPage.assemble(
        TwoPage.at(FeedA, { args: { url: 'https://a.example.com/feed' } }),
        TwoPage.at(FeedB, { args: { url: 'https://b.example.com/feed' } }),
      ),
    ).toThrow(/both use the Managed Resource "sse"/)
  })
})

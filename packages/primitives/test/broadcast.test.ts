// @vitest-environment node
/**
 * BroadcastChannel: delivery across instances with no self-echo (real
 * channels), close-on-release and post-failure through a fake hub, and the
 * missing-API fallback for both the entry and the Command.
 */
import { Effect, Fiber, Stream } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BroadcastMessage,
  broadcastMessages,
  postBroadcast,
  type BroadcastChannelHandle,
} from '../src/net/index.js'
import { takeMessages } from './support.js'

const hubs = new Map<string, Set<FakeChannel>>()

class FakeChannel implements BroadcastChannelHandle {
  static closed: Array<FakeChannel> = []
  onmessage: ((event: { readonly data: unknown }) => void) | null = null
  failOnPost = false
  constructor(readonly name: string) {
    let hub = hubs.get(name)
    if (hub === undefined) {
      hub = new Set()
      hubs.set(name, hub)
    }
    hub.add(this)
  }
  postMessage(data: unknown): void {
    if (this.failOnPost) throw new Error('closed')
    // Hub skips the sender, like the platform: no self-echo.
    for (const other of hubs.get(this.name) ?? []) {
      if (other !== this) other.onmessage?.({ data })
    }
  }
  close(): void {
    hubs.get(this.name)?.delete(this)
    FakeChannel.closed.push(this)
  }
}

afterEach(() => {
  hubs.clear()
  FakeChannel.closed.length = 0
  vi.unstubAllGlobals()
})

const fakeFactory = (created: Array<FakeChannel>) => (name: string) => {
  const channel = new FakeChannel(name)
  created.push(channel)
  return channel
}

describe('broadcastMessages', () => {
  it('delivers posts from other instances through the fake hub', async () => {
    const created: Array<FakeChannel> = []
    const factory = fakeFactory(created)
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(broadcastMessages('hub-a', factory), 2))
        for (let i = 0; i < 100 && created.length === 0; i++) {
          yield* Effect.yieldNow
        }
        yield* postBroadcast('hub-a', 'hello', factory).effect
        yield* postBroadcast('hub-a', { n: 1 }, factory).effect
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      BroadcastMessage.Received({ data: 'hello' }),
      BroadcastMessage.Received({ data: { n: 1 } }),
    ])
  })

  it('closes the channel when the stream ends', async () => {
    const created: Array<FakeChannel> = []
    const factory = fakeFactory(created)
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(broadcastMessages('hub-b', factory), 1))
        for (let i = 0; i < 100 && created.length === 0; i++) {
          yield* Effect.yieldNow
        }
        yield* postBroadcast('hub-b', 'bye', factory).effect
        return yield* Fiber.join(fiber)
      }),
    )
    // First created is the listener; the posters closed themselves too.
    expect(FakeChannel.closed).toContain(created[0])
    expect(hubs.get('hub-b')?.size ?? 0).toBe(0)
  })

  it('is empty without a BroadcastChannel API, instead of throwing', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(await Effect.runPromise(Stream.runCollect(broadcastMessages('hub-c')))).toEqual([])
  })

  it('delivers across real instances', async () => {
    const name = `real-deliver-${Date.now()}`
    const poster = new BroadcastChannel(name)
    try {
      const values = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(takeMessages(broadcastMessages(name), 1))
          for (let i = 0; i < 50; i++) {
            yield* Effect.yieldNow
          }
          poster.postMessage('ping')
          return yield* Fiber.join(fiber)
        }),
      )
      expect(values).toEqual([BroadcastMessage.Received({ data: 'ping' })])
    } finally {
      poster.close()
    }
  })

  it('a real channel never hears its own post', async () => {
    const name = `real-echo-${Date.now()}`
    const heard: Array<unknown> = []
    const channel = new BroadcastChannel(name)
    try {
      channel.onmessage = event => {
        heard.push(event.data)
      }
      channel.postMessage('self')
      await Effect.runPromise(Effect.sleep('100 millis'))
      expect(heard).toEqual([])
    } finally {
      channel.close()
    }
  })
})

describe('postBroadcast', () => {
  it('posts and closes, yielding Posted', async () => {
    const created: Array<FakeChannel> = []
    expect(
      await Effect.runPromise(postBroadcast('hub-d', 'hi', fakeFactory(created)).effect),
    ).toEqual(BroadcastMessage.Posted())
    expect(created).toHaveLength(1)
    expect(FakeChannel.closed).toEqual(created)
  })

  it('yields BroadcastFailed when the post throws', async () => {
    const factory = (name: string) => {
      const channel = new FakeChannel(name)
      channel.failOnPost = true
      return channel
    }
    expect(await Effect.runPromise(postBroadcast('hub-e', 'hi', factory).effect)).toEqual(
      BroadcastMessage.BroadcastFailed({ message: 'closed' }),
    )
  })

  it('yields BroadcastFailed without a BroadcastChannel API', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(await Effect.runPromise(postBroadcast('hub-f', 'hi').effect)).toEqual(
      BroadcastMessage.BroadcastFailed({ message: 'broadcast is unavailable' }),
    )
  })
})

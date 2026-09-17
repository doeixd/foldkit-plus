/**
 * Cross-tab messaging as an entry plus a Command — not a bundle, because the
 * channel owns no state: the parent maps `Received` into its own Message and
 * stores whatever it keeps. One assembly may open the same name twice (two
 * listeners); share the entry instead. By spec a post never echoes to its
 * own channel, so a tab never hears itself.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import type { Command } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'

export const BroadcastMessage = defineMessageUnion({
  /** Notifies without storing: project the payload into your own field to keep it. */
  Received: { data: Schema.Unknown },
  Posted: {},
  BroadcastFailed: { message: Schema.String },
})
export type BroadcastMessage = typeof BroadcastMessage.Type

/** The slice of a BroadcastChannel this module needs; satisfied by the platform class. */
export interface BroadcastChannelHandle {
  postMessage(data: unknown): void
  close(): void
  onmessage: ((event: { readonly data: unknown }) => void) | null
}

type ChannelFactory = (name: string) => BroadcastChannelHandle

const failMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const createChannel = (
  factory: ChannelFactory | undefined,
  name: string,
): BroadcastChannelHandle | null => {
  if (factory !== undefined) return factory(name)
  if (typeof BroadcastChannel === 'undefined') return null
  return new BroadcastChannel(name) as unknown as BroadcastChannelHandle
}

/**
 * Every post to `name` from another channel, as Messages. Without a
 * BroadcastChannel API the stream is empty instead of throwing; closing the
 * stream closes the channel.
 */
export const broadcastMessages = (
  name: string,
  /** Read lazily so tests can substitute a double, like the SSE bundle. */
  create?: ChannelFactory | undefined,
): Stream.Stream<BroadcastMessage> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const channel = createChannel(create, name)
      if (channel === null) return Stream.empty
      const queue = yield* Queue.unbounded<BroadcastMessage>()
      channel.onmessage = event => {
        Effect.runFork(Queue.offer(queue, BroadcastMessage.Received({ data: event.data })))
      }
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          channel.onmessage = null
          channel.close()
        }),
      )
      return Stream.fromQueue(queue)
    }),
  )

/**
 * Posts one message to `name`. Opens a channel, posts, and closes it: the
 * send is one-shot, so it is a Command, not a resource. Without a
 * BroadcastChannel API — or when the post throws — it yields
 * `BroadcastFailed` instead of throwing.
 */
export const postBroadcast = (
  name: string,
  data: unknown,
  create?: ChannelFactory | undefined,
): Command<BroadcastMessage, never, never> => ({
  name: 'Broadcast.post',
  args: { name, data },
  // One path for every failure: no factory and no platform API, or a post
  // that throws (a closed channel) all become BroadcastFailed.
  effect: Effect.matchEffect(
    Effect.try({
      try: () => {
        const channel = createChannel(create, name)
        if (channel === null) throw new Error('broadcast is unavailable')
        try {
          channel.postMessage(data)
        } finally {
          channel.close()
        }
      },
      catch: failMessage,
    }),
    {
      onFailure: message => Effect.succeed(BroadcastMessage.BroadcastFailed({ message })),
      onSuccess: () => Effect.succeed(BroadcastMessage.Posted()),
    },
  ),
})

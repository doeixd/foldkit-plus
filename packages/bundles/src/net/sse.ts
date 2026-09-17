/**
 * Server-sent events as a bundle: connection lifecycle in the Model, the
 * event stream through one Managed Resource. One-directional, so there is no
 * send: the server speaks, the Model listens. The browser reconnects dropped
 * streams itself; a Failed only records the error.
 */
import { Effect, Option, Queue, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as ManagedResource from 'foldkit/managedResource'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'

/** The slice of an EventSource the bundle needs; satisfied by the platform class. */
export interface SourceHandle {
  readonly readyState: number
  close(): void
  onopen: ((event: any) => void) | null
  onmessage: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
}

export const SseModel = Schema.Struct({
  url: Schema.String,
  status: Schema.Literals(['closed', 'connecting', 'open']),
  lastError: Schema.NullOr(Schema.String),
})
export type SseModel = typeof SseModel.Type

export const SseMessage = defineMessageUnion({
  Connecting: {},
  Opened: {},
  /** Notifies without storing: project the payload into your own field to keep it. */
  Received: { data: Schema.String },
  Closed: {},
  Failed: { message: Schema.String },
})
export type SseMessage = typeof SseMessage.Type

/** The registry value behind the source tag: the live source and its incoming queue. */
export interface AcquiredSource {
  readonly source: SourceHandle
  readonly events: Queue.Queue<SseMessage>
}

/** The live stream, for the incoming subscription. One assembly holds one. */
export const Source = ManagedResource.tag<AcquiredSource>()('sse')

/** The source service a placed SSE stream requires. */
export type SourceService = ManagedResource.ServiceOf<typeof Source>

type SourceResources = Readonly<{
  source: ManagedResource.Entry<
    SseModel,
    SseMessage,
    Option.Option<string>,
    AcquiredSource,
    SourceService,
    () => SseMessage
  >
}>

const failMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const sse = <const Name extends string>(config: {
  readonly name: Name
  /** Defaults to the platform EventSource, read lazily so tests can substitute a double. */
  readonly createSource?: ((url: string) => SourceHandle) | undefined
}) => {
  const createSource: (url: string) => SourceHandle =
    config.createSource ?? (url => new EventSource(url) as unknown as SourceHandle)
  return Bundle.make<
    Name,
    SseModel,
    SseMessage,
    { readonly url: string },
    never,
    SourceService,
    SourceService,
    void,
    SourceResources,
    {}
  >(config.name, {
    Model: SseModel,
    Message: SseMessage,
    args: Schema.Struct({ url: Schema.String }),
    init: (args): Update.Return<SseModel, SseMessage, SourceService> => ({
      model: { url: args.url, status: 'closed', lastError: null },
    }),
    update: (
      model,
      message,
    ): Update.ReturnWithOutMessage<SseModel, SseMessage, never, SourceService> =>
      SseMessage.match(message, {
        Connecting: () => ({ model: { ...model, status: 'connecting' as const } }),
        Opened: () => ({ model: { ...model, status: 'open' as const, lastError: null } }),
        Received: () => ({ model }),
        Closed: () => ({ model: { ...model, status: 'closed' as const } }),
        Failed: ({ message }) => ({
          model: { ...model, status: 'connecting' as const, lastError: message },
        }),
      }),
    resources: () =>
      ManagedResource.make<SseModel, SseMessage>()(entry => ({
        source: entry(Schema.Option(Schema.String), {
          resource: Source,
          modelToMaybeRequirements: model => Option.some(model.url),
          acquire: (url: string) =>
            Effect.gen(function* () {
              const events = yield* Queue.unbounded<SseMessage>()
              const source = createSource(url)
              // Offers run in arrival order; see the WebSocket bundle.
              let tail: Promise<void> = Promise.resolve()
              const enqueue = (effect: Effect.Effect<unknown>): void => {
                const run = () =>
                  Effect.runPromise(effect).then(
                    () => undefined,
                    () => undefined,
                  )
                tail = tail.then(run, run)
              }
              const offer = (message: SseMessage) => enqueue(Queue.offer(events, message))
              source.onopen = () => offer(SseMessage.Opened())
              // Event data is always text per the SSE spec.
              source.onmessage = event => offer(SseMessage.Received({ data: String(event.data) }))
              source.onerror = () =>
                offer(SseMessage.Failed({ message: `event stream error for ${url}` }))
              return { source, events }
            }),
          onAcquired: () => SseMessage.Connecting(),
          onReleased: () => SseMessage.Closed(),
          onAcquireError: error => SseMessage.Failed({ message: failMessage(error) }),
          // Daemon teardown: close the stream and drain the queue.
          release: ({ source, events }) =>
            Effect.asVoid(
              Effect.andThen(
                Effect.sync(() => {
                  source.onopen = null
                  source.onmessage = null
                  source.onerror = null
                  source.close()
                }),
                Queue.shutdown(events),
              ),
            ),
        }),
      })),
    subscriptions: (): Subscription.Subscriptions<SseModel, SseMessage, SourceService> =>
      Subscription.make<SseModel, SseMessage, SourceService>()(entry => ({
        incoming: entry(
          { status: Schema.Literals(['closed', 'connecting', 'open']) },
          {
            modelToDependencies: model => ({ status: model.status }),
            dependenciesToStream: ({ status }) =>
              status === 'closed'
                ? Stream.empty
                : Stream.unwrap(
                    Effect.matchEffect(Source.get, {
                      // Released between the dependency read and attach: end
                      // quietly; onReleased reports Closed through update.
                      onFailure: () => Effect.succeed(Stream.empty),
                      onSuccess: ({ source, events }) =>
                        Effect.succeed(
                          Stream.concat(
                            // A fast server opens before the stream attaches.
                            // 1 is OPEN for EventSource everywhere.
                            source.readyState === 1
                              ? Stream.make(SseMessage.Opened())
                              : Stream.empty,
                            Stream.fromQueue(events),
                          ),
                        ),
                    }),
                  ),
          },
        ),
      })),
  })
}

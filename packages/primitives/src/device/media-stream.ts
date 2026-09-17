/**
 * A camera/mic stream as a bundle factory: one live MediaStream held in a
 * Managed Resource while the Model asks for it. `Started` requests,
 * `Stopped` releases; denial parks at `denied` (actionable UI), any other
 * acquire failure parks at `idle` with the error noted — both clear
 * requirements, so a failing device never spins an acquire loop. Release
 * stops every track. No media-devices API fails the acquire instead of
 * throwing.
 */
import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as ManagedResource from 'foldkit/managedResource'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'

export const MediaStreamModel = Schema.Struct({
  status: Schema.Literals(['idle', 'requesting', 'live', 'denied']),
  lastError: Schema.NullOr(Schema.String),
})
export type MediaStreamModel = typeof MediaStreamModel.Type

export const MediaStreamMessage = defineMessageUnion({
  Started: {},
  Stopped: {},
  Live: {},
  Ended: {},
  Denied: {},
  Failed: { message: Schema.String },
})
export type MediaStreamMessage = typeof MediaStreamMessage.Type

/** A single media track: stopped on release. */
export interface MediaTrackHandle {
  stop(): void
}

/** The live stream: its tracks stop on release. */
export interface MediaStreamHandle {
  getTracks(): ReadonlyArray<MediaTrackHandle>
}

export interface MediaStreamConstraints {
  readonly audio: boolean
  readonly video: boolean
}

/** The live stream, for commands that attach it to an element. One assembly holds one. */
export const LiveStream = ManagedResource.tag<MediaStreamHandle>()('media-stream')

/** The stream service a placed camera requires. */
export type LiveStreamService = ManagedResource.ServiceOf<typeof LiveStream>

type StreamResources = Readonly<{
  stream: ManagedResource.Entry<
    MediaStreamModel,
    MediaStreamMessage,
    Option.Option<MediaStreamConstraints>,
    MediaStreamHandle,
    LiveStreamService,
    () => MediaStreamMessage
  >
}>

const failMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const isDenied = (error: unknown): boolean =>
  typeof (error as { readonly name?: unknown } | null)?.name === 'string' &&
  ['NotAllowedError', 'SecurityError'].includes((error as { readonly name: string }).name)

export const mediaStream = <const Name extends string>(config: {
  readonly name: Name
  /** Read lazily so tests can substitute a double, like the SSE bundle. */
  readonly request?:
    ((constraints: MediaStreamConstraints) => Promise<MediaStreamHandle>) | undefined
}) => {
  const request = (constraints: MediaStreamConstraints): Promise<MediaStreamHandle> => {
    if (config.request !== undefined) return config.request(constraints)
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.mediaDevices?.getUserMedia !== 'function'
    ) {
      return Promise.reject(new Error('media devices are unavailable'))
    }
    return navigator.mediaDevices.getUserMedia(constraints)
  }

  return Bundle.make(config.name, {
    Model: MediaStreamModel,
    Message: MediaStreamMessage,
    args: Schema.Struct({ audio: Schema.Boolean, video: Schema.Boolean }),
    init: () => ({ model: { status: 'idle' as const, lastError: null } }),
    update: (model, message) =>
      MediaStreamMessage.match<
        Update.ReturnWithOutMessage<MediaStreamModel, MediaStreamMessage, never>
      >(message, {
        Started: () => ({ model: { ...model, status: 'requesting' as const } }),
        Stopped: () => ({ model: { ...model, status: 'idle' as const } }),
        Live: () => ({ model: { ...model, status: 'live' as const, lastError: null } }),
        Ended: () => ({ model: { ...model, status: 'idle' as const } }),
        Denied: () => ({ model: { ...model, status: 'denied' as const } }),
        Failed: ({ message }) => ({
          model: { ...model, status: 'idle' as const, lastError: message },
        }),
      }),
    resources: args =>
      ManagedResource.make<MediaStreamModel, MediaStreamMessage>()(entry => ({
        stream: entry(
          Schema.Option(Schema.Struct({ audio: Schema.Boolean, video: Schema.Boolean })),
          {
            resource: LiveStream,
            modelToMaybeRequirements: model =>
              model.status === 'requesting' || model.status === 'live'
                ? Option.some({ audio: args.audio, video: args.video })
                : Option.none(),
            acquire: (constraints: MediaStreamConstraints) =>
              Effect.tryPromise({
                try: () => request(constraints),
                catch: (error: unknown) => error,
              }),
            onAcquired: () => MediaStreamMessage.Live(),
            onReleased: () => MediaStreamMessage.Ended(),
            onAcquireError: error =>
              isDenied(error)
                ? MediaStreamMessage.Denied()
                : MediaStreamMessage.Failed({ message: failMessage(error) }),
            release: stream =>
              Effect.sync(() => {
                for (const track of stream.getTracks()) track.stop()
              }),
          },
        ),
      })),
  })
}

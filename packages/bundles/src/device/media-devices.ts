/**
 * Media devices as a bundle factory: the enumerated device list in the
 * Model, scanned on placement and re-scanned on every `devicechange`.
 * Denial lands as `denied` with an empty list (actionable UI); any other
 * failure keeps the last list and notes the error. No media-devices API
 * yields an empty stream and a `Failed` scan instead of throwing.
 */
import { Effect, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'

export const MediaDevice = Schema.Struct({
  deviceId: Schema.String,
  groupId: Schema.String,
  kind: Schema.Literals(['audioinput', 'audiooutput', 'videoinput']),
  label: Schema.String,
})
export type MediaDevice = typeof MediaDevice.Type

export const MediaDevicesModel = Schema.Struct({
  status: Schema.Literals(['unknown', 'ready', 'denied']),
  devices: Schema.Array(MediaDevice),
  lastError: Schema.NullOr(Schema.String),
})
export type MediaDevicesModel = typeof MediaDevicesModel.Type

export const MediaDevicesMessage = defineMessageUnion({
  Scan: {},
  DevicesChanged: {},
  Refreshed: { devices: Schema.Array(MediaDevice) },
  Denied: {},
  Failed: { message: Schema.String },
})
export type MediaDevicesMessage = typeof MediaDevicesMessage.Type

/** The slice of MediaDevices the bundle needs; satisfied by the platform object. */
export interface MediaDevicesHandle {
  enumerateDevices(): Promise<
    ReadonlyArray<{
      readonly deviceId: string
      readonly groupId: string
      readonly kind: string
      readonly label: string
    }>
  >
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

const failMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const isDenied = (error: unknown): boolean =>
  typeof (error as { readonly name?: unknown } | null)?.name === 'string' &&
  ['NotAllowedError', 'SecurityError'].includes((error as { readonly name: string }).name)

export const mediaDevices = <const Name extends string>(config: {
  readonly name: Name
  /** Read lazily so tests can substitute a double, like the SSE bundle. */
  readonly create?: ((navigator: Navigator) => MediaDevicesHandle | null) | undefined
}) => {
  const handle = (): MediaDevicesHandle | null => {
    if (typeof navigator === 'undefined') return null
    if (config.create !== undefined) return config.create(navigator)
    const devices = navigator.mediaDevices as unknown as MediaDevicesHandle | undefined
    return devices ?? null
  }

  const scanEffect = Effect.matchEffect(
    Effect.tryPromise({
      try: async () => {
        const devices = handle()
        if (devices === null) throw new Error('media devices are unavailable')
        const listed = await devices.enumerateDevices()
        // The platform constrains kind to three values; anything else is a
        // boundary violation, so it fails the scan instead of entering the Model.
        return listed.map(item => {
          if (
            item.kind !== 'audioinput' &&
            item.kind !== 'audiooutput' &&
            item.kind !== 'videoinput'
          ) {
            throw new Error(`unknown device kind: ${item.kind}`)
          }
          // Guarded by the check above: only the three platform kinds reach here.
          return {
            deviceId: item.deviceId,
            groupId: item.groupId,
            kind: item.kind as MediaDevice['kind'],
            label: item.label,
          }
        })
      },
      catch: (error: unknown) => error,
    }),
    {
      onFailure: (error: unknown): Effect.Effect<MediaDevicesMessage, never, never> =>
        Effect.succeed(
          isDenied(error)
            ? MediaDevicesMessage.Denied()
            : MediaDevicesMessage.Failed({ message: failMessage(error) }),
        ),
      onSuccess: (
        devices: ReadonlyArray<MediaDevice>,
      ): Effect.Effect<MediaDevicesMessage, never, never> =>
        Effect.succeed(MediaDevicesMessage.Refreshed({ devices: [...devices] })),
    },
  )

  const scan = () => ({ name: `${config.name}.scan`, effect: scanEffect })

  const changedStream = (): Stream.Stream<MediaDevicesMessage> => {
    const devices = handle()
    if (devices === null) return Stream.empty
    return Stream.fromEventListener(devices as unknown as EventTarget, 'devicechange').pipe(
      Stream.map(() => MediaDevicesMessage.DevicesChanged()),
    )
  }

  return Bundle.make<Name, MediaDevicesModel, MediaDevicesMessage>(config.name, {
    Model: MediaDevicesModel,
    Message: MediaDevicesMessage,
    init: () => ({
      model: { status: 'unknown', devices: [], lastError: null },
      commands: [scan()],
    }),
    update: (model, message) =>
      MediaDevicesMessage.match<
        Update.ReturnWithOutMessage<MediaDevicesModel, MediaDevicesMessage, never>
      >(message, {
        Scan: () => ({ model, commands: [scan()] }),
        DevicesChanged: () => ({ model, commands: [scan()] }),
        Refreshed: ({ devices }) => ({
          model: { ...model, status: 'ready' as const, devices: [...devices] },
        }),
        Denied: () => ({ model: { ...model, status: 'denied' as const, devices: [] } }),
        Failed: ({ message }) => ({ model: { ...model, lastError: message } }),
      }),
    subscriptions: (): Subscription.Subscriptions<MediaDevicesModel, MediaDevicesMessage> =>
      Subscription.make<MediaDevicesModel, MediaDevicesMessage>()(() => ({
        changes: Subscription.persistent(changedStream()),
      })),
  })
}

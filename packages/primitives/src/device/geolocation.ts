/**
 * Geolocation as a bundle: the device position in the Model, watched while
 * placed. Permission denial is its own status (actionable UI); transient
 * failures keep the last fix and note the error. No geolocation API yields
 * an empty stream instead of throwing.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'

export const Coordinates = Schema.Struct({
  latitude: Schema.Number,
  longitude: Schema.Number,
  accuracy: Schema.Number,
})
export type Coordinates = typeof Coordinates.Type

export const GeolocationModel = Schema.Struct({
  status: Schema.Literals(['unknown', 'ready', 'denied']),
  coords: Schema.NullOr(Coordinates),
  lastError: Schema.NullOr(Schema.String),
})
export type GeolocationModel = typeof GeolocationModel.Type

export const GeolocationMessage = defineMessageUnion({
  Located: {
    latitude: Schema.Number,
    longitude: Schema.Number,
    accuracy: Schema.Number,
  },
  Denied: {},
  Failed: { message: Schema.String },
})
export type GeolocationMessage = typeof GeolocationMessage.Type

type PositionCallback = (position: {
  readonly coords: {
    readonly latitude: number
    readonly longitude: number
    readonly accuracy: number
  }
}) => void
type ErrorCallback = (error: { readonly code: number; readonly message: string }) => void

const watchStream = (): Stream.Stream<GeolocationMessage> => {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.geolocation?.watchPosition !== 'function'
  ) {
    return Stream.empty
  }
  const geolocation = navigator.geolocation
  return Stream.unwrap(
    Effect.gen(function* () {
      const queue = yield* Queue.unbounded<GeolocationMessage>()
      const onLocated: PositionCallback = position => {
        Effect.runFork(
          Queue.offer(
            queue,
            GeolocationMessage.Located({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            }),
          ),
        )
      }
      const onError: ErrorCallback = error => {
        Effect.runFork(
          Queue.offer(
            queue,
            error.code === 1
              ? GeolocationMessage.Denied()
              : GeolocationMessage.Failed({ message: error.message }),
          ),
        )
      }
      const watchId = geolocation.watchPosition(onLocated, onError)
      yield* Effect.addFinalizer(() => Effect.sync(() => geolocation.clearWatch(watchId)))
      return Stream.fromQueue(queue)
    }),
  )
}

export const Geolocation = Bundle.make<
  'Geolocation',
  GeolocationModel,
  GeolocationMessage,
  void,
  never,
  never,
  never,
  void,
  {},
  {}
>('Geolocation', {
  Model: GeolocationModel,
  Message: GeolocationMessage,
  init: () => ({ model: { status: 'unknown', coords: null, lastError: null } }),
  update: (model, message) =>
    GeolocationMessage.match<
      Update.ReturnWithOutMessage<GeolocationModel, GeolocationMessage, never>
    >(message, {
      Located: ({ latitude, longitude, accuracy }) => ({
        model: { ...model, status: 'ready' as const, coords: { latitude, longitude, accuracy } },
      }),
      Denied: () => ({ model: { ...model, status: 'denied' as const } }),
      Failed: ({ message }) => ({ model: { ...model, lastError: message } }),
    }),
  subscriptions: (): Subscription.Subscriptions<GeolocationModel, GeolocationMessage> =>
    Subscription.make<GeolocationModel, GeolocationMessage>()(() => ({
      watch: Subscription.persistent(watchStream()),
    })),
})

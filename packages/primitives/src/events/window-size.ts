/**
 * Window size as a bundle: `{ width, height }` in the Model, read from the
 * window at startup and kept current by one `resize` listener. Breakpoints
 * owns its own listener and derives names; place this one when views need
 * the raw pixels. Placing both doubles resize listeners — pick the one the
 * view reads.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'

export const WindowSizeModel = Schema.Struct({ width: Schema.Number, height: Schema.Number })
export type WindowSizeModel = typeof WindowSizeModel.Type

export const WindowSizeMessage = defineMessageUnion({
  Changed: { width: Schema.Number, height: Schema.Number },
})
export type WindowSizeMessage = typeof WindowSizeMessage.Type

const readSize = (): { readonly width: number; readonly height: number } => ({
  width: window.innerWidth,
  height: window.innerHeight,
})

const sizeStream = (): Stream.Stream<WindowSizeMessage> => {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return Stream.empty
  }
  return Stream.unwrap(
    Effect.gen(function* () {
      const queue = yield* Queue.unbounded<WindowSizeMessage>()
      const onResize = () => {
        const size = readSize()
        Effect.runFork(
          Queue.offer(queue, WindowSizeMessage.Changed({ width: size.width, height: size.height })),
        )
      }
      window.addEventListener('resize', onResize)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          window.removeEventListener('resize', onResize)
        }),
      )
      const size = readSize()
      return Stream.concat(
        Stream.make(WindowSizeMessage.Changed({ width: size.width, height: size.height })),
        Stream.fromQueue(queue),
      )
    }),
  )
}

export const WindowSize = Bundle.make('WindowSize', {
  Model: WindowSizeModel,
  Message: WindowSizeMessage,
  init: () => ({ model: { width: 0, height: 0 } }),
  update: (model, message) => ({ model: { width: message.width, height: message.height } }),
  subscriptions: (): Subscription.Subscriptions<WindowSizeModel, WindowSizeMessage> =>
    Subscription.make<WindowSizeModel, WindowSizeMessage>()(() => ({
      changes: Subscription.persistent(sizeStream()),
    })),
})

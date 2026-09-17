/**
 * Page visibility as a bundle: `visible` in the Model, read from the
 * document at startup and kept current by `visibilitychange`. A hidden page
 * is the application's cue to pause polling, animations, and realtime
 * streams; the decision stays in application `update`, not here.
 */
import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'

export const VisibilityModel = Schema.Struct({ visible: Schema.Boolean })
export type VisibilityModel = typeof VisibilityModel.Type

export const VisibilityMessage = defineMessageUnion({ Changed: { visible: Schema.Boolean } })
export type VisibilityMessage = typeof VisibilityMessage.Type

const isVisible = (): boolean =>
  typeof document === 'undefined' || document.visibilityState !== 'hidden'

const visibilityStream = (): Stream.Stream<VisibilityMessage> => {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
    return Stream.empty
  }
  return Stream.concat(
    Stream.make(VisibilityMessage.Changed({ visible: isVisible() })),
    Stream.fromEventListener(document, 'visibilitychange').pipe(
      Stream.map(() => VisibilityMessage.Changed({ visible: isVisible() })),
    ),
  )
}

export const Visibility = Bundle.make('Visibility', {
  Model: VisibilityModel,
  Message: VisibilityMessage,
  // No document (SSR): assume visible; the stream corrects on subscribe.
  init: () => ({ model: { visible: isVisible() } }),
  update: (model, message) => ({ model: { visible: message.visible } }),
  subscriptions: (): Subscription.Subscriptions<VisibilityModel, VisibilityMessage> =>
    Subscription.make<VisibilityModel, VisibilityMessage>()(() => ({
      changes: Subscription.persistent(visibilityStream()),
    })),
})

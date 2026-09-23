/**
 * Input modality as a bundle: whether the user last drove the page by
 * keyboard or by pointer. The browser reports the facts; the Model keeps the
 * answer, so a view can show a focus ring only for keyboard users without
 * reading the DOM, and a replay sees the same answer. CSS `:focus-visible`
 * is the floor; this is for JavaScript that must know.
 */
import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'

export const Modality = Schema.Literals(['keyboard', 'pointer', 'unknown'])
export type Modality = typeof Modality.Type

export const InputModalityModel = Schema.Struct({ modality: Modality })
export type InputModalityModel = typeof InputModalityModel.Type

export const InputModalityMessage = defineMessageUnion({ Changed: { modality: Modality } })
export type InputModalityMessage = typeof InputModalityMessage.Type

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

/** A modifier alone says nothing about how the page is being driven. */
export const modalityOfKey = (key: string): Modality | null =>
  MODIFIERS.has(key) ? null : 'keyboard'

const modalityStream = (): Stream.Stream<InputModalityMessage> => {
  if (typeof window === 'undefined') return Stream.empty
  return Stream.mergeAll(
    [
      Stream.fromEventListener<KeyboardEvent>(window, 'keydown', { capture: true }).pipe(
        Stream.filter(event => modalityOfKey(event.key) !== null),
        Stream.map(() => InputModalityMessage.Changed({ modality: 'keyboard' })),
      ),
      Stream.fromEventListener(window, 'pointerdown', { capture: true }).pipe(
        Stream.map(() => InputModalityMessage.Changed({ modality: 'pointer' })),
      ),
    ],
    { concurrency: 'unbounded' },
  )
}

export const InputModality = Bundle.make('InputModality', {
  Model: InputModalityModel,
  Message: InputModalityMessage,
  init: () => ({ model: { modality: 'unknown' as const } }),
  update: (model, message) =>
    model.modality === message.modality ? { model } : { model: { modality: message.modality } },
  subscriptions: (): Subscription.Subscriptions<InputModalityModel, InputModalityMessage> =>
    Subscription.make<InputModalityModel, InputModalityMessage>()(() => ({
      changes: Subscription.persistent(modalityStream()),
    })),
})

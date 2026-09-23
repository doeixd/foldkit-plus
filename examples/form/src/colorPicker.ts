/**
 * A non-RichText stateful control, as a Bundle (§41–45, track 2). It is small
 * on purpose: a colour picker with a popover, a palette lookup Command, a
 * keyboard Subscription, and a Managed Resource. Everything a Form would have
 * to carry if a key's draft were a child Model rather than a string.
 *
 * It works standalone and under a plain parent. What the spike tests is how far
 * the current Form API can take it.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import * as ManagedResource from 'foldkit/managedResource'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'

export const Model = Schema.Struct({
  open: Schema.Boolean,
  hex: Schema.String,
  /** The palette the Resource is holding, newest first. */
  recent: Schema.Array(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Opened: {},
  Closed: {},
  Chose: { hex: Schema.String },
  /** The palette lookup's result: a Command's fact, not an author's intent. */
  Resolved: { hex: Schema.String },
  Failed: {},
})
export type Message = typeof Message.Type

/** The resource one open picker holds. */
export const Palette = ManagedResource.tag<string>()('color-palette')

export const ColorPicker = Bundle.make({
  name: 'ColorPicker',
  Model,
  Message,
  init: () => ({ model: { open: false, hex: '#000000', recent: [] } }),
  update: (model, message) => {
    switch (message._tag) {
      case 'Opened':
        return { model: { ...model, open: true } }
      case 'Closed':
        return { model: { ...model, open: false } }
      case 'Chose':
        return {
          model: { ...model, open: true, hex: message.hex },
          commands: [
            {
              name: 'palette.lookup',
              effect: Effect.succeed(Message.Resolved({ hex: message.hex })),
            },
          ],
        }
      case 'Resolved':
        return {
          model: { ...model, hex: message.hex, recent: [message.hex, ...model.recent].slice(0, 5) },
        }
      case 'Failed':
        return { model: { ...model, open: false } }
    }
  },
  subscriptions: () =>
    Subscription.make<Model, Message>()(entry => ({
      /** While the popover is open, the picker listens for its own keys. */
      keys: entry(
        { open: Schema.Boolean },
        {
          modelToDependencies: model => ({ open: model.open }),
          dependenciesToStream: ({ open }) => (open ? Stream.make(Message.Closed()) : Stream.empty),
        },
      ),
    })),
  resources: () =>
    ManagedResource.make<Model, Message>()(entry => ({
      palette: entry(Schema.Option(Schema.String), {
        resource: Palette,
        modelToMaybeRequirements: model => (model.open ? Option.some(model.hex) : Option.none()),
        acquire: hex => Effect.succeed(hex),
        release: () => Effect.void,
        onAcquired: hex => Message.Resolved({ hex }),
        onReleased: () => Message.Closed(),
        onAcquireError: () => Message.Failed(),
      }),
    })),
})

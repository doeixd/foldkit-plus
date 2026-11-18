import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { scrollEvents } from 'foldkit-primitives/events'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const Model = Schema.Struct({ listening: Schema.Boolean, x: Schema.Number, y: Schema.Number })
const Message = defineMessageUnion({
  Listened: { on: Schema.Boolean },
  Scrolled: { x: Schema.Number, y: Schema.Number },
})

export default primitiveExample({
  title: 'scrollEvents',
  text: '`scrollEvents` reports the window’s scroll position as it changes. The stream is lifted into a Subscription that runs only while you listen.',
  state: {
    Model,
    Message,
    init: () => ({ model: { listening: false, x: 0, y: 0 } }),
    update: (model, message) =>
      Message.match(message, {
        Listened: ({ on }) => ({ model: { ...model, listening: on } }),
        Scrolled: ({ x, y }) => ({ model: { ...model, x, y } }),
      }),
    subscriptions: Subscription.make<typeof Model.Type, typeof Message.Type>()(entry => ({
      moves: entry(
        { listening: Schema.Boolean },
        {
          modelToDependencies: model => ({ listening: model.listening }),
          dependenciesToStream: ({ listening }) =>
            listening
              ? scrollEvents().pipe(Stream.map(({ x, y }) => Message.Scrolled({ x, y })))
              : Stream.empty,
        },
      ),
    })),
  },
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        h.button(
          slots.liveButton.attrs([
            h.Type('button'),
            h.AriaPressed(String(model.listening)),
            h.OnClick(onMessage(Message.Listened({ on: !model.listening }))),
          ]),
          [model.listening ? 'Stop' : 'Follow the scroll'],
        ),
        ` ${Math.round(model.x)}, ${Math.round(model.y)}`,
      ],
    ),
})

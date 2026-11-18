import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { pointerEvents } from 'foldkit-primitives/events'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const Model = Schema.Struct({ listening: Schema.Boolean, x: Schema.Number, y: Schema.Number })
const Message = defineMessageUnion({
  Listened: { on: Schema.Boolean },
  Moved: { x: Schema.Number, y: Schema.Number },
})

export default primitiveExample({
  title: 'pointerEvents',
  text: '`pointerEvents` reports each move of the pointer. The stream is lifted into a Subscription that runs only while you listen.',
  state: {
    Model,
    Message,
    init: () => ({ model: { listening: false, x: 0, y: 0 } }),
    update: (model, message) =>
      Message.match(message, {
        Listened: ({ on }) => ({ model: { ...model, listening: on } }),
        Moved: ({ x, y }) => ({ model: { ...model, x, y } }),
      }),
    subscriptions: Subscription.make<typeof Model.Type, typeof Message.Type>()(entry => ({
      moves: entry(
        { listening: Schema.Boolean },
        {
          modelToDependencies: model => ({ listening: model.listening }),
          dependenciesToStream: ({ listening }) =>
            listening
              ? pointerEvents().pipe(Stream.map(({ x, y }) => Message.Moved({ x, y })))
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
          [model.listening ? 'Stop' : 'Follow the pointer'],
        ),
        ` ${Math.round(model.x)}, ${Math.round(model.y)}`,
      ],
    ),
})

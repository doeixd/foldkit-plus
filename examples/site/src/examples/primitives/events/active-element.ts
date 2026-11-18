import { Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { activeElementEvents } from 'foldkit-primitives/events'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const Model = Schema.Struct({
  listening: Schema.Boolean,
  focused: Schema.OptionFromNullOr(Schema.String),
})
const Message = defineMessageUnion({
  Listened: { on: Schema.Boolean },
  Focused: { tag: Schema.String },
})

export default primitiveExample({
  title: 'activeElementEvents',
  text: '`activeElementEvents` reports each element focus lands on. Listen, then Tab through this page.',
  state: {
    Model,
    Message,
    init: () => ({ model: { listening: false, focused: Option.none() } }),
    update: (model, message) =>
      Message.match(message, {
        Listened: ({ on }) => ({ model: { ...model, listening: on } }),
        Focused: ({ tag }) => ({ model: { ...model, focused: Option.some(tag) } }),
      }),
    subscriptions: Subscription.make<typeof Model.Type, typeof Message.Type>()(entry => ({
      focus: entry(
        { listening: Schema.Boolean },
        {
          modelToDependencies: model => ({ listening: model.listening }),
          dependenciesToStream: ({ listening }) =>
            listening
              ? activeElementEvents().pipe(Stream.map(({ tag }) => Message.Focused({ tag })))
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
          [model.listening ? 'Stop' : 'Watch focus'],
        ),
        Option.match(model.focused, {
          onNone: () => ' Nothing focused yet.',
          onSome: tag => ` Focus is on a ${tag.toLowerCase()}.`,
        }),
      ],
    ),
})

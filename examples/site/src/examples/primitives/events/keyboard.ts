import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { keyboardEvents, matchHotkey } from 'foldkit-primitives/events'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const Model = Schema.Struct({ listening: Schema.Boolean, saved: Schema.Number })
const Message = defineMessageUnion({ Listened: { on: Schema.Boolean }, Saved: {} })

// The listener exists only while `listening`: the Subscription's dependency is the flag.
export default primitiveExample({
  title: 'keyboardEvents and matchHotkey',
  text: '`keyboardEvents` is a stream of presses, lifted into a Subscription that runs while you listen; `matchHotkey` tests each against a pattern. Listen, then press Control or Command with S.',
  state: {
    Model,
    Message,
    init: () => ({ model: { listening: false, saved: 0 } }),
    update: (model, message) =>
      Message.match(message, {
        Listened: ({ on }) => ({ model: { ...model, listening: on } }),
        Saved: () => ({ model: { ...model, saved: model.saved + 1 } }),
      }),
    subscriptions: Subscription.make<typeof Model.Type, typeof Message.Type>()(entry => ({
      keys: entry(
        { listening: Schema.Boolean },
        {
          modelToDependencies: model => ({ listening: model.listening }),
          dependenciesToStream: ({ listening }) =>
            listening
              ? keyboardEvents({ preventDefault: press => matchHotkey('mod+s', press) }).pipe(
                  Stream.filter(event => event._tag === 'Pressed' && matchHotkey('mod+s', event)),
                  Stream.map(() => Message.Saved()),
                )
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
          [model.listening ? 'Stop listening' : 'Listen to keys'],
        ),
        ` Saved ${model.saved} times.`,
      ],
    ),
})

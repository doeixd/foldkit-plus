import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { BroadcastMessage, broadcastMessages, postBroadcast } from 'foldkit-primitives/net'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const Model = Schema.Struct({ heard: Schema.Array(Schema.String) })
const Message = defineMessageUnion({
  Said: { text: Schema.String },
  Received: { data: Schema.Unknown },
  Posted: {},
  BroadcastFailed: { message: Schema.String },
})

// Open this page in a second tab and press: every other tab on the channel hears it, the poster does not.
export default primitiveExample({
  title: 'broadcastMessages and postBroadcast',
  text: '`postBroadcast` is a Command that posts to a named channel; `broadcastMessages` is an entry that reports what other tabs post. Press here with this page open in a second tab.',
  state: {
    Model,
    Message,
    init: () => ({ model: { heard: [] } }),
    update: (model, message) =>
      Message.match(message, {
        Said: ({ text }) => ({ model, commands: [postBroadcast('primitives-example', text)] }),
        Received: ({ data }) => ({ model: { heard: [...model.heard, String(data)].slice(-3) } }),
        Posted: () => ({ model }),
        BroadcastFailed: () => ({ model }),
      }),
    subscriptions: Subscription.make<typeof Model.Type, typeof Message.Type>()(() => ({
      channel: Subscription.persistentEntry(
        broadcastMessages('primitives-example').pipe(
          Stream.filter(event => event._tag === 'Received'),
          Stream.map(({ data }) => Message.Received({ data })),
        ),
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
            h.OnClick(onMessage(Message.Said({ text: 'hello from another tab' }))),
          ]),
          ['Say hello to other tabs'],
        ),
        model.heard.length === 0 ? ' Heard nothing yet.' : ` Heard: ${model.heard.join('; ')}.`,
      ],
    ),
})

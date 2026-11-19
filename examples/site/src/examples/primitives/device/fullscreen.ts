import { Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { enterFullscreen, exitFullscreen, fullscreenChanges } from 'foldkit-primitives/device'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const Model = Schema.Struct({
  active: Schema.Boolean,
  failure: Schema.OptionFromNullOr(Schema.String),
})
const Message = defineMessageUnion({
  Toggled: {},
  Changed: { active: Schema.Boolean },
  Entered: {},
  Exited: {},
  Failed: { message: Schema.String },
})

export default primitiveExample({
  title: 'enterFullscreen and fullscreenChanges',
  text: '`enterFullscreen` and `exitFullscreen` are Commands; `fullscreenChanges` reports what the document says, including a reader pressing Escape. A browser that refuses answers `Failed`.',
  state: {
    Model,
    Message,
    init: () => ({ model: { active: false, failure: Option.none() } }),
    update: (model, message) =>
      Message.match(message, {
        Toggled: () => ({
          model,
          commands: [model.active ? exitFullscreen() : enterFullscreen(document.documentElement)],
        }),
        Changed: ({ active }) => ({ model: { ...model, active } }),
        Entered: () => ({ model: { ...model, failure: Option.none() } }),
        Exited: () => ({ model }),
        Failed: ({ message }) => ({ model: { ...model, failure: Option.some(message) } }),
      }),
    subscriptions: Subscription.make<typeof Model.Type, typeof Message.Type>()(() => ({
      changes: Subscription.persistentEntry(
        fullscreenChanges().pipe(
          Stream.filter(event => event._tag === 'Changed'),
          Stream.map(({ active }) => Message.Changed({ active })),
        ),
      ),
    })),
  },
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        h.button(
          slots.liveButton.attrs([h.Type('button'), h.OnClick(onMessage(Message.Toggled()))]),
          [model.active ? 'Leave fullscreen' : 'Go fullscreen'],
        ),
        Option.match(model.failure, {
          onNone: () => '',
          onSome: message => ` Not possible here: ${message}.`,
        }),
      ],
    ),
})

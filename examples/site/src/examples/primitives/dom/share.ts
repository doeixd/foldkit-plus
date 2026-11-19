import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { share } from 'foldkit-primitives/dom'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const Message = defineMessageUnion({
  Pressed: {},
  Shared: {},
  Dismissed: {},
  ShareFailed: { message: Schema.String },
})

// Where the platform has no share sheet the Command answers `ShareFailed`, and the view says so.
export default primitiveExample({
  title: 'share',
  text: '`share` opens the platform’s share sheet. Dismissing it is its own Message, not a failure; a browser without one answers `ShareFailed`.',
  state: {
    Model: Schema.Struct({ answer: Schema.OptionFromNullOr(Schema.String) }),
    Message,
    init: () => ({ model: { answer: Option.none() } }),
    update: (model, message) =>
      Message.match(message, {
        Pressed: () => ({
          model,
          commands: [share({ title: 'Foldkit Plus', url: 'https://foldkit-plus.pages.dev/' })],
        }),
        Shared: () => ({ model: { answer: Option.some('Shared.') } }),
        Dismissed: () => ({ model: { answer: Option.some('Dismissed.') } }),
        ShareFailed: ({ message }) => ({
          model: { answer: Option.some(`Cannot share here: ${message}.`) },
        }),
      }),
  },
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        h.button(
          slots.liveButton.attrs([h.Type('button'), h.OnClick(onMessage(Message.Pressed()))]),
          ['Share this site'],
        ),
        Option.getOrElse(model.answer, () => ''),
      ],
    ),
})

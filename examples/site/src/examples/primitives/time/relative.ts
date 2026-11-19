import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { formatRelativeTime } from 'foldkit-primitives/time'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const Message = defineMessageUnion({ Picked: { minutes: Schema.Number } })

// A function, not a bundle: the Model keeps the date, the view formats it.
export default primitiveExample({
  title: 'formatRelativeTime',
  text: '`formatRelativeTime(from, to)` picks the unit and leaves the wording to `Intl.RelativeTimeFormat`. Choose how long ago.',
  state: {
    Model: Schema.Struct({ minutes: Schema.Number }),
    Message,
    init: () => ({ model: { minutes: 90 } }),
    update: (model, message) =>
      Message.match(message, { Picked: ({ minutes }) => ({ model: { ...model, minutes } }) }),
  },
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        ...[5, 90, 3000, 60_000].map(minutes =>
          h.button(
            slots.liveButton.attrs([
              h.Type('button'),
              h.AriaPressed(String(model.minutes === minutes)),
              h.OnClick(onMessage(Message.Picked({ minutes }))),
            ]),
            [`${minutes} min`],
          ),
        ),
        ` It was ${formatRelativeTime(new Date(Date.now() - model.minutes * 60_000), new Date())}.`,
      ],
    ),
})

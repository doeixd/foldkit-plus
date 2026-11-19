import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { Mutation } from 'foldkit-primitives/observers'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const Message = defineMessageUnion({ Added: {}, Observed: { added: Schema.Array(Schema.String) } })

// The button only adds an item to the Model; the count of changes is the observer's.
export default primitiveExample({
  title: 'Mutation',
  text: '`Mutation()` reports changes to the subtree of the element it is on, with the names of the nodes added. Add an item: the observer, not the button, counts it.',
  state: {
    Model: Schema.Struct({ items: Schema.Number, seen: Schema.Number }),
    Message,
    init: () => ({ model: { items: 1, seen: 0 } }),
    update: (model, message) =>
      Message.match(message, {
        Added: () => ({ model: { ...model, items: model.items + 1 } }),
        Observed: ({ added }) => ({ model: { ...model, seen: model.seen + added.length } }),
      }),
  },
  view: ({ model, onMessage, slots, h }) =>
    h.div(
      [],
      [
        h.button(
          slots.liveButton.attrs([h.Type('button'), h.OnClick(onMessage(Message.Added()))]),
          ['Add an item'],
        ),
        h.ul(
          [
            h.OnMount(
              Mount.mapMessage(Mutation(), ({ added }) => onMessage(Message.Observed({ added }))),
            ),
          ],
          Array.from({ length: model.items }, (_, at) => h.li([], [`Item ${at + 1}`])),
        ),
        h.p([], [`The observer has seen ${model.seen} nodes added.`]),
      ],
    ),
})

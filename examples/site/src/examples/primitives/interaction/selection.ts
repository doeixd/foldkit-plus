import { Selection } from 'foldkit-primitives/interaction'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const FRUIT = ['Apple', 'Pear', 'Plum', 'Quince']

// Plain activation toggles in `multiple` mode; `Ranged` (a Shift press) selects from the anchor.
export default primitiveExample({
  title: 'Selection',
  text: '`Selection` keeps the selected ids, an anchor and the last range. `Activated` toggles one in `multiple` mode; `Ranged` extends from the anchor through the order you pass.',
  state: Selection.bundle.with({ mode: 'multiple', allowEmpty: true }),
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        ...FRUIT.map(id =>
          h.button(
            slots.liveButton.attrs([
              h.Type('button'),
              h.AriaPressed(String(model.selected.includes(id))),
              h.OnClick(onMessage(Selection.Message.Activated({ id }))),
            ]),
            [id],
          ),
        ),
        h.button(
          slots.liveButton.attrs([
            h.Type('button'),
            h.OnClick(onMessage(Selection.Message.Ranged({ id: 'Quince', order: FRUIT }))),
          ]),
          ['Anchor to Quince'],
        ),
        ` ${model.selected.join(', ') || 'Nothing selected'}.`,
      ],
    ),
})

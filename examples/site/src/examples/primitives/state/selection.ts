import { SelectionSet, SelectionSetMessage, isSelected } from 'foldkit-primitives/state'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const FRUIT = ['Apple', 'Pear', 'Plum']

// Which ids are chosen is the bundle's; what a choice looks like is the view's.
export default primitiveExample({
  title: 'SelectionSet',
  text: '`SelectionSet` keeps the ids chosen. `Toggle` flips one, `ReplaceAll` and `Clear` change them together.',
  state: SelectionSet,
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        ...FRUIT.map(id =>
          h.button(
            slots.liveButton.attrs([
              h.Type('button'),
              h.AriaPressed(String(isSelected(model, id))),
              h.OnClick(onMessage(SelectionSetMessage.Toggle({ id }))),
            ]),
            [id],
          ),
        ),
        h.button(
          slots.liveButton.attrs([
            h.Type('button'),
            h.OnClick(onMessage(SelectionSetMessage.Clear())),
          ]),
          ['Clear'],
        ),
        ` ${model.selected.length} chosen.`,
      ],
    ),
})

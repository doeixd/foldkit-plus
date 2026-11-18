import { Bundles, CascadeSelect, CascadeSelectSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Places } from '../../snippets/places.js'

const flags = new Map([
  ['ca', '🇨🇦'],
  ['jp', '🇯🇵'],
  ['sg', '🇸🇬'],
])
const notes = new Map([
  ['ca', 'Two regions'],
  ['jp', 'Two regions'],
  ['sg', 'A city-state'],
])

// A row's `RowContent`: an icon before the label, a line under it and a part
// at its end. `label` still names the row and the typeahead's key; whether a
// row can be chosen is the node's `disabled`, which `update` reads too.
export default example({
  title: 'Rows with icons, descriptions and a trailing part',
  slots: CascadeSelectSlots,
  recipe: Recipes.CascadeSelect,
  state: Bundles.CascadeSelect.with({ id: 'city-rows', config: Places }),
  view: ({ style, model, onMessage, h }) =>
    CascadeSelect.view(
      {
        model,
        config: Places,
        onMessage,
        label: 'City',
        option: node => {
          const flag = flags.get(node.id)
          const note = notes.get(node.id)
          return {
            label: node.label,
            ...(flag === undefined ? {} : { icon: h.span([], [flag]) }),
            ...(note === undefined ? {} : { description: note }),
            ...(node.children === undefined
              ? {}
              : { trailing: h.span([], [String(node.children.length)]) }),
          }
        },
        style,
      },
      h,
    ),
})

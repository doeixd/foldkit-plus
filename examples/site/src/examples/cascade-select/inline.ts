import { Bundles, CascadeSelect, CascadeSelectSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Places } from '../../snippets/places.js'

// `inline` is an option of the config, given to the state and the view alike:
// the tree is drawn where it stands, always open, with no trigger, and Tab
// brings focus to it. Nothing closes it, so a choice leaves it as it is.
const Inline = { ...Places, inline: true }

export default example({
  title: 'In place, with no popup',
  slots: CascadeSelectSlots,
  recipe: Recipes.CascadeSelect,
  state: Bundles.CascadeSelect.with({ id: 'city-inline', config: Inline }),
  view: ({ style, model, onMessage, h }) =>
    CascadeSelect.view({ model, config: Inline, onMessage, label: 'City', style }, h),
})

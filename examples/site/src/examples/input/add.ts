import { Style } from 'foldkit-mixins'
import { Input, InputSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The shipped recipe has no `width` axis. `add` gives it one, and its
// variants and sizes still apply to the control and the group.
const Inputs = Recipes.Input.add({
  width: { narrow: { root: Style.self({ inlineSize: '12rem' }) } },
})

export default example({
  title: 'A look of your own',
  slots: InputSlots,
  recipe: Inputs,
  pins: { width: 'narrow' },
  view: ({ style, h }) =>
    Input.view({ id: 'zip', label: 'Postcode', placeholder: 'SW1A 1AA', style }, h),
})

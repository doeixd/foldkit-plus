import { Style } from 'foldkit-mixins'
import { Button, ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The shipped recipe has no `width` axis. `add` gives it one, and its tones,
// variants and sizes still apply; a value an axis already has is refused.
const Buttons = Recipes.Button.add({
  width: { full: { button: Style.self({ inlineSize: '100%' }) } },
})

export default example({
  title: 'A look of your own',
  slots: ButtonSlots,
  recipe: Buttons,
  pins: { width: 'full' },
  view: ({ style, h }) => Button.view({ label: 'Continue', style }, h),
})

import { Button, ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

// An `icon` stands before the label; the `icon` variant shows it alone,
// the label staying its name.
export default example({
  title: 'Basic',
  slots: ButtonSlots,
  recipe: Recipes.Button,
  view: ({ style, h }) =>
    Button.view({ label: 'Save changes', icon: outline(h, 'M3 8.5l3 3 7-7'), style }, h),
})

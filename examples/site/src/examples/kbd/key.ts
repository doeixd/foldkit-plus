import { Kbd, KbdSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A key names what to press, never an action: pair it with words.
export default example({
  title: 'A key',
  slots: KbdSlots,
  recipe: Recipes.Kbd,
  view: ({ style, h }) => h.p([], ['Press ', Kbd.view({ key: 'Enter', style }, h), ' to send.']),
})

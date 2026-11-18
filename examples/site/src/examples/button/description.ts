import { Button, ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// A `description` is a second line under the label. Both name the button, so
// a screen reader reads them together.
export default example({
  title: 'Two lines',
  slots: ButtonSlots,
  recipe: Recipes.Button,
  pins: { variant: 'outline', tone: 'neutral' },
  view: ({ style, h }) =>
    row(h, [
      Button.view({ label: 'Deploy', description: 'To production, from main', style }, h),
      Button.view({ label: 'Roll back', description: 'To the last release', style }, h),
    ]),
})

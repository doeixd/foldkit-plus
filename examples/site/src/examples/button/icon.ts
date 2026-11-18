import { Button, ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { row } from '../../snippets/layout.js'

const actions = [
  { label: 'Reply', path: 'M6.5 4L2.5 8l4 4M3 8h6.5a4 4 0 0 1 4 4' },
  { label: 'Copy', path: 'M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3' },
  { label: 'Delete', path: 'M2.5 4.5h11M6 4.5v-2h4v2M4 4.5l.75 9h6.5l.75-9' },
]

// A row of actions with no words in sight: each label is its button's name.
export default example({
  title: 'Icon only',
  slots: ButtonSlots,
  recipe: Recipes.Button,
  pins: { tone: 'neutral', variant: 'icon' },
  view: ({ style, h }) =>
    row(
      h,
      actions.map(({ label, path }) => Button.view({ label, icon: outline(h, path), style }, h)),
      [h.Role('group'), h.AriaLabel('Message')],
    ),
})

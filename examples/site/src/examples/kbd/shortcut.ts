import { Button, ButtonSlots, Kbd, KbdSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

const Face = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))

// A shortcut beside a button's label: a Button's `trailing` holds the combination.
export default example({
  title: 'Beside a button',
  slots: KbdSlots,
  recipe: Recipes.Kbd,
  view: ({ style, h }) =>
    row(h, [
      Button.view(
        { label: 'Search', trailing: Kbd.combo({ keys: ['⌘', 'K'], style }, h), style: Face },
        h,
      ),
      Button.view(
        { label: 'Save', trailing: Kbd.combo({ keys: ['⌘', 'S'], style }, h), style: Face },
        h,
      ),
    ]),
})

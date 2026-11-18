import { Button, ButtonGroup, ButtonGroupSlots, ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Face = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))

// Outlined buttons, joined: their borders overlap at each seam.
export default example({
  title: 'Basic',
  slots: ButtonGroupSlots,
  recipe: Recipes.ButtonGroup,
  view: ({ style, h }) =>
    ButtonGroup.view(
      {
        label: 'Message actions',
        items: ['Archive', 'Report', 'Snooze'].map(label => Button.view({ label, style: Face }, h)),
        style,
      },
      h,
    ),
})

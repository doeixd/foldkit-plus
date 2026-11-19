import { Button, ButtonGroup, ButtonGroupSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Face = Recipes.Button.style({ tone: 'neutral', variant: 'outline' })

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

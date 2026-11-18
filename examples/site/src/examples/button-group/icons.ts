import { Button, ButtonGroup, ButtonGroupSlots, ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { forSlots } from '../../snippets/theme.js'

// `shape: 'square'` shows each icon alone; its label stays the button's name.
const Square = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline', shape: 'square' }),
)

const alignments = [
  { label: 'Align left', icon: 'M2 3.5h12M2 6.5h8M2 9.5h12M2 12.5h8' },
  { label: 'Align center', icon: 'M2 3.5h12M4 6.5h8M2 9.5h12M4 12.5h8' },
  { label: 'Align right', icon: 'M2 3.5h12M6 6.5h8M2 9.5h12M6 12.5h8' },
  { label: 'Justify', icon: 'M2 3.5h12M2 6.5h12M2 9.5h12M2 12.5h12' },
]

export default example({
  title: 'Icons',
  slots: ButtonGroupSlots,
  recipe: Recipes.ButtonGroup,
  view: ({ style, h }) =>
    ButtonGroup.view(
      {
        label: 'Text alignment',
        items: alignments.map(({ label, icon }) =>
          Button.view({ label, icon: outline(h, icon), style: Square }, h),
        ),
        style,
      },
      h,
    ),
})

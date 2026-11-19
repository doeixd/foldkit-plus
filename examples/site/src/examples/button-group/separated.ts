import { Button, ButtonGroup, ButtonGroupSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

const Filled = Recipes.Button.style({ tone: 'neutral' })

const clipboard = [
  {
    label: 'Cut',
    icon: 'M4.5 13.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM11.5 13.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 10l6-7.5M10 10L4 2.5',
  },
  { label: 'Copy', icon: 'M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3' },
  { label: 'Paste', icon: 'M5.5 2h5v2.5h-5zM5.5 3H3v11h10V3h-2.5' },
]

// Solid buttons' fills meet edge to edge: `separated` draws a rule on every
// seam, where outlined buttons show their borders.
export default example({
  title: 'Separated',
  slots: ButtonGroupSlots,
  recipe: Recipes.ButtonGroup,
  view: ({ style, h }) =>
    ButtonGroup.view(
      {
        label: 'Clipboard',
        items: clipboard.map(({ label, icon }) =>
          Button.view({ label, icon: outline(h, icon), style: Filled }, h),
        ),
        separated: true,
        style,
      },
      h,
    ),
})

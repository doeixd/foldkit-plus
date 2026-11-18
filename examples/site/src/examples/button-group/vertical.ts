import { Button, ButtonGroup, ButtonGroupSlots, ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { row } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

const Face = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))
const Square = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline', shape: 'square' }),
)

const zoom = [
  { label: 'Zoom in', icon: 'M8 3v10M3 8h10' },
  { label: 'Zoom out', icon: 'M3 8h10' },
  { label: 'Fit to screen', icon: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10' },
]

// `orientation: 'vertical'` stacks the items, joined top to bottom, each as
// wide as the widest.
export default example({
  title: 'Vertical',
  slots: ButtonGroupSlots,
  recipe: Recipes.ButtonGroup,
  view: ({ style, h }) =>
    row(h, [
      ButtonGroup.view(
        {
          label: 'Zoom',
          orientation: 'vertical',
          items: zoom.map(({ label, icon }) =>
            Button.view({ label, icon: outline(h, icon), style: Square }, h),
          ),
          style,
        },
        h,
      ),
      ButtonGroup.view(
        {
          label: 'Layer order',
          orientation: 'vertical',
          items: ['Bring forward', 'Send backward', 'Send to back'].map(label =>
            Button.view({ label, style: Face }, h),
          ),
          style,
        },
        h,
      ),
    ]),
})

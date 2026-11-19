import { Badge, Button, ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { row } from '../../snippets/layout.js'

const Counts = Recipes.Badge.style({ appearance: 'solid', size: 'sm' })

// A `mark` sits on the button's corner: a count Badge here, so what it says
// is read with the label. The mark's slot places it; the Badge's own style
// draws it.
export default example({
  title: 'Corner mark',
  slots: ButtonSlots,
  recipe: Recipes.Button,
  pins: { tone: 'neutral', variant: 'outline', shape: 'square' },
  view: ({ style, h }) =>
    row(h, [
      Button.view(
        {
          label: 'Notifications',
          icon: outline(
            h,
            'M8 1.5a4.5 4.5 0 0 0-4.5 4.5v2.5L2 11h12l-1.5-2.5V6A4.5 4.5 0 0 0 8 1.5zM6.5 13a1.5 1.5 0 0 0 3 0',
          ),
          mark: Badge.view({ text: '3', tone: 'danger', style: Counts }, h),
          style,
        },
        h,
      ),
    ]),
})

import { Button, Item, ItemSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Small = Recipes.Button.style({ size: 'sm', variant: 'outline' })

// `header` and `footer` are full-width bands above and below the row. The
// whole item is a link, and the footer's button stays pressable above it.
export default example({
  title: 'Header and footer',
  slots: ItemSlots,
  recipe: Recipes.Item,
  pins: { variant: 'outline' },
  view: ({ style, h }) =>
    Item.view(
      {
        header: h.span([], ['Pull request #589']),
        title: 'Example factories',
        description: 'Opened by Ada, 3 checks passing',
        press: { href: '#' },
        footer: Button.view({ label: 'Review', style: Small }, h),
        style,
      },
      h,
    ),
})

import { Item, ItemSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

const List = Recipes.ItemGroup.style({})

// Settings: a list of rows, each one control that opens its page. `press`
// draws one link over the row, named by its title.
export default example({
  title: 'Settings',
  slots: ItemSlots,
  recipe: Recipes.Item,
  pins: { media: 'icon' },
  view: ({ style, h }) =>
    Item.group(
      {
        label: 'Settings',
        items: [
          // Pages of this site, standing in for an application's settings pages.
          { key: 'avatar', title: 'Profile', description: 'Name, photo and email' },
          { key: 'password-input', title: 'Security', description: 'Passkeys and sessions' },
          { key: 'pagination', title: 'Billing', description: 'Plan and invoices' },
        ].map(row => ({
          ...row,
          media: outline(h, 'M8 1.5l1.8 4.7 4.7 1.8-4.7 1.8L8 14.5l-1.8-4.7L1.5 8l4.7-1.8z'),
          press: { href: `/components/${row.key}` },
        })),
        style: List,
        itemStyle: style,
      },
      h,
    ),
})

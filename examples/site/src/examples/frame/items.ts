import { Frame, FrameSlots, Item, ItemSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Row = forSlots(ItemSlots)(Recipes.Item({ density: 'compact' }))

// One Item to a panel: the panel is the surface, the Item the row.
export default example({
  title: 'Rows in a frame',
  slots: FrameSlots,
  recipe: Recipes.Frame,
  pins: { padding: 'none' },
  view: ({ style, h }) =>
    Frame.view(
      {
        title: 'Team',
        panels: ['Ada Lovelace', 'Grace Hopper', 'Alan Turing'].map(name =>
          Item.view({ title: name, description: 'Engineer', style: Row }, h),
        ),
        style,
      },
      h,
    ),
})

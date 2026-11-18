import { Avatar, AvatarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { portrait } from '../../snippets/portrait.js'
import { row } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

// A disc, a rounded square and a square, ringed in the accent.
const Shapes = (['circle', 'rounded', 'square'] as const).map(shape =>
  forSlots(AvatarSlots)(Recipes.Avatar({ shape, size: 'lg', ring: 'accent' })),
)

export default example({
  title: 'Shapes',
  slots: AvatarSlots,
  recipe: Recipes.Avatar,
  view: ({ h }) =>
    row(
      h,
      Shapes.map(style => Avatar.view({ name: 'Grace Hopper', src: portrait(20), style }, h)),
    ),
})

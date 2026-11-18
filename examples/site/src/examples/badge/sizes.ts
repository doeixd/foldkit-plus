import { Badge, BadgeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

// `size` is a recipe axis, so each step is a style of its own; the same
// call draws all three.
const Small = forSlots(BadgeSlots)(Recipes.Badge({ size: 'sm' }))
const Medium = forSlots(BadgeSlots)(Recipes.Badge({ size: 'md' }))
const Large = forSlots(BadgeSlots)(Recipes.Badge({ size: 'lg' }))

export default example({
  title: 'Sizes',
  slots: BadgeSlots,
  recipe: Recipes.Badge,
  pins: { appearance: 'tinted' },
  view: ({ h }) =>
    row(h, [
      Badge.view({ text: 'Small', tone: 'info', style: Small }, h),
      Badge.view({ text: 'Medium', tone: 'info', style: Medium }, h),
      Badge.view({ text: 'Large', tone: 'info', style: Large }, h),
    ]),
})

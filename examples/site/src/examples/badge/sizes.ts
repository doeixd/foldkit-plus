import { Badge, BadgeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// `size` is a recipe axis, so each step is a style of its own; the same
// call draws all three.
const Small = Recipes.Badge.style({ size: 'sm' })
const Medium = Recipes.Badge.style({ size: 'md' })
const Large = Recipes.Badge.style({ size: 'lg' })

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

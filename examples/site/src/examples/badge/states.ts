import { Badge, BadgeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// A badge whose words are the application's own (a deployment's state) maps
// them to tones with `badgeTones`, through `extend`. A word the map leaves
// out keeps the base.
const States = Recipes.Badge.extend({
  base: {
    badge: Recipes.badgeTones('data-tone', {
      live: 'success',
      deploying: 'warning',
      down: 'danger',
      queued: 'info',
    }),
  },
})

export default example({
  title: 'Your own states',
  slots: BadgeSlots,
  recipe: States,
  view: ({ style, h }) =>
    row(h, [
      Badge.view({ text: 'Live', tone: 'live', style }, h),
      Badge.view({ text: 'Deploying', tone: 'deploying', style }, h),
      Badge.view({ text: 'Down', tone: 'down', style }, h),
      Badge.view({ text: 'Queued', tone: 'queued', style }, h),
      Badge.view({ text: 'Archived', style }, h),
    ]),
})

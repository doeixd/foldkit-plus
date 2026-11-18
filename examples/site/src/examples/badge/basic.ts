import { Badge, BadgeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// A tone is a word the badge carries, not a recipe axis: one style serves
// every tone at once. A badge with none keeps the quiet base.
export default example({
  title: 'Tones',
  slots: BadgeSlots,
  recipe: Recipes.Badge,
  view: ({ style, h }) =>
    row(h, [
      Badge.view({ text: 'Draft', style }, h),
      Badge.view({ text: 'Pro', tone: 'accent', style }, h),
      Badge.view({ text: 'Neutral', tone: 'neutral', style }, h),
      Badge.view({ text: 'Info', tone: 'info', style }, h),
      Badge.view({ text: 'Live', tone: 'success', style }, h),
      Badge.view({ text: 'Review', tone: 'warning', style }, h),
      Badge.view({ text: 'Failed', tone: 'danger', style }, h),
    ]),
})

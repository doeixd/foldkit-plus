import { Style } from 'foldkit-mixins'
import { Badge, BadgeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// The shipped sizes stop at `lg`. `add` gives the recipe one more, and its
// appearances and tones still apply; a value an axis already has is refused.
const Badges = Recipes.Badge.add({
  size: { xl: { badge: Style.self({ fontSize: '1.25rem', paddingInline: '1rem' }) } },
})

export default example({
  title: 'A size of your own',
  slots: BadgeSlots,
  recipe: Badges,
  pins: { size: 'xl' },
  view: ({ style, h }) =>
    row(h, [
      Badge.view({ text: '12', tone: 'danger', style }, h),
      Badge.view({ text: 'Release candidate', tone: 'accent', style }, h),
    ]),
})

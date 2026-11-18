import { Badge, BadgeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// `href` draws the pill as a link, with the pointer, hover and focus ring of
// one. `external` opens a new tab and says so to a screen reader; a link
// holds no dismiss button.
export default example({
  title: 'As a link',
  slots: BadgeSlots,
  recipe: Recipes.Badge,
  view: ({ style, h }) =>
    row(h, [
      Badge.view({ text: 'Changelog', tone: 'accent', href: '#changelog', style }, h),
      Badge.view(
        { text: 'Docs', tone: 'info', href: 'https://example.com', external: true, style },
        h,
      ),
    ]),
})

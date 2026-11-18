import { Icon, IconSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// `glyph` is a drawing of your own in the box instead of icon data: initials,
// a count, an emoji. It is as large as an icon of the same size would be.
export default example({
  title: 'Your own drawing',
  slots: IconSlots,
  recipe: Recipes.Icon,
  pins: { surface: 'soft', shape: 'circle', size: 'md' },
  view: ({ style, h }) =>
    row(h, [
      Icon.view({ glyph: h.span([], ['AL']), label: 'Ada Lovelace', style }, h),
      Icon.view({ glyph: h.span([], ['12']), label: '12 unread', style }, h),
      Icon.view({ glyph: h.span([], ['🎉']), label: 'Celebration', style }, h),
    ]),
})

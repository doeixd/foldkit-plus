import { Separator, SeparatorSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// One style draws both: across, between sections; stood up, between links in
// a row, where it stretches to the row's height.
export default example({
  title: 'Basic',
  slots: SeparatorSlots,
  recipe: Recipes.Separator,
  view: ({ style, h }) =>
    h.div(
      [h.Style({ display: 'grid', gap: '0.75rem', inlineSize: 'min(100%, 22rem)' })],
      [
        h.div(
          [],
          [
            h.p([h.Style({ fontWeight: '600' })], ['Foldkit Plus']),
            h.p([], ['Packages for Foldkit applications.']),
          ],
        ),
        Separator.view({ style }, h),
        h.div(
          [h.Style({ display: 'flex', alignItems: 'center', gap: '0.75rem' })],
          [
            h.a([h.Href('#')], ['Blog']),
            Separator.view({ orientation: 'vertical', style }, h),
            h.a([h.Href('#')], ['Docs']),
            Separator.view({ orientation: 'vertical', style }, h),
            h.a([h.Href('#')], ['Source']),
          ],
        ),
      ],
    ),
})

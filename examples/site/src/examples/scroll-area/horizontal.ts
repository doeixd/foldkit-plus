import { Recipes, ScrollArea, ScrollAreaSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// One axis may scroll: the orientation says which. The edge with more past it
// fades, and a line marks it.
export default example({
  title: 'Horizontal',
  slots: ScrollAreaSlots,
  recipe: Recipes.ScrollArea,
  pins: { orientation: 'horizontal' },
  view: ({ style, h }) =>
    ScrollArea.view(
      {
        label: 'Tags',
        content: h.div(
          [h.Style({ display: 'flex', gap: '0.75rem', whiteSpace: 'nowrap', padding: '0.5rem' })],
          Array.from({ length: 24 }, (_, index) => h.span([], [`tag-${index + 1}`])),
        ),
        style,
      },
      h,
    ),
})

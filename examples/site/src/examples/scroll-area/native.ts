import { Recipes, ScrollArea, ScrollAreaSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The height that makes the box scroll is the application's: the recipe
// extended by one, here.
export const Tall = Recipes.ScrollArea.extend({ base: { viewport: { maxBlockSize: '12rem' } } })

// The box scrolls instead of the page, in the browser's own thin bars.
export default example({
  title: 'The browser’s bars',
  slots: ScrollAreaSlots,
  recipe: Tall,
  view: ({ style, h }) =>
    ScrollArea.view(
      {
        label: 'Releases',
        content: h.ul(
          [h.Style({ margin: '0', paddingInline: '1rem' })],
          Array.from({ length: 24 }, (_, index) => h.li([], [`Release 0.${24 - index}.0`])),
        ),
        style,
      },
      h,
    ),
})

import { Recipes, ScrollArea, ScrollAreaSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'
import { Tall } from './native.js'

const Boxed = forSlots(ScrollAreaSlots)(Tall({ gutter: 'stable' }))

// What every scroll area of an application starts from: its height and look,
// and the bars it draws, said once. `overlayBars` is a value in `base`, so only
// an application that names it ships it.
const AppScroll = ScrollArea.configure({
  base: { style: Boxed, mixins: ScrollArea.overlayBars },
})

export default example({
  title: 'Configure once',
  slots: ScrollAreaSlots,
  recipe: Recipes.ScrollArea,
  view: ({ h }) =>
    AppScroll.view(
      {
        label: 'Notes',
        content: h.ul(
          [h.Style({ margin: '0', paddingInline: '1rem' })],
          Array.from({ length: 20 }, (_, index) => h.li([], [`Note ${index + 1}`])),
        ),
      },
      h,
    ),
})

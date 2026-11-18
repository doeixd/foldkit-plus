import { ScrollArea, ScrollAreaSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Tall } from './native.js'

// `gutter: 'stable'` keeps the room a bar takes, so the content does not
// shift sideways when the box starts to scroll.
export default example({
  title: 'A stable gutter',
  slots: ScrollAreaSlots,
  recipe: Tall,
  pins: { gutter: 'stable' },
  view: ({ style, h }) =>
    ScrollArea.view(
      {
        label: 'Changes',
        content: h.ul(
          [h.Style({ margin: '0', paddingInline: '1rem' })],
          Array.from({ length: 16 }, (_, index) => h.li([], [`Change ${index + 1}`])),
        ),
        style,
      },
      h,
    ),
})

import { ScrollArea, ScrollAreaSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Tall } from './native.js'

// Bars drawn over the content in place of the browser's, on a pointer that
// can hover; a coarse pointer keeps the browser's. Off unless passed, so a
// page that never names `overlayBars` never ships the bar Mount.
export default example({
  title: 'Overlay bars',
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
        mixins: ScrollArea.overlayBars,
        style,
      },
      h,
    ),
})

import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fixed, inert } from '../define.js'

export const showcase = fixed(
  about('scroll-area'),
  () => Snippet.scrollArea(Snippet.ScrollAreaStyle, inert),
  [
    {
      name: 'native',
      title: "The browser's bars",
      draw: () => Snippet.scrollArea(Snippet.ScrollAreaStyle, inert),
    },
    {
      name: 'overlay',
      title: 'Overlay bars',
      draw: () => Snippet.scrollAreaOverlay(Snippet.ScrollAreaStyle, inert),
    },
  ],
)

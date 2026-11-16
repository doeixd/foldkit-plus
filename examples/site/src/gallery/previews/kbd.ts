import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fixed, inert } from '../define.js'

export const showcase = fixed(about('kbd'), () => Snippet.kbdCombo(Snippet.KbdStyle, inert), [
  { name: 'key', title: 'A key', draw: () => Snippet.kbdKey(Snippet.KbdStyle, inert) },
  {
    name: 'combo',
    title: 'A combination',
    draw: () => Snippet.kbdCombo(Snippet.KbdStyle, inert),
  },
  {
    name: 'joined',
    title: 'Joined by words',
    draw: () => Snippet.kbdJoined(Snippet.KbdStyle, inert),
  },
])

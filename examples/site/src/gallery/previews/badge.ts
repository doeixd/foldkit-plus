import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fixed, inert } from '../define.js'

export const showcase = fixed(
  about('badge'),
  () => Snippet.badgesTinted(Snippet.BadgeStyle, inert),
  [
    {
      name: 'tinted',
      title: 'Tinted',
      draw: () => Snippet.badgesTinted(Snippet.BadgeStyle, inert),
    },
    { name: 'dot', title: 'Dot', draw: () => Snippet.badgesDot(Snippet.BadgeDotStyle, inert) },
    {
      name: 'outline',
      title: 'Outline',
      draw: () => Snippet.badgesOutline(Snippet.BadgeOutlineStyle, inert),
    },
    {
      name: 'solid',
      title: 'Solid',
      draw: () => Snippet.badgesSolid(Snippet.BadgeSolidStyle, inert),
    },
  ],
)

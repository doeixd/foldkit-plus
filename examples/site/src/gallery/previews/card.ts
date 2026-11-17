import type { NamedStyle } from 'foldkit-mixins'
import { CardSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'
import type { Live } from '../showcase.js'

const cardBasic = <Message>(style: NamedStyle<typeof CardSlots>, live: Live<Message>) =>
  Snippet.card(
    style,
    { dismissed: live.dismissed, onDismiss: live.onDismiss, onRestore: live.onRestore },
    live.h,
  )

export const showcase = fromRecipe(
  about('card'),
  CardSlots,
  Recipes.Card,
  cardBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: cardBasic },
    { name: 'stat', title: 'A figure', draw: style => Snippet.cardStat(style, inert) },
    { name: 'media', title: 'Media', draw: style => Snippet.cardMedia(style, inert) },
    { name: 'profile', title: 'A person', draw: style => Snippet.cardProfile(style, inert) },
    {
      name: 'link',
      title: 'A link',
      draw: style => Snippet.cardLink(style, inert),
      pins: { lift: 'hover' },
    },
    { name: 'elevation', title: 'Elevation', draw: () => Snippet.cardElevation(inert) },
  ],
  {
    // The recipe reads elevation for these two surfaces only; a filled or plain card is flat.
    elevation: {
      axis: 'surface',
      values: ['outlined', 'elevated'],
      hint: 'outlined and elevated only',
    },
  },
)

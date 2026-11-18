import { Card, CardSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

// A whole card that goes somewhere: one link named by its title, drawn over
// the card, so the card lifts under the pointer and a footer's own controls
// stay pressable above it.
export default example({
  title: 'A link',
  slots: CardSlots,
  recipe: Recipes.Card,
  pins: { lift: 'hover' },
  view: ({ style, h }) =>
    Card.view(
      {
        media: outline(h, 'M8 1.5l1.8 4.7 4.7 1.8-4.7 1.8L8 14.5l-1.8-4.7L1.5 8l4.7-1.8z'),
        title: 'Read the changelog',
        description: 'Everything that shipped this month.',
        press: { href: 'https://github.com/doeixd/foldkit-plus/blob/main/CHANGELOG.md' },
        style,
      },
      h,
    ),
})

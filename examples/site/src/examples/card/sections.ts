import { Button, ButtonSlots, Card, CardSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Action = forSlots(ButtonSlots)(Recipes.Button({ size: 'sm' }))

// `divide` draws a hairline under the header, or under it and over the
// footer, edge to edge, so the regions read as sections of one sheet.
export default example({
  title: 'Sections',
  slots: CardSlots,
  recipe: Recipes.Card,
  pins: { divide: 'sections' },
  view: ({ style, h }) =>
    Card.view(
      {
        title: 'Billing',
        description: 'Your plan renews on 1 December.',
        content: h.p([], ['Team plan, ten seats, $120 a month.']),
        footer: Button.view({ label: 'Change plan', style: Action }, h),
        style,
      },
      h,
    ),
})

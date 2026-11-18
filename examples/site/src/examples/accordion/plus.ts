import { Accordion, AccordionSlots, Bundles, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// `multiple` is an arg of the Bundle, so the press that opens a second
// section is folded the same way wherever it is sent from.
export default example({
  title: 'Cards with a plus',
  slots: AccordionSlots,
  recipe: Recipes.Accordion,
  pins: { variant: 'separated', indicator: 'plus', indicatorPosition: 'start' },
  state: Bundles.Accordion.with({ open: ['refunds'], multiple: true }),
  view: ({ style, model, onMessage, h }) =>
    Accordion.view(
      {
        id: 'acc-plus',
        items: [
          { id: 'refunds', title: 'Refunds', content: 'Within 30 days, to the card that paid.' },
          { id: 'seats', title: 'Seats', content: 'Add or remove them at any time.' },
          { id: 'sso', title: 'Single sign-on', content: 'On the Business plan.', disabled: true },
        ],
        ...Accordion.controls(model, onMessage),
        style,
      },
      h,
    ),
})

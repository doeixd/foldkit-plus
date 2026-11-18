import { Accordion, AccordionSlots, Bundles, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Which sections are open is the Bundle's Model; `controls` hands the view
// that list and the Message a press sends. One open at a time, and a press on
// the open one shuts it: the Bundle's defaults.
export default example({
  title: 'Basic',
  slots: AccordionSlots,
  recipe: Recipes.Accordion,
  state: Bundles.Accordion.with({ open: ['billing'] }),
  view: ({ style, model, onMessage, h }) =>
    Accordion.view(
      {
        id: 'acc-basic',
        items: [
          {
            id: 'billing',
            title: 'Billing',
            content: 'Seats, invoices and receipts, billed monthly.',
          },
          {
            id: 'team',
            title: 'Team',
            content: 'Invite people, remove them, and assign their roles.',
          },
          {
            id: 'keys',
            title: 'API keys',
            content: 'Mint a key per service, scope it, and revoke it.',
          },
        ],
        ...Accordion.controls(model, onMessage),
        style,
      },
      h,
    ),
})

import { Accordion, AccordionSlots, Bundles, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

// A ghost accordion whose open section is tinted, row and panel, with its
// own indicator in place of the chevron.
export default example({
  title: 'Ghost, the open one tinted',
  slots: AccordionSlots,
  recipe: Recipes.Accordion,
  pins: { variant: 'ghost', separators: 'off', active: 'item' },
  state: Bundles.Accordion.with({ open: ['billing'] }),
  view: ({ style, model, onMessage, h }) =>
    Accordion.view(
      {
        id: 'acc-tinted',
        items: [
          { id: 'billing', title: 'Billing', content: 'Seats, invoices and receipts.' },
          { id: 'team', title: 'Team', content: 'Invite people and assign roles.' },
        ],
        icon: outline(h, 'M4 6l4 4 4-4'),
        ...Accordion.controls(model, onMessage),
        style,
      },
      h,
    ),
})

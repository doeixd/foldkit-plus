import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Card, CardGroupSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Plan = Recipes.Card.style({ surface: 'plain', orientation: 'inline' })

const plans = [
  { key: 'starter', title: 'Starter', description: 'One editor and three pages.', price: 'Free' },
  { key: 'team', title: 'Team', description: 'Ten editors and every page.', price: '$12' },
  { key: 'business', title: 'Business', description: 'Sign-on and audit logs.', price: '$40' },
  { key: 'enterprise', title: 'Enterprise', description: 'Talk to us first.', price: 'Soon' },
]

const Model = Schema.Struct({ chosen: Schema.String })
const Message = defineMessageUnion({ Chose: { key: Schema.String } })

// Cards as one choice: the chosen one is `selected`, a card can be `disabled`,
// and `Card.fluid` is the highlight that follows the pointer. Without it the
// group draws no highlight and loads none of its code.
export default example({
  title: 'Plans',
  slots: CardGroupSlots,
  recipe: Recipes.CardGroup,
  state: {
    Model,
    Message,
    init: () => ({ model: { chosen: 'team' } }),
    update: (model, { key }) => ({ model: key === model.chosen ? model : { chosen: key } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Card.group(
      {
        fluid: Card.fluid,
        label: 'Plans',
        cards: plans.map(plan => ({
          key: plan.key,
          title: plan.title,
          description: plan.description,
          footer: h.span([], [plan.price]),
          selected: plan.key === model.chosen,
          disabled: plan.key === 'enterprise',
          press: { onClick: onMessage(Message.Chose({ key: plan.key })) },
        })),
        style,
        cardStyle: Plan,
      },
      h,
    ),
})

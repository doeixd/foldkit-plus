import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Item, ItemSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ chosen: Schema.String })
const Message = defineMessageUnion({ Chose: { plan: Schema.String } })

// Rows as a choice: the chosen one is `selected`, pressed, and keeps a film
// of its text.
export default example({
  title: 'A choice',
  slots: ItemSlots,
  recipe: Recipes.Item,
  state: {
    Model,
    Message,
    init: () => ({ model: { chosen: 'Team' } }),
    update: (model, { plan }) => ({ model: plan === model.chosen ? model : { chosen: plan } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Item.group(
      {
        label: 'Plan',
        items: ['Starter', 'Team', 'Business'].map(title => ({
          key: title,
          title,
          selected: title === model.chosen,
          press: { onClick: onMessage(Message.Chose({ plan: title })) },
        })),
        itemStyle: style,
      },
      h,
    ),
})

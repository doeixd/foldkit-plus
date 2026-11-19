import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Card, CardGroupSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Region = Recipes.Card.style({})

const Model = Schema.Struct({ chosen: Schema.String })
const Message = defineMessageUnion({ Chose: { region: Schema.String } })

// Cards in a grid, still one choice: the highlight follows the pointer both
// ways. Leave `fluid` out and each card shows its own hover.
export default example({
  title: 'A grid',
  slots: CardGroupSlots,
  recipe: Recipes.CardGroup,
  pins: { layout: 'separated' },
  state: {
    Model,
    Message,
    init: () => ({ model: { chosen: 'Frankfurt' } }),
    update: (model, { region }) => ({
      model: region === model.chosen ? model : { chosen: region },
    }),
  },
  view: ({ style, model, onMessage, h }) =>
    Card.group(
      {
        fluid: Card.fluid,
        label: 'Regions',
        columns: 2,
        cards: ['Frankfurt', 'Virginia', 'Singapore', 'São Paulo'].map(title => ({
          key: title,
          title,
          description: 'Under 40ms from most of the region',
          selected: title === model.chosen,
          press: { onClick: onMessage(Message.Chose({ region: title })) },
        })),
        style,
        cardStyle: Region,
      },
      h,
    ),
})

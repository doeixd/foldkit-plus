import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Segmented, SegmentedSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Small = Recipes.Segmented.style({ size: 'sm' })

// Every segmented control of the application is small, and glides its pill
// (`Segmented.fluid`, passed here and nowhere else); a use gives only its
// options and its choice.
const AppSegmented = Segmented.configure({ base: { style: Small, mixins: Segmented.fluid } })

const Model = Schema.Struct({ range: Schema.String })
const Message = defineMessageUnion({ Chose: { range: Schema.String } })

export default example({
  title: 'Configure once',
  slots: SegmentedSlots,
  recipe: Recipes.Segmented,
  state: {
    Model,
    Message,
    init: () => ({ model: { range: 'week' } }),
    update: (model, { range }) => ({ model: model.range === range ? model : { range } }),
  },
  view: ({ model, onMessage, h }) =>
    AppSegmented.view(
      {
        id: 'range',
        label: 'Range',
        options: ['day', 'week', 'month'].map(value => ({ value, label: value })),
        pressed: [model.range],
        onPress: range => onMessage(Message.Chose({ range })),
      },
      h,
    ),
})

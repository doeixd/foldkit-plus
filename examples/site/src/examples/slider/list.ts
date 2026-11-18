import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Slider, SliderSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ stops: Schema.Array(Schema.Number) })
const Message = defineMessageUnion({ Moved: { stops: Schema.Array(Schema.Number) } })

// A list of values is a slider of as many thumbs. Each stops at its
// neighbours, named by its place (`words.thumb`), and the fill runs from the
// first to the last.
export default example({
  title: 'Three thumbs',
  slots: SliderSlots,
  recipe: Recipes.Slider,
  state: {
    Model,
    Message,
    init: () => ({ model: { stops: [20, 50, 80] } }),
    update: (_, { stops }) => ({ model: { stops } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Slider.view(
      {
        id: 'stops',
        label: 'Gradient stops',
        value: model.stops,
        onChange: stops => onMessage(Message.Moved({ stops })),
        words: { thumb: 'Stop {index} of {count}' },
        showValue: true,
        style,
      },
      h,
    ),
})

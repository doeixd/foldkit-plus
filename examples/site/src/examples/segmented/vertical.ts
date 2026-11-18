import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Segmented, SegmentedSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ pressed: Schema.Array(Schema.String) })
const Message = defineMessageUnion({ Pressed: { value: Schema.String } })

// `multiple` is a toggle group: any number on, each a button with
// `aria-pressed`. `orientation: 'vertical'` stacks the options; it is a look
// over the same markup, read from `data-orientation`.
export default example({
  title: 'Vertical toggle group',
  slots: SegmentedSlots,
  recipe: Recipes.Segmented,
  state: {
    Model,
    Message,
    init: () => ({ model: { pressed: ['Bold'] } }),
    update: (model, { value }) => ({
      model: { pressed: Segmented.toggled(model.pressed, value, { multiple: true }) },
    }),
  },
  view: ({ style, model, onMessage, h }) =>
    Segmented.view(
      {
        multiple: true,
        orientation: 'vertical',
        label: 'Text style',
        options: ['Bold', 'Italic', 'Underline'].map(value => ({ value, label: value })),
        pressed: model.pressed,
        onPress: value => onMessage(Message.Pressed({ value })),
        style,
      },
      h,
    ),
})

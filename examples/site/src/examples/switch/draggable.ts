import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Switch, SwitchSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ on: Schema.Boolean })
const Message = defineMessageUnion({ Toggled: { on: Schema.Boolean } })

// Dragging the thumb is a feature passed beside the style: the page that
// never names `Switch.draggable` ships none of it.
export default example({
  title: 'Drag the thumb',
  slots: SwitchSlots,
  recipe: Recipes.Switch,
  state: {
    Model,
    Message,
    init: () => ({ model: { on: false } }),
    update: (model, { on }) => ({ model: model.on === on ? model : { on } }),
  },
  view: ({ style, model, onMessage, h }) => {
    const onToggle = (on: boolean) => onMessage(Message.Toggled({ on }))
    return Switch.view(
      {
        id: 'dragged',
        checked: model.on,
        onToggle,
        label: 'Drag, or press',
        mixins: [Switch.draggable(onToggle)],
        style,
      },
      h,
    )
  },
})

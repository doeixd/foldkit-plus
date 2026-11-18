import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Switch, SwitchSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ on: Schema.Boolean })
const Message = defineMessageUnion({ Toggled: { on: Schema.Boolean } })

// A checkbox's options on a switch's track: the field is the application's,
// the label names the switch and a press on it toggles.
export default example({
  title: 'Basic',
  slots: SwitchSlots,
  recipe: Recipes.Switch,
  state: {
    Model,
    Message,
    init: () => ({ model: { on: false } }),
    update: (model, { on }) => ({ model: model.on === on ? model : { on } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Switch.view(
      {
        id: 'airplane',
        checked: model.on,
        onToggle: on => onMessage(Message.Toggled({ on })),
        label: 'Airplane mode',
        style,
      },
      h,
    ),
})

import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Switch, SwitchSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ on: Schema.Boolean })
const Message = defineMessageUnion({ Toggled: { on: Schema.Boolean } })

// `tone: 'danger'` is a look; the confirmation text is the description.
export default example({
  title: 'Destructive',
  slots: SwitchSlots,
  recipe: Recipes.Switch,
  pins: { tone: 'danger' },
  state: {
    Model,
    Message,
    init: () => ({ model: { on: true } }),
    update: (model, { on }) => ({ model: model.on === on ? model : { on } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Switch.view(
      {
        id: 'delete',
        checked: model.on,
        onToggle: on => onMessage(Message.Toggled({ on })),
        label: 'Delete the project',
        description: 'This removes every page and cannot be undone.',
        style,
      },
      h,
    ),
})

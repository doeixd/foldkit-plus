import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Switch, SwitchSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

const Neutral = Recipes.Switch.style({ tone: 'neutral' })
const Danger = Recipes.Switch.style({ tone: 'danger' })

// Every switch of the application is neutral with its words first; one
// named preset is the destructive one.
const AppSwitch = Switch.configure({
  base: { style: Neutral, position: 'end' },
  presets: { danger: { style: Danger } },
})

const Model = Schema.Struct({ on: Schema.Boolean })
const Message = defineMessageUnion({ Toggled: { on: Schema.Boolean } })

export default example({
  title: 'Configure once',
  slots: SwitchSlots,
  recipe: Recipes.Switch,
  state: {
    Model,
    Message,
    init: () => ({ model: { on: true } }),
    update: (model, { on }) => ({ model: model.on === on ? model : { on } }),
  },
  view: ({ model, onMessage, h }) => {
    const onToggle = (on: boolean) => onMessage(Message.Toggled({ on }))
    return stack(h, [
      AppSwitch.view({ id: 'wifi', label: 'Wi-Fi', checked: model.on, onToggle }, h),
      AppSwitch.view(
        { id: 'wipe', label: 'Wipe on logout', preset: 'danger', checked: model.on, onToggle },
        h,
      ),
    ])
  },
})

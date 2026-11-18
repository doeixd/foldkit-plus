import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Checkbox, CheckboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

const Round = forSlots(CheckboxSlots)(Recipes.Checkbox({ shape: 'round', tone: 'neutral' }))

// Every checkbox of the application is a round, neutral one with its words
// first, said once; a use gives only what is its own.
const AppCheckbox = Checkbox.configure({
  base: { style: Round, position: 'end' },
  presets: { start: { position: 'start' } },
})

const Model = Schema.Struct({ checked: Schema.Boolean })
const Message = defineMessageUnion({ Toggled: { checked: Schema.Boolean } })

export default example({
  title: 'Configure once',
  slots: CheckboxSlots,
  recipe: Recipes.Checkbox,
  state: {
    Model,
    Message,
    init: () => ({ model: { checked: true } }),
    update: (model, { checked }) => ({ model: model.checked === checked ? model : { checked } }),
  },
  view: ({ model, onMessage, h }) => {
    const onToggle = (checked: boolean) => onMessage(Message.Toggled({ checked }))
    return stack(h, [
      AppCheckbox.view(
        { id: 'sync', label: 'Sync over cellular', checked: model.checked, onToggle },
        h,
      ),
      AppCheckbox.view(
        {
          id: 'sync-start',
          label: 'Words after',
          preset: 'start',
          checked: model.checked,
          onToggle,
        },
        h,
      ),
    ])
  },
})

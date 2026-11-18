import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Badge, BadgeSlots, Checkbox, CheckboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Tag = forSlots(BadgeSlots)(Recipes.Badge({}))

const Model = Schema.Struct({ checked: Schema.Boolean })
const Message = defineMessageUnion({ Toggled: { checked: Schema.Boolean } })

// `labelAside` is a slot the checkbox places and does not understand: a
// Badge here, as easily a Tooltip's trigger. `position: 'end'` puts the words
// first and the box at the far end.
export default example({
  title: 'Aside and position',
  slots: CheckboxSlots,
  recipe: Recipes.Checkbox,
  state: {
    Model,
    Message,
    init: () => ({ model: { checked: true } }),
    update: (model, { checked }) => ({ model: model.checked === checked ? model : { checked } }),
  },
  view: ({ style, model, onMessage, h }) =>
    Checkbox.view(
      {
        id: 'beta',
        checked: model.checked,
        onToggle: checked => onMessage(Message.Toggled({ checked })),
        label: 'Early access',
        labelAside: Badge.view({ text: 'Beta', style: Tag }, h),
        position: 'end',
        style,
      },
      h,
    ),
})

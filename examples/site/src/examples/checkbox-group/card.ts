import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Badge, BadgeSlots, CheckboxGroup, CheckboxGroupSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Tag = forSlots(BadgeSlots)(Recipes.Badge({}))

const Model = Schema.Struct({ checked: Schema.Array(Schema.String) })
const Message = defineMessageUnion({ Toggled: { value: Schema.String } })

// Each option is a row of content: a mark before the words (`icon`), a line
// under them (`description`, text or Html) and a badge after (`trailing`).
// `variant: 'card'` boxes each row and stretches its label over it, so a
// press anywhere on the card chooses it.
export default example({
  title: 'Cards with marks',
  slots: CheckboxGroupSlots,
  recipe: Recipes.CheckboxGroup,
  pins: { variant: 'card' },
  state: {
    Model,
    Message,
    init: () => ({ model: { checked: ['email'] } }),
    update: (model, { value }) => ({
      model: modifyFields(model, { checked: checked => CheckboxGroup.toggled(checked, value) }),
    }),
  },
  view: ({ style, model, onMessage, h }) =>
    CheckboxGroup.view(
      {
        id: 'channels',
        legend: 'Notify me by',
        options: [
          {
            value: 'email',
            label: 'Email',
            description: 'A digest each morning.',
            icon: h.span([], ['@']),
          },
          {
            value: 'sms',
            label: 'Text message',
            description: 'Only for urgent changes.',
            icon: h.span([], ['#']),
            trailing: Badge.view({ text: 'New', tone: 'accent', style: Tag }, h),
          },
        ],
        checked: model.checked,
        onToggle: value => onMessage(Message.Toggled({ value })),
        style,
      },
      h,
    ),
})

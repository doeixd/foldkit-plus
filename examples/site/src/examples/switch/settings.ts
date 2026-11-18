import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Switch, SwitchSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

const Model = Schema.Struct({ email: Schema.Boolean, push: Schema.Boolean })
const Message = defineMessageUnion({
  ToggledEmail: { on: Schema.Boolean },
  ToggledPush: { on: Schema.Boolean },
})

// A settings list: the words first, a line of description under them and the
// track at the far end, which is `position: 'end'`. Each `card` row is a look
// over the same markup, and pressing anywhere on it toggles its switch.
export default example({
  title: 'Settings list',
  slots: SwitchSlots,
  recipe: Recipes.Switch,
  pins: { variant: 'card' },
  state: {
    Model,
    Message,
    init: () => ({ model: { email: true, push: false } }),
    update: (model, message) =>
      Message.match(message, {
        ToggledEmail: ({ on }) => ({ model: { ...model, email: on } }),
        ToggledPush: ({ on }) => ({ model: { ...model, push: on } }),
      }),
  },
  view: ({ style, model, onMessage, h }) =>
    stack(h, [
      Switch.view(
        {
          id: 'email',
          checked: model.email,
          onToggle: on => onMessage(Message.ToggledEmail({ on })),
          label: 'Email notifications',
          description: 'A digest each morning.',
          position: 'end',
          style,
        },
        h,
      ),
      Switch.view(
        {
          id: 'push',
          checked: model.push,
          onToggle: on => onMessage(Message.ToggledPush({ on })),
          label: 'Push notifications',
          description: 'As things happen.',
          position: 'end',
          style,
        },
        h,
      ),
    ]),
})

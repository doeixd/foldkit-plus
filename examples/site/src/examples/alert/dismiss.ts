import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Alert, AlertSlots, Button, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Action = Recipes.Button.style({ variant: 'outline', size: 'sm' })

const Model = Schema.Struct({ shown: Schema.Boolean })
const Message = defineMessageUnion({ Dismissed: {}, Restored: {} })

// `onDismiss` draws the button and asks; the application's Model decides
// whether the next view draws the alert, so nothing hides it behind your back.
export default example({
  title: 'Dismissed',
  slots: AlertSlots,
  recipe: Recipes.Alert,
  state: {
    Model,
    Message,
    init: () => ({ model: { shown: true } }),
    update: (model, message) => {
      const shown = Message.match(message, { Dismissed: () => false, Restored: () => true })
      return { model: shown === model.shown ? model : { shown } }
    },
  },
  view: ({ style, model, onMessage, h }) =>
    model.shown
      ? Alert.view(
          {
            layout: 'inline',
            title: 'Your trial ends in 3 days',
            description: 'Add a card to keep every page.',
            onDismiss: onMessage(Message.Dismissed()),
            style,
          },
          h,
        )
      : Button.view(
          { label: 'Show the alert again', onClick: onMessage(Message.Restored()), style: Action },
          h,
        ),
})

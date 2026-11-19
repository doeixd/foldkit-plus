import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, Recipes, Toast, ToastSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Choose = Recipes.Button.style({ tone: 'neutral', variant: 'outline' })

const types = ['info', 'success', 'warning', 'error'] as const

// Each type on its own tint and edge: the recipe's `tone: 'rich'`, over the
// same markup, so nothing in the view changes.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Raised: { type: Schema.Literals(types) } }),
  Bundle.withChild('toasts', Bundles.Toast, { args: { id: 'toasts-rich' }, onOut: Bundle.ignore }),
)

export default example({
  title: 'Rich colors',
  slots: ToastSlots,
  recipe: Recipes.Toast,
  pins: { tone: 'rich' },
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update((model, { type }) =>
      App.children.toasts.helpers.show({ type, title: `A ${type} toast` })(model),
    ),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' })],
      [
        ...types.map(type =>
          Button.view(
            { label: type, onClick: onMessage(App.Message.Raised({ type })), style: Choose },
            h,
          ),
        ),
        Toast.view(
          {
            model: model.toasts,
            onMessage: message => onMessage(App.Message.GotToastsMessage({ message })),
            label: 'Notifications, rich',
            style,
          },
          h,
        ),
      ],
    ),
})

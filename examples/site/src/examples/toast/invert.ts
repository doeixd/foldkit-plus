import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, Recipes, Toast, ToastSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Primary = Recipes.Button.style({})

// The text's ink as the card, as Sonner's inverted toasts: dark on a light
// page, light on a dark one. The recipe's `tone: 'invert'`; its buttons keep
// their hover.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Raised: {} }),
  Bundle.withChild('toasts', Bundles.Toast, { args: { id: 'inverted' }, onOut: Bundle.ignore }),
)

export default example({
  title: 'Inverted',
  slots: ToastSlots,
  recipe: Recipes.Toast,
  pins: { tone: 'invert' },
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update(model =>
      App.children.toasts.helpers.show({
        type: 'success',
        title: 'Payment received',
        description: 'A receipt is on its way.',
        actions: [{ label: 'View receipt', value: 'receipt' }],
        cancel: 'Dismiss',
      })(model),
    ),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          { label: 'Take payment', onClick: onMessage(App.Message.Raised()), style: Primary },
          h,
        ),
        Toast.view(
          {
            model: model.toasts,
            onMessage: message => onMessage(App.Message.GotToastsMessage({ message })),
            label: 'Payments',
            style,
          },
          h,
        ),
      ],
    ),
})

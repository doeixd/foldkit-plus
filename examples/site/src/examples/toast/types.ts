import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, ButtonSlots, Recipes, Toast, ToastSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Choose = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))

const types = ['default', 'info', 'success', 'warning', 'error'] as const
const titles = {
  default: 'Event created',
  info: 'A new version is out',
  success: 'Changes saved',
  warning: 'Your session ends in 5 minutes',
  error: 'The file could not be read',
} as const

// One button per type; the application answers each with the stack's `show`
// helper. The stack's countdown, hold and swipe are the component's.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Raised: { type: Schema.Literals(types) } }),
  Bundle.withChild('toasts', Bundles.Toast, { args: { id: 'types' }, onOut: Bundle.ignore }),
)

export default example({
  title: 'Types',
  slots: ToastSlots,
  recipe: Recipes.Toast,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update((model, { type }) =>
      App.children.toasts.helpers.show({ type, title: titles[type] })(model),
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
            label: 'Notifications',
            style,
          },
          h,
        ),
      ],
    ),
})

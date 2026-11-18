import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, ButtonSlots, Recipes, Toast, ToastSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Primary = forSlots(ButtonSlots)(Recipes.Button({}))

// Actions and a cancel: each action dismisses the toast and says its `value`
// in `Acted`, which `onOut` answers (here dropped: an application undoes the
// archive there); the cancel only dismisses. `keepFocus` hands focus to a
// neighbouring toast's button when the toast that holds it leaves, instead of
// dropping it on the page.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Archived: {} }),
  Bundle.withChild('toasts', Bundles.Toast, { args: { id: 'archive' }, onOut: Bundle.ignore }),
)

export default example({
  title: 'Actions and a cancel',
  slots: ToastSlots,
  recipe: Recipes.Toast,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update(model =>
      App.children.toasts.helpers.show({
        title: 'Thread archived',
        description: 'It left your inbox.',
        actions: [
          { label: 'Undo', value: 'undo' },
          { label: 'Open', value: 'open' },
        ],
        cancel: 'Later',
      })(model),
    ),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          {
            label: 'Archive the thread',
            onClick: onMessage(App.Message.Archived()),
            style: Primary,
          },
          h,
        ),
        Toast.view(
          {
            model: model.toasts,
            onMessage: message => onMessage(App.Message.GotToastsMessage({ message })),
            label: 'Archive',
            mixins: Toast.keepFocus,
            style,
          },
          h,
        ),
      ],
    ),
})

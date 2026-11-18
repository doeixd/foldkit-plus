import { Duration, Effect, Match, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import * as Command from 'foldkit/command'
import {
  Bundles,
  Button,
  ButtonSlots,
  Recipes,
  Spinner,
  SpinnerSlots,
  Toast,
  ToastSlots,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Primary = forSlots(ButtonSlots)(Recipes.Button({}))
const Ring = forSlots(SpinnerSlots)(Recipes.Spinner({}))

// A promise toast: raise a loading toast, run the work as a Command, and
// settle the same toast with its outcome when the work's Message comes back.
// The id is the stack's own, read before the toast is shown.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Started: {}, Finished: { id: Schema.String } }),
  Bundle.withChild('toasts', Bundles.Toast, { args: { id: 'uploads' }, onOut: Bundle.ignore }),
)

const Upload = Command.define('Upload', {
  args: { id: Schema.String },
  messages: [App.Message.Finished],
  execute: ({ id }) =>
    Effect.sleep(Duration.millis(1500)).pipe(Effect.as(App.Message.Finished({ id }))),
})

export default example({
  title: 'A promise',
  slots: ToastSlots,
  recipe: Recipes.Toast,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update((model, message) =>
      Match.valueTags(message, {
        Started: () => {
          const id = Toast.nextId(model.toasts)
          const shown = App.children.toasts.helpers.show({
            type: 'loading',
            title: 'Uploading report.pdf…',
          })(model)
          return { model: shown.model, commands: [...(shown.commands ?? []), Upload({ id })] }
        },
        Finished: ({ id }) => {
          const settled = App.children.toasts.helpers.settle(id, {
            type: 'success',
            title: 'Uploaded',
            description: 'report.pdf is in your files.',
          })(model)
          return { model: settled.model, commands: [...(settled.commands ?? [])] }
        },
      }),
    ),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          { label: 'Upload report.pdf', onClick: onMessage(App.Message.Started()), style: Primary },
          h,
        ),
        Toast.view(
          {
            model: model.toasts,
            onMessage: message => onMessage(App.Message.GotToastsMessage({ message })),
            label: 'Uploads',
            icons: { loading: Spinner.view({ label: 'Uploading', style: Ring }, h) },
            style,
          },
          h,
        ),
      ],
    ),
})

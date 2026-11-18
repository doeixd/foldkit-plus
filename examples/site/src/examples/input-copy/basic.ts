import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import * as Command from 'foldkit/command'
import { ClipboardMessage } from 'foldkit-primitives/dom'
import { Bundles, InputCopy, InputCopySlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The key is the application's own field. The Bundle holds whether it just
// copied: pressing the button asks for `Copy`, and the clipboard's answer is
// folded into the Bundle, which resets the button after two seconds.
const App = Bundle.compose({ key: Schema.String }).pipe(
  Bundle.withMessages({ PressedCopy: {} }),
  Bundle.withChild('copy', Bundles.InputCopy, { args: { resetAfter: 2000 } }),
)

export default example({
  title: 'Basic',
  slots: InputCopySlots,
  recipe: Recipes.InputCopy,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { key: 'sk-live-4f9a2c71' },
    update: App.placements.update(model => ({
      model,
      commands: Command.mapMessages([InputCopy.Copy({ text: model.key })], answer =>
        App.Message.GotCopyMessage({
          message: ClipboardMessage.match(answer, {
            Copied: () => InputCopy.Message.Copied(),
            CopyFailed: () => InputCopy.Message.Failed(),
          }),
        }),
      ),
    })),
  }),
  view: ({ style, model, onMessage, h }) =>
    InputCopy.view(
      {
        id: 'api-key',
        label: 'API key',
        value: model.key,
        copied: model.copy.copied,
        failed: model.copy.failed,
        onCopy: onMessage(App.Message.PressedCopy()),
        style,
      },
      h,
    ),
})

import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import * as Command from 'foldkit/command'
import { ClipboardMessage } from 'foldkit-primitives/dom'
import { Bundles, InputCopy, InputCopySlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const App = Bundle.compose({ link: Schema.String }).pipe(
  Bundle.withMessages({ PressedCopy: {} }),
  Bundle.withChild('copy', Bundles.InputCopy, { args: {} }),
)

// `start` and `end` sit inside the box beside the value; `copyContent` is
// drawn in the button in place of its words, which stay in it for a screen
// reader, and `words` say them in your own language.
export default example({
  title: 'A link, with a glyph and words of your own',
  slots: InputCopySlots,
  recipe: Recipes.InputCopy,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { link: 'foldkit.dev/s/7Gq2' },
    update: App.placements.update(model => ({
      model,
      commands: Command.mapMessages([InputCopy.Copy({ text: model.link })], answer =>
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
        id: 'share-link',
        label: 'Lien de partage',
        value: model.link,
        copied: model.copy.copied,
        failed: model.copy.failed,
        onCopy: onMessage(App.Message.PressedCopy()),
        start: h.span([], ['https://']),
        end: h.span([], ['72 h']),
        copyContent: h.span([], [model.copy.copied ? '✓' : '⧉']),
        words: { copy: 'Copier', copied: 'Copié', failed: 'Échec de la copie' },
        style,
      },
      h,
    ),
})

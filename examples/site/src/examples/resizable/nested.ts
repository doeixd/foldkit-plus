import { Bundle } from 'foldkit-bundle'
import { Bundles, Recipes, Resizable, ResizableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Two splits, one in the other's second panel: each placed as a child of its
// own with its own bounds.
const App = Bundle.compose({}).pipe(
  Bundle.withChild('outer', Bundles.Resizable, { args: { share: 0.3 } }),
  Bundle.withChild('inner', Bundles.Resizable, { args: { share: 0.6 } }),
)

export default example({
  title: 'Nested both ways',
  slots: ResizableSlots,
  recipe: Recipes.Resizable,
  state: App.placements.runtime({ Model: App.Model, initial: {} }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ blockSize: '16rem', inlineSize: 'min(36rem, 100%)' })],
      [
        Resizable.view(
          {
            model: model.outer,
            onMessage: message => onMessage(App.Message.GotOuterMessage({ message })),
            label: 'Resize the file list',
            first: h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['Files']),
            // One over the other, inside the second panel: the split fills it.
            second: Resizable.view(
              {
                model: model.inner,
                onMessage: message => onMessage(App.Message.GotInnerMessage({ message })),
                orientation: 'vertical',
                label: 'Resize the editor',
                first: h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['Editor']),
                second: h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['Terminal']),
                style,
              },
              h,
            ),
            style,
          },
          h,
        ),
      ],
    ),
})

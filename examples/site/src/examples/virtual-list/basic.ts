import { Bundle } from 'foldkit-bundle'
import { Bundles, Recipes, VirtualList, VirtualListSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const FILES = Array.from(
  { length: 10_000 },
  (_, index) => `report-${String(index + 1).padStart(5, '0')}.pdf`,
)

// Ten thousand rows, of which only those in view are drawn, with spacers for
// the rest. The scroll state is the Bundle's Model (upstream's); the rows are
// the application's, passed to the view.
const App = Bundle.compose({}).pipe(
  Bundle.withChild('files', Bundles.VirtualList, {
    args: { id: 'basic-files', rowHeightPx: 36 },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Ten thousand rows',
  slots: VirtualListSlots,
  recipe: Recipes.VirtualList,
  state: App.placements.runtime({ Model: App.Model, initial: {} }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(24rem, 100%)' })],
      [
        VirtualList.view(
          {
            model: model.files,
            items: FILES,
            itemToKey: file => file,
            itemToView: file => h.span([], [file]),
            onMessage: message => onMessage(App.Message.GotFilesMessage({ message })),
            style,
          },
          h,
        ),
      ],
    ),
})

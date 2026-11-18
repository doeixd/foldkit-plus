import { Bundle } from 'foldkit-bundle'
import { Bundles, Recipes, VirtualList, VirtualListSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const NOTES = Array.from({ length: 2_000 }, (_, index) => ({
  id: `note-${index}`,
  text: 'A note that runs on. '.repeat((index % 5) + 1).trim(),
}))

// Rows of their own heights: `dynamicRowHeights` measures each row as it is
// drawn, starting from `rowHeightPx` as the estimate. `VirtualList.overlayBars`
// draws a thin bar over the list in place of the browser's.
const App = Bundle.compose({}).pipe(
  Bundle.withChild('notes', Bundles.VirtualList, {
    args: { id: 'heights-notes', rowHeightPx: 48 },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Rows of their own heights',
  slots: VirtualListSlots,
  recipe: Recipes.VirtualList,
  state: App.placements.runtime({ Model: App.Model, initial: {} }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(24rem, 100%)' })],
      [
        VirtualList.view(
          {
            model: model.notes,
            items: NOTES,
            itemToKey: note => note.id,
            itemToView: note => h.p([], [note.text]),
            dynamicRowHeights: true,
            onMessage: message => onMessage(App.Message.GotNotesMessage({ message })),
            style,
            mixins: VirtualList.overlayBars,
          },
          h,
        ),
      ],
    ),
})

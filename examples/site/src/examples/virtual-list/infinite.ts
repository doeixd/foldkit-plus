import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Recipes, VirtualList, VirtualListSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const PAGE = 50

// An endless feed: with `nearEndPx`, the Bundle reports `NearEnd` when a
// scroll brings the end of the list within 200 pixels of the view, and the
// application adds the next page there. Here the page is made on the spot; a
// real one would ask a server and add the rows when they come.
const App = Bundle.compose({ loaded: Schema.Number }).pipe(
  Bundle.withChild('feed', Bundles.VirtualList, {
    args: { id: 'infinite-feed', rowHeightPx: 36, nearEndPx: 200 },
    onOut: () => model => ({ model: { ...model, loaded: model.loaded + PAGE } }),
  }),
)

// One array per count, so a render that adds no rows hands the list the same one.
const drawn = new Map<number, ReadonlyArray<string>>()
const rows = (count: number): ReadonlyArray<string> => {
  const known = drawn.get(count)
  if (known !== undefined) return known
  const made = Array.from({ length: count }, (_, index) => `Entry ${index + 1}`)
  drawn.set(count, made)
  return made
}

export default example({
  title: 'Load more near the end',
  slots: VirtualListSlots,
  recipe: Recipes.VirtualList,
  state: App.placements.runtime({ Model: App.Model, initial: { loaded: PAGE } }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(24rem, 100%)' })],
      [
        VirtualList.view(
          {
            model: model.feed,
            items: rows(model.loaded),
            itemToKey: row => row,
            itemToView: row => h.span([], [row]),
            onMessage: message => onMessage(App.Message.GotFeedMessage({ message })),
            style,
          },
          h,
        ),
        h.p([], [`${model.loaded} rows loaded`]),
      ],
    ),
})

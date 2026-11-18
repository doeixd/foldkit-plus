import { Bundle } from 'foldkit-bundle'
import {
  Bundles,
  Button,
  ButtonSlots,
  Recipes,
  WindowList,
  WindowListSlots,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Jump = forSlots(ButtonSlots)(Recipes.Button({ variant: 'outline' }))

const TOWNS = Array.from({ length: 1_000 }, (_, index) => ({
  id: `town-${index}`,
  name: `Town ${index + 1}`,
}))

// A list that scrolls with the page, not in a box of its own: the rows in
// view of the window are drawn, and spacers as tall as the rest, so Space and
// End move it and the browser restores the place on back. `findable` lets
// find in page reach a row that is not drawn. A row far outside the window is
// not drawn either, so `helpers.reveal(index)` scrolls the page to it.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Jumped: {} }),
  Bundle.withChild('towns', Bundles.WindowList, {
    args: { id: 'basic-towns', estimatedHeight: 40 },
  }),
)

export default example({
  title: 'A thousand rows in the page',
  slots: WindowListSlots,
  recipe: Recipes.WindowList,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update(model => App.children.towns.helpers.reveal(799, 'center')(model)),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          { label: 'Go to Town 800', onClick: onMessage(App.Message.Jumped()), style: Jump },
          h,
        ),
        WindowList.view(
          {
            model: model.towns,
            items: TOWNS,
            itemToKey: town => town.id,
            itemToView: town => h.span([], [town.name]),
            findable: town => town.name,
            label: 'Towns',
            onMessage: message => onMessage(App.Message.GotTownsMessage({ message })),
            style,
          },
          h,
        ),
      ],
    ),
})

import { Bundle } from 'foldkit-bundle'
import {
  Bundles,
  Button,
  ButtonSlots,
  FloatingPanel,
  FloatingPanelSlots,
  Recipes,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Primary = forSlots(ButtonSlots)(Recipes.Button({}))

// `helpers.dock` (the `Docked` Message) puts the panel along an edge of the
// viewport as measured when it lands, `thickness` across and the whole of the
// other side. It stays a window: drag it away and it floats again.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ DockedEnd: {} }),
  Bundle.withChild('panel', Bundles.FloatingPanel, {
    args: { id: 'docked-panel', rect: { x: 80, y: 120, width: 280, height: 160 }, open: true },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Docked to an edge',
  slots: FloatingPanelSlots,
  recipe: Recipes.FloatingPanel,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update(model => App.children.panel.helpers.dock('right', 300)(model)),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          {
            label: 'Dock to the right',
            onClick: onMessage(App.Message.DockedEnd()),
            style: Primary,
          },
          h,
        ),
        FloatingPanel.view(
          {
            model: model.panel,
            onMessage: message => onMessage(App.Message.GotPanelMessage({ message })),
            title: 'Inspector',
            content: h.p([], ['Docked, it spans the viewport from top to bottom.']),
            style,
          },
          h,
        ),
      ],
    ),
})

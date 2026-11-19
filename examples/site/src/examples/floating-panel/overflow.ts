import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, FloatingPanel, FloatingPanelSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Primary = Recipes.Button.style({})

// `overflow: true` lets the panel be dragged past the edges of the viewport,
// as a palette that is parked half off screen is.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Opened: {} }),
  Bundle.withChild('panel', Bundles.FloatingPanel, {
    args: {
      id: 'overflow-panel',
      rect: { x: 80, y: 120, width: 280, height: 140 },
      overflow: true,
    },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Past the edges',
  slots: FloatingPanelSlots,
  recipe: Recipes.FloatingPanel,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update(model =>
      App.children.panel.helpers.openBeside('overflow-opener')(model),
    ),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          {
            label: 'Open the palette',
            onClick: onMessage(App.Message.Opened()),
            attributes: { button: [h.Id('overflow-opener')] },
            style: Primary,
          },
          h,
        ),
        FloatingPanel.view(
          {
            model: model.panel,
            onMessage: message => onMessage(App.Message.GotPanelMessage({ message })),
            title: 'Palette',
            content: h.p([], ['Drag it half way off the screen.']),
            style,
            mixins: FloatingPanel.focusReturn,
          },
          h,
        ),
      ],
    ),
})

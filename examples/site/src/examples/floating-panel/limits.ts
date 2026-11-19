import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, FloatingPanel, FloatingPanelSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Primary = Recipes.Button.style({})

// `grid` snaps every move and resize to multiples of 40 pixels, and `min` and
// `max` bound the size a resize reaches. They are the Bundle's args, kept in
// its Model, so a drag and the arrow keys read the one copy.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Opened: {} }),
  Bundle.withChild('panel', Bundles.FloatingPanel, {
    args: {
      id: 'limits-panel',
      rect: { x: 80, y: 120, width: 280, height: 200 },
      grid: 40,
      min: { width: 200, height: 120 },
      max: { width: 440, height: 320 },
    },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'A grid and size limits',
  slots: FloatingPanelSlots,
  recipe: Recipes.FloatingPanel,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update(model =>
      App.children.panel.helpers.openBeside('limits-opener')(model),
    ),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          {
            label: 'Open the panel',
            onClick: onMessage(App.Message.Opened()),
            attributes: { button: [h.Id('limits-opener')] },
            style: Primary,
          },
          h,
        ),
        FloatingPanel.view(
          {
            model: model.panel,
            onMessage: message => onMessage(App.Message.GotPanelMessage({ message })),
            title: 'Snapped',
            content: h.p([], ['Moves and resizes land on a 40 pixel grid, 200 to 440 wide.']),
            style,
            mixins: FloatingPanel.focusReturn,
          },
          h,
        ),
      ],
    ),
})

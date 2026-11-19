import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, FloatingPanel, FloatingPanelSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Primary = Recipes.Button.style({})

// `openBeside` opens the panel next to the element with that id: a Command
// reads the opener's box after the update, and `Placed` puts the panel there,
// kept within the viewport. Its size stays the Model's.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Opened: {} }),
  Bundle.withChild('panel', Bundles.FloatingPanel, {
    args: { id: 'beside-panel', rect: { x: 0, y: 0, width: 280, height: 140 } },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Beside its opener',
  slots: FloatingPanelSlots,
  recipe: Recipes.FloatingPanel,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update(model =>
      App.children.panel.helpers.openBeside('beside-opener', { side: 'bottom', gap: 8 })(model),
    ),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          {
            label: 'Open below me',
            onClick: onMessage(App.Message.Opened()),
            attributes: { button: [h.Id('beside-opener')] },
            style: Primary,
          },
          h,
        ),
        FloatingPanel.view(
          {
            model: model.panel,
            onMessage: message => onMessage(App.Message.GotPanelMessage({ message })),
            title: 'Details',
            content: h.p([], ['Opened 8 pixels below the button, aligned to its start.']),
            style,
            mixins: FloatingPanel.focusReturn,
          },
          h,
        ),
      ],
    ),
})

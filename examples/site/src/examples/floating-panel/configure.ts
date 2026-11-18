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

// What every window of an application starts from, said once: focus goes back
// to what opened it, and Escape is left to the page. A preset is a named set
// over it. The limits are the Model's (`init`), not a preset's.
const AppWindow = FloatingPanel.configure({
  base: { mixins: FloatingPanel.focusReturn, closeOnEscape: false },
  presets: { tool: { controls: ['close'], resizable: false } },
})

const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Opened: {} }),
  Bundle.withChild('panel', Bundles.FloatingPanel, {
    args: { id: 'configure-panel', rect: { x: 80, y: 120, width: 280, height: 140 } },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Configure once',
  slots: FloatingPanelSlots,
  recipe: Recipes.FloatingPanel,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update(model =>
      App.children.panel.helpers.openBeside('configure-opener')(model),
    ),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          {
            label: 'Open the tool',
            onClick: onMessage(App.Message.Opened()),
            attributes: { button: [h.Id('configure-opener')] },
            style: Primary,
          },
          h,
        ),
        AppWindow.view(
          {
            preset: 'tool',
            model: model.panel,
            onMessage: message => onMessage(App.Message.GotPanelMessage({ message })),
            title: 'Tool',
            content: h.p([], ['Closed by its button only.']),
            style,
          },
          h,
        ),
      ],
    ),
})

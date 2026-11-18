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

// Not draggable, not resizable, and only a close button: a card that floats
// where it was put. Without the drag trigger and the corner the panel draws no
// tab stop of its own, so the arrows have nothing to move.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Opened: {} }),
  Bundle.withChild('tip', Bundles.FloatingPanel, {
    args: { id: 'fixed-tip', rect: { x: 80, y: 140, width: 280, height: 120 } },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Fixed in place',
  slots: FloatingPanelSlots,
  recipe: Recipes.FloatingPanel,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update(model => App.children.tip.helpers.open()(model)),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          { label: 'Show the tip', onClick: onMessage(App.Message.Opened()), style: Primary },
          h,
        ),
        FloatingPanel.view(
          {
            model: model.tip,
            onMessage: message => onMessage(App.Message.GotTipMessage({ message })),
            title: 'Tip',
            content: h.p([], ['Press Escape or the button to put it away.']),
            draggable: false,
            resizable: false,
            controls: ['close'],
            style,
            mixins: FloatingPanel.focusReturn,
          },
          h,
        ),
      ],
    ),
})

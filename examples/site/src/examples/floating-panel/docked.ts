import { Match, Schema } from 'effect'
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
const Plain = forSlots(ButtonSlots)(Recipes.Button({ variant: 'outline', size: 'sm' }))

// `helpers.dock` (the `Docked` Message) lays the panel along an edge of the
// viewport as measured when it lands, `thickness` across and the whole of the
// other side. It stays a window: drag it away and it floats again.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Opened: {}, DockedTo: { edge: Schema.Literals(['left', 'right']) } }),
  Bundle.withChild('panel', Bundles.FloatingPanel, {
    args: { id: 'docked-panel', rect: { x: 80, y: 120, width: 280, height: 180 } },
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
    update: App.placements.update((model, message) =>
      Match.value(message).pipe(
        Match.tagsExhaustive({
          Opened: () => App.children.panel.helpers.openBeside('docked-opener')(model),
          DockedTo: ({ edge }) => App.children.panel.helpers.dock(edge, 300)(model),
        }),
      ),
    ),
  }),
  view: ({ style, model, onMessage, h }) => {
    const dock = (edge: 'left' | 'right', label: string) =>
      Button.view({ label, onClick: onMessage(App.Message.DockedTo({ edge })), style: Plain }, h)
    return h.div(
      [],
      [
        Button.view(
          {
            label: 'Open the inspector',
            onClick: onMessage(App.Message.Opened()),
            attributes: { button: [h.Id('docked-opener')] },
            style: Primary,
          },
          h,
        ),
        FloatingPanel.view(
          {
            model: model.panel,
            onMessage: message => onMessage(App.Message.GotPanelMessage({ message })),
            title: 'Inspector',
            content: h.div(
              [h.Style({ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' })],
              [dock('left', 'Dock left'), dock('right', 'Dock right')],
            ),
            style,
            mixins: FloatingPanel.focusReturn,
          },
          h,
        ),
      ],
    )
  },
})

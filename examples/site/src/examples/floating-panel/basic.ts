import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, FloatingPanel, FloatingPanelSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Primary = Recipes.Button.style({})

// A window over the page: the header drags it, the edges and corners resize
// it, and the arrows do both from the keys. Where it is and how big is the
// Bundle's Model. `FloatingPanel.focusReturn` gives focus back to the button
// when it closes; it is opt-in, as it sends no Message.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Opened: {} }),
  Bundle.withChild('notes', Bundles.FloatingPanel, {
    args: { id: 'basic-notes', rect: { x: 80, y: 120, width: 320, height: 220 } },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Notes',
  slots: FloatingPanelSlots,
  recipe: Recipes.FloatingPanel,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update(model =>
      App.children.notes.helpers.openBeside('basic-opener')(model),
    ),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          {
            label: 'Open notes',
            onClick: onMessage(App.Message.Opened()),
            attributes: { button: [h.Id('basic-opener')] },
            style: Primary,
          },
          h,
        ),
        FloatingPanel.view(
          {
            model: model.notes,
            onMessage: message => onMessage(App.Message.GotNotesMessage({ message })),
            title: 'Notes',
            content: h.p([], ['Drag the header, resize from an edge, or use the arrows.']),
            style,
            mixins: FloatingPanel.focusReturn,
          },
          h,
        ),
      ],
    ),
})

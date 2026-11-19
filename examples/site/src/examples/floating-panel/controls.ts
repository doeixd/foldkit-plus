import { Bundle } from 'foldkit-bundle'
import { Bundles, Button, FloatingPanel, FloatingPanelSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Primary = Recipes.Button.style({})

// `controls` names the buttons the header draws, and `words` their names:
// here only maximize and close, with the words of a different language.
// Restore appears with whichever stage change was made, so a panel that can
// be maximized can come back.
const App = Bundle.compose({}).pipe(
  Bundle.withMessages({ Opened: {} }),
  Bundle.withChild('panel', Bundles.FloatingPanel, {
    args: { id: 'controls-panel', rect: { x: 80, y: 120, width: 320, height: 180 } },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Controls and words',
  slots: FloatingPanelSlots,
  recipe: Recipes.FloatingPanel,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    update: App.placements.update(model =>
      App.children.panel.helpers.openBeside('controls-opener')(model),
    ),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          {
            label: 'Ouvrir',
            onClick: onMessage(App.Message.Opened()),
            attributes: { button: [h.Id('controls-opener')] },
            style: Primary,
          },
          h,
        ),
        FloatingPanel.view(
          {
            model: model.panel,
            onMessage: message => onMessage(App.Message.GotPanelMessage({ message })),
            title: 'Notes',
            content: h.p([], ['Agrandir, restaurer, fermer.']),
            controls: ['maximize', 'close'],
            words: {
              maximize: 'Agrandir',
              restore: 'Restaurer',
              close: 'Fermer',
              move: 'Déplacer {title}',
              resize: 'Redimensionner {title}',
            },
            style,
            mixins: FloatingPanel.focusReturn,
          },
          h,
        ),
      ],
    ),
})

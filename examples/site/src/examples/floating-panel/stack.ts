import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, FloatingPanel, FloatingPanelSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Several panels stack by `order`, the application's list of their ids from
// the bottom. A press or focus inside one reports `Raised`, which `onOut`
// folds with `FloatingPanel.raise`; the topmost is marked `data-topmost`.
const App = Bundle.compose({ order: Schema.Array(Schema.String) }).pipe(
  Bundle.withChild('notes', Bundles.FloatingPanel, {
    args: { id: 'stack-notes', rect: { x: 20, y: 120, width: 260, height: 160 }, open: true },
    onOut: out => model => ({
      model: { ...model, order: FloatingPanel.raise(model.order, out.id) },
    }),
  }),
  Bundle.withChild('chat', Bundles.FloatingPanel, {
    args: { id: 'stack-chat', rect: { x: 150, y: 170, width: 260, height: 160 }, open: true },
    onOut: out => model => ({
      model: { ...model, order: FloatingPanel.raise(model.order, out.id) },
    }),
  }),
)

export default example({
  title: 'A stack of two',
  slots: FloatingPanelSlots,
  recipe: Recipes.FloatingPanel,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { order: ['stack-notes', 'stack-chat'] },
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        FloatingPanel.view(
          {
            model: model.notes,
            onMessage: message => onMessage(App.Message.GotNotesMessage({ message })),
            title: 'Notes',
            content: h.p([], ['Press either panel to bring it to the front.']),
            order: model.order,
            style,
          },
          h,
        ),
        FloatingPanel.view(
          {
            model: model.chat,
            onMessage: message => onMessage(App.Message.GotChatMessage({ message })),
            title: 'Chat',
            content: h.p([], ['The one on top is marked data-topmost.']),
            order: model.order,
            style,
          },
          h,
        ),
      ],
    ),
})

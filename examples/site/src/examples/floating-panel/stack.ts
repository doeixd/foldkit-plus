import { Schema } from 'effect'
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

// Several panels stack by `order`, the application's list of their ids from
// the bottom. A press or focus inside one reports `Raised`, which `onOut`
// folds with `FloatingPanel.raise`; the topmost is marked `data-topmost`.
const App = Bundle.compose({ order: Schema.Array(Schema.String) }).pipe(
  Bundle.withMessages({ Opened: {} }),
  Bundle.withChild('notes', Bundles.FloatingPanel, {
    args: { id: 'stack-notes', rect: { x: 40, y: 140, width: 260, height: 160 } },
    onOut: out => model => ({
      model: { ...model, order: FloatingPanel.raise(model.order, out.id) },
    }),
  }),
  Bundle.withChild('chat', Bundles.FloatingPanel, {
    args: { id: 'stack-chat', rect: { x: 170, y: 190, width: 260, height: 160 } },
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
    update: App.placements.update(model => {
      const notes = App.children.notes.helpers.openBeside('stack-opener')(model)
      const chat = App.children.chat.helpers.openBeside('stack-opener', { side: 'right' })(
        notes.model,
      )
      return { model: chat.model, commands: [...(notes.commands ?? []), ...(chat.commands ?? [])] }
    }),
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          {
            label: 'Open both',
            onClick: onMessage(App.Message.Opened()),
            attributes: { button: [h.Id('stack-opener')] },
            style: Primary,
          },
          h,
        ),
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

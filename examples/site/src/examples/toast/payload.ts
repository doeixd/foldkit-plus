import { Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { SlotView } from 'foldkit-mixins'
import {
  Button,
  ButtonSlots,
  Item,
  ItemSlots,
  Recipes,
  Toast,
  ToastSlots,
  ToastView,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Primary = forSlots(ButtonSlots)(Recipes.Button({}))
const Dismiss = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'ghost', size: 'sm' }),
)
// The toast's card pads the notice, so the row adds none of its own.
const Notice = forSlots(ItemSlots)(
  Recipes.Item.extend({ variants: { density: { comfortable: { root: { padding: '0' } } } } })({}),
)

// Your own payload: `ToastView.make(schema)` binds upstream's toast to what an
// entry holds, and the application draws each entry, with the stack's
// countdown, hold and swipe still the component's. The payload toast's state
// is the application's: it declares the field and folds the stack itself.
const Payload = Schema.Struct({ title: Schema.String, text: Schema.String })
// Annotated: the inferred type names a foldkit internal module.
const Notices: ReturnType<typeof ToastView.make<typeof Payload.Type, typeof Payload.Encoded>> =
  ToastView.make(Payload)

const Message = defineMessageUnion({
  Saved: {},
  GotNotices: { message: Notices.Message },
})

const got = (commands: ReadonlyArray<Command.Command<typeof Notices.Message.Type>> = []) =>
  Command.mapMessages(commands, message => Message.GotNotices({ message }))

export default example({
  title: 'Your own payload',
  slots: ToastSlots,
  recipe: Recipes.Toast,
  state: {
    Model: Schema.Struct({ notices: Notices.Model }),
    Message,
    init: () => ({ model: { notices: Notices.init({ id: 'notices' }) } }),
    update: (model, message) =>
      Message.match(message, {
        Saved: () => {
          const shown = Notices.show(model.notices, {
            payload: { title: 'Draft saved', text: 'Autosaved a moment ago.' },
            variant: 'Success',
          })
          return { model: { notices: shown.model }, commands: got(shown.commands) }
        },
        GotNotices: ({ message }) => {
          const next = Notices.update(model.notices, message)
          return { model: { notices: next.model }, commands: got(next.commands) }
        },
      }),
  },
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          { label: 'Save draft', onClick: onMessage(Message.Saved()), style: Primary },
          h,
        ),
        h.submodel({
          slotId: model.notices.id,
          model: model.notices,
          view: Notices.view,
          viewInputs: {
            position: 'BottomRight',
            entryToView: (entry, handlers) =>
              Item.view(
                {
                  title: entry.payload.title,
                  description: entry.payload.text,
                  actions: h.button(
                    SlotView.buildersFor(ButtonSlots, [Dismiss.mixin], {
                      input: undefined,
                      h,
                    }).button.attrs([
                      ...handlers.dismiss,
                      h.Type('button'),
                      h.AriaLabel('Dismiss'),
                    ]),
                    ['✕'],
                  ),
                  style: Notice,
                },
                h,
              ),
            toView: Toast.toView([style.mixin], { h }, ({ container, entries }) =>
              h.div(
                container,
                entries.map(entry => h.keyed('div')(entry.id, entry.attributes, [entry.content])),
              ),
            ),
          },
          toParentMessage: message => onMessage(Message.GotNotices({ message })),
        }),
      ],
    ),
})

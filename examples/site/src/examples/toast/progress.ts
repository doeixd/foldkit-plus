import { Duration, Effect, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import {
  Button,
  ButtonSlots,
  Progress,
  ProgressSlots,
  Recipes,
  Toast,
  ToastSlots,
  ToastView,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Primary = forSlots(ButtonSlots)(Recipes.Button({}))
const Bar = forSlots(ProgressSlots)(Recipes.Progress({}))

// A toast that shows progress: the entry holds a percentage, and `revise`
// replaces it as the work reports, keeping the toast's place and its
// animation. The toast is sticky while it runs and dismissed at the end.
const Upload = Schema.Struct({ name: Schema.String, percent: Schema.Number })
// Annotated: the inferred type names a foldkit internal module.
const Uploads: ReturnType<typeof ToastView.make<typeof Upload.Type, typeof Upload.Encoded>> =
  ToastView.make(Upload)

const Message = defineMessageUnion({
  Started: {},
  Advanced: { id: Schema.String, percent: Schema.Number },
  GotUploads: { message: Uploads.Message },
})

const Advance = Command.define('Advance', {
  args: { id: Schema.String, percent: Schema.Number },
  messages: [Message.Advanced],
  execute: ({ id, percent }) =>
    Effect.sleep(Duration.millis(500)).pipe(Effect.as(Message.Advanced({ id, percent }))),
})

const got = (commands: ReadonlyArray<Command.Command<typeof Uploads.Message.Type>> = []) =>
  Command.mapMessages(commands, message => Message.GotUploads({ message }))

export default example({
  title: 'Progress',
  slots: ToastSlots,
  recipe: Recipes.Toast,
  state: {
    Model: Schema.Struct({ uploads: Uploads.Model }),
    Message,
    init: () => ({ model: { uploads: Uploads.init({ id: 'progress' }) } }),
    update: (model, message) =>
      Message.match(message, {
        Started: () => {
          const shown = Uploads.show(model.uploads, {
            payload: { name: 'holiday.mov', percent: 0 },
            sticky: true,
          })
          const entry = shown.model.entries[0]
          return {
            model: { uploads: shown.model },
            commands: [
              ...got(shown.commands),
              ...(entry === undefined ? [] : [Advance({ id: entry.id, percent: 25 })]),
            ],
          }
        },
        Advanced: ({ id, percent }) => {
          const revised = Uploads.revise(model.uploads, id, { name: 'holiday.mov', percent })
          if (percent < 100) {
            return {
              model: { uploads: revised },
              commands: [Advance({ id, percent: percent + 25 })],
            }
          }
          const done = Uploads.dismiss(revised, id)
          return { model: { uploads: done.model }, commands: got(done.commands) }
        },
        GotUploads: ({ message }) => {
          const next = Uploads.update(model.uploads, message)
          return { model: { uploads: next.model }, commands: got(next.commands) }
        },
      }),
  },
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        Button.view(
          { label: 'Upload holiday.mov', onClick: onMessage(Message.Started()), style: Primary },
          h,
        ),
        h.submodel({
          slotId: model.uploads.id,
          model: model.uploads,
          view: Uploads.view,
          viewInputs: {
            position: 'BottomRight',
            entryToView: entry =>
              h.div(
                [h.Style({ display: 'grid', gap: '0.5rem', minInlineSize: '14rem' })],
                [
                  h.strong([], [`Uploading ${entry.payload.name}`]),
                  Progress.view(
                    {
                      id: `${entry.id}-bar`,
                      label: entry.payload.name,
                      value: Option.some(entry.payload.percent),
                      showValue: true,
                      style: Bar,
                    },
                    h,
                  ),
                ],
              ),
            toView: Toast.toView([style.mixin], { h }, ({ container, entries }) =>
              h.div(
                container,
                entries.map(entry => h.keyed('div')(entry.id, entry.attributes, [entry.content])),
              ),
            ),
          },
          toParentMessage: message => onMessage(Message.GotUploads({ message })),
        }),
      ],
    ),
})

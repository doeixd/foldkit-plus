import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Button, ButtonSlots, Recipes, Spinner, SpinnerSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

const Refused = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))
const Wheel = forSlots(SpinnerSlots)(Recipes.Spinner({ size: 'sm', tone: 'current' }))

const Model = Schema.Struct({ saving: Schema.Boolean })
const Message = defineMessageUnion({ Started: {}, Finished: {} })

// `busy` is `aria-busy` and a press that does nothing; the button stays
// focusable. It draws no spinner, so no page pays for one: the application
// composes its own into `icon`. `invalid` is its own mark (`data-invalid`).
export default example({
  title: 'Busy and invalid',
  slots: ButtonSlots,
  recipe: Recipes.Button,
  state: {
    Model,
    Message,
    init: () => ({ model: { saving: false } }),
    update: (model, message) => ({
      model: modifyFields(model, { saving: () => message._tag === 'Started' }),
    }),
  },
  view: ({ style, model, onMessage, h }) =>
    row(h, [
      Button.view(
        {
          label: model.saving ? 'Saving…' : 'Save changes',
          busy: model.saving,
          ...(model.saving ? { icon: Spinner.view({ style: Wheel }, h) } : {}),
          onClick: onMessage(Message.Started()),
          style,
        },
        h,
      ),
      Button.view(
        { label: 'Finish', onClick: onMessage(Message.Finished()), disabled: !model.saving, style },
        h,
      ),
      Button.view({ label: 'Choose a plan', invalid: true, style: Refused }, h),
    ]),
})

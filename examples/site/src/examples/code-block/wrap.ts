import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Button, CodeBlock, CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

const Toggle = Recipes.Button.style({ variant: 'outline', size: 'sm' })

const LOG = [
  '[12:04:01] GET /api/projects/7f3c2a/members?include=roles,invitations&page=1 200 34ms',
  '[12:04:02] POST /api/projects/7f3c2a/invitations {"email":"grace@example.com","role":"editor"} 201 58ms',
].join('\n')

const Model = Schema.Struct({ wrap: Schema.Boolean })
const Message = defineMessageUnion({ Toggled: {} })

// A long line scrolls sideways; `wrap` folds it inside the frame instead.
export default example({
  title: 'Long lines',
  slots: CodeBlockSlots,
  recipe: Recipes.CodeBlock,
  state: {
    Model,
    Message,
    init: () => ({ model: { wrap: false } }),
    update: model => ({ model: { wrap: !model.wrap } }),
  },
  view: ({ style, model, onMessage, h }) =>
    stack(h, [
      Button.view(
        {
          label: 'Wrap lines',
          pressed: model.wrap,
          onClick: onMessage(Message.Toggled()),
          style: Toggle,
        },
        h,
      ),
      CodeBlock.view({ code: LOG, language: 'log', wrap: model.wrap, style }, h),
    ]),
})

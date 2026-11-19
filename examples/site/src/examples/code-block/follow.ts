import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Button, CodeBlock, CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

const Write = Recipes.Button.style({ variant: 'outline', size: 'sm' })

// A body that scrolls: `extend` gives it a height of its own.
const Short = Recipes.CodeBlock.extend({
  base: { body: { maxBlockSize: '9rem', overflowY: 'auto' } },
})

const Model = Schema.Struct({ lines: Schema.Number })
const Message = defineMessageUnion({ Wrote: {} })

// Code an agent is writing grows at the end. `CodeBlock.follow` in `mixins`
// keeps the end in view while the reader is there; scroll up and it waits.
export default example({
  title: 'Written live',
  slots: CodeBlockSlots,
  recipe: Short,
  state: {
    Model,
    Message,
    init: () => ({ model: { lines: 4 } }),
    update: model => ({ model: { lines: model.lines + 1 } }),
  },
  view: ({ style, model, onMessage, h }) =>
    stack(h, [
      CodeBlock.view(
        {
          code: Array.from({ length: model.lines }, (_, index) => `step ${index + 1}: done`).join(
            '\n',
          ),
          title: 'agent.log',
          lineNumbers: true,
          mixins: CodeBlock.follow,
          style,
        },
        h,
      ),
      Button.view({ label: 'Write a line', onClick: onMessage(Message.Wrote()), style: Write }, h),
    ]),
})

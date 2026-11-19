import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { CodeBlock, CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const SOURCE = Array.from(
  { length: 14 },
  (_, index) => `  { id: ${index + 1}, name: "Item ${index + 1}" },`,
).join('\n')

const Model = Schema.Struct({ expanded: Schema.Boolean })
const Message = defineMessageUnion({ Toggled: {} })

// `collapsed` clips the block to its first lines under a fade and draws a
// button for the rest; every line stays in the page, so a find or a copy
// reaches all of it. Whether the block is open is the application's: the
// button's Message flips `expanded`, and the block then offers to close.
export default example({
  title: 'Collapsed',
  slots: CodeBlockSlots,
  recipe: Recipes.CodeBlock,
  state: {
    Model,
    Message,
    init: () => ({ model: { expanded: false } }),
    update: model => ({ model: { expanded: !model.expanded } }),
  },
  view: ({ style, model, onMessage, h }) =>
    CodeBlock.view(
      {
        code: SOURCE,
        title: 'items.ts',
        lineNumbers: true,
        collapsed: {
          lines: 5,
          expanded: model.expanded,
          onToggle: onMessage(Message.Toggled()),
        },
        style,
      },
      h,
    ),
})

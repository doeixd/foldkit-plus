import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { CodeBlock, CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const SOURCE = Array.from(
  { length: 14 },
  (_, index) => `  { id: ${index + 1}, name: "Item ${index + 1}" },`,
).join('\n')

const Model = Schema.Struct({ expanded: Schema.Boolean })
const Message = defineMessageUnion({ Expanded: {} })

// `collapsed` draws the first lines and a button that asks for the rest;
// whether the block is open is the application's, so it draws the block
// without `collapsed` once the button is pressed.
export default example({
  title: 'Collapsed',
  slots: CodeBlockSlots,
  recipe: Recipes.CodeBlock,
  state: {
    Model,
    Message,
    init: () => ({ model: { expanded: false } }),
    update: model => ({ model: model.expanded ? model : { expanded: true } }),
  },
  view: ({ style, model, onMessage, h }) =>
    CodeBlock.view(
      {
        code: SOURCE,
        title: 'items.ts',
        lineNumbers: true,
        ...(model.expanded
          ? {}
          : { collapsed: { lines: 5, onExpand: onMessage(Message.Expanded()) } }),
        style,
      },
      h,
    ),
})

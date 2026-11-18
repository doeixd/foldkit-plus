import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { CodeBlock, CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const SOURCE = 'const a = 1\nconst b = 2\nconst c = a + b\nconsole.log(c)'

const Model = Schema.Struct({ selected: Schema.Array(Schema.Number) })
const Message = defineMessageUnion({ Toggled: { line: Schema.Number } })

// `onLineSelect` makes each line's number a button. Which lines are chosen is
// the application's: it marks them `selected`, which presses their buttons.
export default example({
  title: 'Choosing lines',
  slots: CodeBlockSlots,
  recipe: Recipes.CodeBlock,
  state: {
    Model,
    Message,
    init: () => ({ model: { selected: [3] } }),
    update: (model, { line }) => ({
      model: {
        selected: model.selected.includes(line)
          ? model.selected.filter(each => each !== line)
          : [...model.selected, line],
      },
    }),
  },
  view: ({ style, model, onMessage, h }) =>
    CodeBlock.view(
      {
        code: SOURCE,
        title: 'sum.ts',
        onLineSelect: line => onMessage(Message.Toggled({ line })),
        marks: model.selected.map(line => ({ line, kind: 'selected' })),
        style,
      },
      h,
    ),
})

import { CodeBlock, CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const SOURCE = [
  'const update = (model: Model, message: Message) =>',
  '  Message.match(message, {',
  '    Typed: ({ text }) => ({ model: { ...model, text } }),',
  '    Cleared: () => ({ model: { ...model, text: "" } }),',
  '  })',
].join('\n')

// An excerpt starts at its own line (`startLine`), and every mark counts from
// it: the line a walkthrough is about is `highlight`, the rest `dim`.
export default example({
  title: 'Focus on a line',
  slots: CodeBlockSlots,
  recipe: Recipes.CodeBlock,
  view: ({ style, h }) =>
    CodeBlock.view(
      {
        code: SOURCE,
        title: 'update.ts',
        lineNumbers: true,
        startLine: 24,
        marks: [
          { line: 24, kind: 'dim' },
          { line: 25, kind: 'dim' },
          { line: 26, kind: 'highlight' },
          { line: 27, kind: 'dim' },
          { line: 28, kind: 'dim' },
        ],
        style,
      },
      h,
    ),
})

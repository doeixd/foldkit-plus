import { CodeBlock, CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A diff is the lines, each marked `added` or `removed`, and a gutter that
// says so in place of a number. Each mark tints the whole row.
const lines = [
  { text: 'export const view = (model: Model) =>', change: ' ' },
  { text: '  h.p([], [model.name])', change: '-' },
  { text: '  h.p([h.Class("name")], [model.name])', change: '+' },
  { text: '  h.small([], [model.role])', change: '+' },
]

export default example({
  title: 'A diff',
  slots: CodeBlockSlots,
  recipe: Recipes.CodeBlock,
  view: ({ style, h }) =>
    CodeBlock.view(
      {
        code: lines.map(line => line.text).join('\n'),
        title: 'profile.ts',
        gutter: line => lines[line - 1]?.change ?? ' ',
        marks: lines.flatMap((line, index) =>
          line.change === ' '
            ? []
            : [{ line: index + 1, kind: line.change === '+' ? 'added' : 'removed' }],
        ),
        style,
      },
      h,
    ),
})

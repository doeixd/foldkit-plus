import { CodeBlock, CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const SOURCE = 'export const total = 3 // items\nexport const done = "yes"'

// Highlighting is the caller's: pass the tokens a tokenizer found as offsets
// into the code (`foldkit-richtext-code-shiki` finds them), and each is drawn
// with its `kind`, which the theme colours. The text of the block is the code.
export default example({
  title: 'Tokens and line numbers',
  slots: CodeBlockSlots,
  recipe: Recipes.CodeBlock,
  view: ({ style, h }) =>
    CodeBlock.view(
      {
        code: SOURCE,
        title: 'totals.ts',
        lineNumbers: true,
        tokens: [
          { from: 0, to: 6, kind: 'syntax-keyword' },
          { from: 7, to: 12, kind: 'syntax-keyword' },
          { from: 19, to: 20, kind: 'syntax-operator' },
          { from: 21, to: 22, kind: 'syntax-number' },
          { from: 23, to: 31, kind: 'syntax-comment' },
          { from: 32, to: 38, kind: 'syntax-keyword' },
          { from: 39, to: 44, kind: 'syntax-keyword' },
          { from: 52, to: 57, kind: 'syntax-string' },
        ],
        style,
      },
      h,
    ),
})

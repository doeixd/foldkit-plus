import { Style } from 'foldkit-mixins'
import { CodeBlock, CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { t } from '../../snippets/theme.js'

// A mark of your own is a kind the recipe does not know: `extend` gives the
// line a tint for it, read from `data-mark` as the shipped marks are.
const Reviewed = Recipes.CodeBlock.extend({
  base: {
    line: Style.states({ todo: { background: t.info.subtle, fontStyle: 'italic' } }, 'data-mark'),
  },
})

export default example({
  title: 'A mark of your own',
  slots: CodeBlockSlots,
  recipe: Reviewed,
  view: ({ style, h }) =>
    CodeBlock.view(
      {
        code: 'const retries = 3\nconst timeout = 5_000 // TODO: read from config\nexport { retries, timeout }',
        lineNumbers: true,
        marks: [{ line: 2, kind: 'todo' }],
        style,
      },
      h,
    ),
})

import { CodeBlock, CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// `header: 'float'` drops the bar: the copy button pins to the code's corner,
// for a command a reader only copies.
export default example({
  title: 'No header bar',
  slots: CodeBlockSlots,
  recipe: Recipes.CodeBlock,
  pins: { header: 'float' },
  view: ({ style, h }) =>
    CodeBlock.view({ code: 'pnpm add foldkit-mixins-ui', language: 'sh', copy: {}, style }, h),
})

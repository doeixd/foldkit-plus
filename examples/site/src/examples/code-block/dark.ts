import { CodeBlock, CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// `scheme: 'dark'` keeps a terminal dark on a light page: the theme's own
// dark half, tokens and all, inside the block.
export default example({
  title: 'Always dark',
  slots: CodeBlockSlots,
  recipe: Recipes.CodeBlock,
  pins: { scheme: 'dark' },
  view: ({ style, h }) =>
    CodeBlock.view(
      {
        code: '$ pnpm build\n✓ 214 modules transformed.\ndist/index.js  48.2 kB │ gzip: 15.1 kB',
        title: 'Terminal',
        tokens: [
          { from: 0, to: 1, kind: 'syntax-punctuation' },
          { from: 13, to: 14, kind: 'syntax-string' },
        ],
        copy: {},
        style,
      },
      h,
    ),
})

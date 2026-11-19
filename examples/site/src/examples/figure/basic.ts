import { CodeBlock, Figure, FigureSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Code = Recipes.CodeBlock.style({})

// A `figure` whose caption names it for assistive technology on its own: the
// caption needs no ARIA. The content is anything: a picture, a chart, a quote.
export default example({
  title: 'A listing',
  slots: FigureSlots,
  recipe: Recipes.Figure,
  view: ({ style, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(100%, 22rem)' })],
      [
        Figure.view(
          {
            content: CodeBlock.view(
              { code: 'const total = items.length', language: 'ts', style: Code },
              h,
            ),
            caption: 'Listing 1. The count is read, never stored.',
            style,
          },
          h,
        ),
      ],
    ),
})

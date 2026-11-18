import { Figure, FigureSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The caption above the content, as a table's is. The recipe only moves it
// with CSS `order`; the markup, and so the reading order, is unchanged.
export default example({
  title: 'A caption above',
  slots: FigureSlots,
  recipe: Recipes.Figure,
  pins: { caption: 'before' },
  view: ({ style, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(100%, 22rem)' })],
      [
        Figure.view(
          {
            content: h.blockquote(
              [h.Style({ margin: '0' })],
              ['Simplicity is prerequisite for reliability.'],
            ),
            caption: 'Edsger Dijkstra, 1975',
            style,
          },
          h,
        ),
      ],
    ),
})

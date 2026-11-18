import { Bundles, Recipes, Resizable, ResizableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// `collapsible: 'first'` lets Enter or a double-click fold the first panel
// away, and the same again puts it back where it was. The bounds are the
// Bundle's args, so the view needs no copy of them.
export default example({
  title: 'A collapsible sidebar',
  slots: ResizableSlots,
  recipe: Recipes.Resizable,
  pins: { handle: 'grip' },
  state: Bundles.Resizable.with({ share: 0.3, min: 0.2, max: 0.6, collapsible: 'first' }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ blockSize: '12rem', inlineSize: 'min(32rem, 100%)' })],
      [
        Resizable.view(
          {
            model,
            onMessage,
            label: 'Resize the sidebar; Enter or a double-click folds it away',
            first: h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['Folders']),
            second: h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['Messages']),
            style,
          },
          h,
        ),
      ],
    ),
})

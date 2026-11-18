import { Bundles, Recipes, Resizable, ResizableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// `handle: 'pill'` draws a capsule on the line, which takes the accent while
// it is held or dragged. One over the other, it lies along the line.
export default example({
  title: 'A pill handle, stacked',
  slots: ResizableSlots,
  recipe: Recipes.Resizable,
  pins: { handle: 'pill' },
  state: Bundles.Resizable.with({ share: 0.45 }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ blockSize: '14rem', inlineSize: 'min(28rem, 100%)' })],
      [
        Resizable.view(
          {
            model,
            onMessage,
            orientation: 'vertical',
            label: 'Resize the preview',
            first: h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['Preview']),
            second: h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['Console']),
            style,
          },
          h,
        ),
      ],
    ),
})

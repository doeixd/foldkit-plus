import { Bundles, Recipes, Resizable, ResizableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The split is the Bundle's Model; its bounds go in once, as args, and both
// the folds and the handle's range read them from there.
export default example({
  title: 'Side by side',
  slots: ResizableSlots,
  recipe: Recipes.Resizable,
  state: Bundles.Resizable.with({ share: 0.35, min: 0.2, max: 0.8 }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [
        h.Style({
          blockSize: '12rem',
          inlineSize: 'min(32rem, 100%)',
          border: '1px solid color-mix(in oklab, currentColor 20%, transparent)',
          borderRadius: '0.5rem',
          overflow: 'hidden',
        }),
      ],
      [
        Resizable.view(
          {
            model,
            onMessage,
            label: 'Resize the file list',
            first: h.ul(
              [h.Style({ margin: '0', padding: '0.75rem', listStyle: 'none' })],
              [h.li([], ['notes.txt']), h.li([], ['todo.md']), h.li([], ['grid.ts'])],
            ),
            second: h.p(
              [h.Style({ margin: '0', padding: '0.75rem' })],
              ['Pick a file to preview it.'],
            ),
            style,
          },
          h,
        ),
      ],
    ),
})

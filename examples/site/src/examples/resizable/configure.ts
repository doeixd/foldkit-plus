import { Bundles, Recipes, Resizable, ResizableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Pill = forSlots(ResizableSlots)(Recipes.Resizable({ handle: 'pill' }))

// What every split of an application starts from: its look, said once; a
// preset is a named set over it. The bounds are a Model fact (`init`).
const AppSplit = Resizable.configure({
  base: { style: Pill },
  presets: { stacked: { orientation: 'vertical' } },
})

export default example({
  title: 'Configure once',
  slots: ResizableSlots,
  recipe: Recipes.Resizable,
  state: Bundles.Resizable.with({ share: 0.5, min: 0.25, max: 0.75 }),
  view: ({ model, onMessage, h }) =>
    h.div(
      [h.Style({ blockSize: '12rem', inlineSize: 'min(28rem, 100%)' })],
      [
        AppSplit.view(
          {
            model,
            onMessage,
            preset: 'stacked',
            label: 'Resize the panes',
            first: h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['Top']),
            second: h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['Bottom']),
          },
          h,
        ),
      ],
    ),
})

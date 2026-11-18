import { AspectRatio, AspectRatioSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { t } from '../../snippets/theme.js'

// The frame holds its ratio before its content arrives, so nothing below it
// moves when the picture does. The content fills it; the ratio is the style's.
export default example({
  title: 'Basic',
  slots: AspectRatioSlots,
  recipe: Recipes.AspectRatio,
  view: ({ style, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(100%, 20rem)' })],
      [
        AspectRatio.view(
          {
            content: h.div(
              [
                h.Style({
                  display: 'grid',
                  placeItems: 'center',
                  blockSize: '100%',
                  background: t.surface.subtle,
                }),
              ],
              ['Reserved before it loads'],
            ),
            style,
          },
          h,
        ),
      ],
    ),
})

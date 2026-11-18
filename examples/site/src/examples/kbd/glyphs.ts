import { Kbd, KbdSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

// A key may be a drawing: an arrow, or a modifier's own glyph. The key's
// accessible name is still its words, so a drawing carries its own label.
export default example({
  title: 'Keys that are drawings',
  slots: KbdSlots,
  recipe: Recipes.Kbd,
  view: ({ style, h }) =>
    h.p(
      [],
      [
        'Move with ',
        Kbd.combo(
          {
            keys: [
              h.span([h.Role('img'), h.AriaLabel('Left arrow')], [outline(h, 'M10 3L5 8l5 5')]),
              h.span([h.Role('img'), h.AriaLabel('Right arrow')], [outline(h, 'M6 3l5 5-5 5')]),
            ],
            style,
          },
          h,
        ),
        '.',
      ],
    ),
})

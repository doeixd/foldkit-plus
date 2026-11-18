import { Kbd, KbdSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Keys pressed together are one `kbd` holding a `kbd` per key. A `joiner`
// sits between keys whose names run together without one, and is read aloud.
export default example({
  title: 'Combinations',
  slots: KbdSlots,
  recipe: Recipes.Kbd,
  view: ({ style, h }) =>
    h.div(
      [],
      [
        h.p([], ['Search with ', Kbd.combo({ keys: ['⌘', 'K'], style }, h), '.']),
        h.p(
          [],
          [
            'Open the command palette with ',
            Kbd.combo({ keys: ['Ctrl', 'Shift', 'P'], joiner: '+', style }, h),
            '.',
          ],
        ),
      ],
    ),
})

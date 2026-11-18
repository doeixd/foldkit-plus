import { Badge, BadgeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { row } from '../../snippets/layout.js'

// An `icon` stands before the text in a slot of its own, hidden from
// assistive technology: the text is the badge's name.
export default example({
  title: 'With an icon',
  slots: BadgeSlots,
  recipe: Recipes.Badge,
  view: ({ style, h }) =>
    row(h, [
      Badge.view(
        { text: 'Verified', tone: 'success', icon: outline(h, 'M3 8.5l3 3 7-7'), style },
        h,
      ),
      Badge.view(
        { text: 'Needs review', tone: 'warning', icon: outline(h, 'M8 3v6M8 12v.5'), style },
        h,
      ),
      Badge.view(
        {
          text: 'Starred',
          tone: 'accent',
          icon: outline(h, 'M8 2l1.8 4 4.2.4-3.2 2.8 1 4.3L8 11.4 4.2 13.5l1-4.3L2 6.4 6.2 6z'),
          style,
        },
        h,
      ),
    ]),
})

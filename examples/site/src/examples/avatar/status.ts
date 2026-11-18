import { Avatar, AvatarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { portrait } from '../../snippets/portrait.js'
import { row } from '../../snippets/layout.js'

// A dot on the lower end corner, said in the avatar's name: "Ada Lovelace, Online".
// The statuses are `words`, so a translation is one object.
export default example({
  title: 'Status',
  slots: AvatarSlots,
  recipe: Recipes.Avatar,
  view: ({ style, h }) =>
    row(
      h,
      (['online', 'away', 'busy', 'offline'] as const).map((status, index) =>
        Avatar.view(
          {
            name: 'Ada Lovelace',
            src: portrait(40 + index * 70),
            status,
            words: { busy: 'Do not disturb' },
            style,
          },
          h,
        ),
      ),
    ),
})

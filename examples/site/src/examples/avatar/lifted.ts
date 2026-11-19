import { Avatar, AvatarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { portrait } from '../../snippets/portrait.js'

const Stack = Recipes.AvatarGroup.style({ lift: 'hover' })

// `lift: 'hover'` raises the avatar under the pointer; `rest` draws an icon
// in the count's disc in place of `+2`.
export default example({
  title: 'A lifted group',
  slots: AvatarSlots,
  recipe: Recipes.Avatar,
  view: ({ style, h }) =>
    Avatar.group(
      {
        label: 'Reviewers',
        people: ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Edsger Dijkstra'].map(
          (name, index) => ({ name, src: portrait(index * 70) }),
        ),
        max: 2,
        rest: () => outline(h, 'M3 8h10M8 3v10'),
        style: Stack,
        avatarStyle: style,
      },
      h,
    ),
})

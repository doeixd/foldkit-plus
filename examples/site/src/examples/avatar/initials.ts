import { Avatar, AvatarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// No picture: initials, in a colour from the name, the same everywhere for one person.
export default example({
  title: 'Initials',
  slots: AvatarSlots,
  recipe: Recipes.Avatar,
  pins: { color: 'name' },
  view: ({ style, h }) =>
    row(
      h,
      ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Edsger Dijkstra'].map(name =>
        Avatar.view({ name, style }, h),
      ),
    ),
})

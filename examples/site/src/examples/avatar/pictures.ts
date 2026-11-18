import { Avatar, AvatarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { portrait } from '../../snippets/portrait.js'
import { row } from '../../snippets/layout.js'

// `src` is a URL. The picture covers the initials, which show until it loads
// and where it fails.
export default example({
  title: 'Pictures',
  slots: AvatarSlots,
  recipe: Recipes.Avatar,
  view: ({ style, h }) =>
    row(h, [
      Avatar.view({ name: 'Ada Lovelace', src: portrait(210), style }, h),
      Avatar.view({ name: 'Grace Hopper', src: portrait(20), style }, h),
      Avatar.view({ name: 'Alan Turing', src: portrait(140), style }, h),
    ]),
})

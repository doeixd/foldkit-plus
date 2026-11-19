import { Avatar, AvatarSlots, Item, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { portrait } from '../../snippets/portrait.js'

const Row = Recipes.Item.style({ density: 'compact' })

// An avatar with a name and a caption is an Item with the avatar as its media.
export default example({
  title: 'With a name',
  slots: AvatarSlots,
  recipe: Recipes.Avatar,
  view: ({ style, h }) =>
    Item.view(
      {
        media: Avatar.view({ name: 'Alan Turing', src: portrait(140), style }, h),
        title: 'Alan Turing',
        description: 'alan@example.com',
        style: Row,
      },
      h,
    ),
})

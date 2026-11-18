import { Avatar, AvatarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { portrait } from '../../snippets/portrait.js'

// A mark on a corner: a count, an icon. The avatar is one image, so a badge is
// hidden and its `label` is read with the name ("Ada Lovelace, 3 unread").
export default example({
  title: 'Badges',
  slots: AvatarSlots,
  recipe: Recipes.Avatar,
  view: ({ style, h }) =>
    Avatar.view(
      {
        name: 'Ada Lovelace',
        src: portrait(210),
        badges: [
          { content: h.span([], ['3']), place: 'top-end', label: '3 unread' },
          { content: outline(h, 'M3 8.5l3 3 7-7'), place: 'bottom-end', label: 'Verified' },
        ],
        style,
      },
      h,
    ),
})

import { Avatar, AvatarGroupSlots, AvatarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { portrait } from '../../snippets/portrait.js'
import { forSlots } from '../../snippets/theme.js'

const Stack = forSlots(AvatarGroupSlots)(Recipes.AvatarGroup({}))

// Overlapping, each ringed in the page, at most four and a count of the rest.
// `wrap` draws around each avatar: here a link to the person's page.
export default example({
  title: 'A group',
  slots: AvatarSlots,
  recipe: Recipes.Avatar,
  view: ({ style, h }) =>
    Avatar.group(
      {
        label: 'Editors',
        people: [
          'Ada Lovelace',
          'Grace Hopper',
          'Alan Turing',
          'Edsger Dijkstra',
          'Barbara Liskov',
          'Donald Knuth',
        ].map((name, index) => ({ name, src: portrait(index * 60) })),
        max: 4,
        wrap: (avatar, person) => h.a([h.Href(`/people/${person.name}`)], [avatar]),
        style: Stack,
        avatarStyle: style,
      },
      h,
    ),
})

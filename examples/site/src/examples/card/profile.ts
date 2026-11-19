import { Avatar, Button, Card, CardSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Face = Recipes.Avatar.style({ size: 'lg', color: 'name' })
const Action = Recipes.Button.style({})

// A person: their avatar leading in the media's place, a name and a role.
export default example({
  title: 'A person',
  slots: CardSlots,
  recipe: Recipes.Card,
  view: ({ style, h }) =>
    Card.view(
      {
        media: Avatar.view({ name: 'Ada Lovelace', status: 'online', style: Face }, h),
        title: 'Ada Lovelace',
        description: 'Analyst, Engine team',
        footer: Button.view({ label: 'Message', style: Action }, h),
        style,
      },
      h,
    ),
})

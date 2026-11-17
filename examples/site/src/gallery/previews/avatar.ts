import { AvatarSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('avatar'),
  AvatarSlots,
  Recipes.Avatar,
  style => Snippet.avatars(style, inert),
  undefined,
  [
    { name: 'pictures', title: 'Pictures', draw: style => Snippet.avatars(style, inert) },
    {
      name: 'initials',
      title: 'Initials',
      draw: style => Snippet.avatarInitials(style, inert),
      pins: { color: 'name' },
    },
    { name: 'status', title: 'Status', draw: style => Snippet.avatarStatus(style, inert) },
    { name: 'group', title: 'A group', draw: style => Snippet.avatarGroup(style, inert) },
    { name: 'shapes', title: 'Shapes', draw: () => Snippet.avatarShapes(inert) },
    { name: 'named', title: 'With a name', draw: style => Snippet.avatarNamed(style, inert) },
  ],
)

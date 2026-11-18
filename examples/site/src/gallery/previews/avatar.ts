import { AvatarSlots, Recipes } from 'foldkit-mixins-ui'
import configure from '../../examples/avatar/configure.js'
import group from '../../examples/avatar/group.js'
import initials from '../../examples/avatar/initials.js'
import named from '../../examples/avatar/named.js'
import picture from '../../examples/avatar/picture.js'
import pictures from '../../examples/avatar/pictures.js'
import shapes from '../../examples/avatar/shapes.js'
import status from '../../examples/avatar/status.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('avatar'),
  AvatarSlots,
  Recipes.Avatar,
  pictures,
  undefined,
  [
    { name: 'pictures', example: pictures },
    { name: 'picture', example: picture },
    { name: 'initials', example: initials },
    { name: 'status', example: status },
    { name: 'group', example: group },
    { name: 'shapes', example: shapes },
    { name: 'named', example: named },
    { name: 'configure', example: configure },
  ],
)

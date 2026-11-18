import { CardSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/card/basic.js'
import elevation from '../../examples/card/elevation.js'
import link from '../../examples/card/link.js'
import media from '../../examples/card/media.js'
import profile from '../../examples/card/profile.js'
import stat from '../../examples/card/stat.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('card'),
  CardSlots,
  Recipes.Card,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'stat', example: stat },
    { name: 'media', example: media },
    { name: 'profile', example: profile },
    { name: 'link', example: link },
    { name: 'elevation', example: elevation },
  ],
  {
    // The recipe reads elevation for these two surfaces only; a filled or plain card is flat.
    elevation: {
      axis: 'surface',
      values: ['outlined', 'elevated'],
      hint: 'outlined and elevated only',
    },
  },
)

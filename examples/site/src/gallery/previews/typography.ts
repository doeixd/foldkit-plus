import { Recipes, TypographySlots } from 'foldkit-mixins-ui'
import content from '../../examples/typography/content.js'
import scale from '../../examples/typography/scale.js'
import tone from '../../examples/typography/tone.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('typography'),
  TypographySlots,
  Recipes.Typography,
  scale,
  // Each voice draws its own level, so the page offers no axis to pick.
  [],
  [
    { name: 'scale', example: scale },
    { name: 'content', example: content },
    { name: 'tone', example: tone },
  ],
)

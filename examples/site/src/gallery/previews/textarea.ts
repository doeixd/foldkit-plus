import { Recipes, TextareaSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/textarea/basic.js'
import count from '../../examples/textarea/count.js'
import fixed from '../../examples/textarea/fixed.js'
import footer from '../../examples/textarea/footer.js'
import grow from '../../examples/textarea/grow.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('textarea'),
  TextareaSlots,
  Recipes.Textarea,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'grow', example: grow },
    { name: 'fixed', example: fixed },
    { name: 'count', example: count },
    { name: 'footer', example: footer },
  ],
)

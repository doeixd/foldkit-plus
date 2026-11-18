import { Recipes, SearchFieldSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/search-field/basic.js'
import busy from '../../examples/search-field/busy.js'
import routes from '../../examples/search-field/routes.js'
import states from '../../examples/search-field/states.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('search-field'),
  SearchFieldSlots,
  Recipes.SearchField,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'routes', example: routes },
    { name: 'busy', example: busy },
    { name: 'states', example: states },
  ],
)

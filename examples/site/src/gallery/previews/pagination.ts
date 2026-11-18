import { PaginationSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/pagination/basic.js'
import compact from '../../examples/pagination/compact.js'
import configure from '../../examples/pagination/configure.js'
import ends from '../../examples/pagination/ends.js'
import icons from '../../examples/pagination/icons.js'
import onePage from '../../examples/pagination/one-page.js'
import range from '../../examples/pagination/range.js'
import shapes from '../../examples/pagination/shapes.js'
import siblings from '../../examples/pagination/siblings.js'
import simple from '../../examples/pagination/simple.js'
import words from '../../examples/pagination/words.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('pagination'),
  PaginationSlots,
  Recipes.Pagination,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'simple', example: simple },
    { name: 'ends', example: ends },
    { name: 'range', example: range },
    { name: 'siblings', example: siblings },
    { name: 'compact', example: compact },
    { name: 'words', example: words },
    { name: 'icons', example: icons },
    { name: 'shapes', example: shapes },
    { name: 'one-page', example: onePage },
    { name: 'configure', example: configure },
  ],
)

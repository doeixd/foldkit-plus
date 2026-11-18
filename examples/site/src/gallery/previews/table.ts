import { Recipes, TableSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/table/basic.js'
import configure from '../../examples/table/configure.js'
import empty from '../../examples/table/empty.js'
import expandable from '../../examples/table/expandable.js'
import fluid from '../../examples/table/fluid.js'
import footer from '../../examples/table/footer.js'
import selection from '../../examples/table/selection.js'
import sortable from '../../examples/table/sortable.js'
import sticky from '../../examples/table/sticky.js'
import vertical from '../../examples/table/vertical.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('table'), TableSlots, Recipes.Table, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'sortable', example: sortable },
  { name: 'selection', example: selection },
  { name: 'expandable', example: expandable },
  { name: 'footer', example: footer },
  { name: 'fluid', example: fluid },
  { name: 'vertical', example: vertical },
  { name: 'empty', example: empty },
  { name: 'sticky', example: sticky },
  { name: 'configure', example: configure },
])

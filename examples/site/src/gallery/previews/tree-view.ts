import { Recipes, TreeViewSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/tree-view/basic.js'
import checkboxes from '../../examples/tree-view/checkboxes.js'
import configure from '../../examples/tree-view/configure.js'
import icons from '../../examples/tree-view/icons.js'
import people from '../../examples/tree-view/people.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('tree-view'),
  TreeViewSlots,
  Recipes.TreeView,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'icons', example: icons },
    { name: 'checkboxes', example: checkboxes },
    { name: 'people', example: people },
    { name: 'configure', example: configure },
  ],
)

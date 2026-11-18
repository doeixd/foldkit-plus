import { FloatingPanelSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/floating-panel/basic.js'
import beside from '../../examples/floating-panel/beside.js'
import configure from '../../examples/floating-panel/configure.js'
import controls from '../../examples/floating-panel/controls.js'
import docked from '../../examples/floating-panel/docked.js'
import fixed from '../../examples/floating-panel/fixed.js'
import limits from '../../examples/floating-panel/limits.js'
import overflow from '../../examples/floating-panel/overflow.js'
import stack from '../../examples/floating-panel/stack.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('floating-panel'),
  FloatingPanelSlots,
  Recipes.FloatingPanel,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'beside', example: beside },
    { name: 'docked', example: docked },
    { name: 'stack', example: stack },
    { name: 'controls', example: controls },
    { name: 'fixed', example: fixed },
    { name: 'limits', example: limits },
    { name: 'overflow', example: overflow },
    { name: 'configure', example: configure },
  ],
)

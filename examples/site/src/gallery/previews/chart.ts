import { ChartSlots, Recipes } from 'foldkit-mixins-ui'
import area from '../../examples/chart/area.js'
import bars from '../../examples/chart/bars.js'
import donut from '../../examples/chart/donut.js'
import line from '../../examples/chart/line.js'
import colors from '../../examples/chart/colors.js'
import own from '../../examples/chart/own.js'
import pie from '../../examples/chart/pie.js'
import shown from '../../examples/chart/shown.js'
import stacked from '../../examples/chart/stacked.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('chart'), ChartSlots, Recipes.Chart, bars, undefined, [
  { name: 'bars', example: bars },
  { name: 'stacked', example: stacked },
  { name: 'line', example: line },
  { name: 'area', example: area },
  { name: 'donut', example: donut },
  { name: 'pie', example: pie },
  { name: 'shown', example: shown },
  { name: 'colors', example: colors },
  { name: 'own', example: own },
])

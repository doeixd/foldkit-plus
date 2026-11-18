import { AccordionSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/accordion/basic.js'
import configure from '../../examples/accordion/configure.js'
import plus from '../../examples/accordion/plus.js'
import rows from '../../examples/accordion/rows.js'
import tinted from '../../examples/accordion/tinted.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('accordion'),
  AccordionSlots,
  Recipes.Accordion,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'plus', example: plus },
    { name: 'tinted', example: tinted },
    { name: 'rows', example: rows },
    { name: 'configure', example: configure },
  ],
)

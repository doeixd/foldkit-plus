import { QuestionnaireSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/questionnaire/basic.js'
import paged from '../../examples/questionnaire/paged.js'
import words from '../../examples/questionnaire/words.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('questionnaire'),
  QuestionnaireSlots,
  Recipes.Questionnaire,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'paged', example: paged },
    { name: 'words', example: words },
  ],
)

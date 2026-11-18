import { CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/code-block/basic.js'
import collapsed from '../../examples/code-block/collapsed.js'
import copy from '../../examples/code-block/copy.js'
import dark from '../../examples/code-block/dark.js'
import diagnostics from '../../examples/code-block/diagnostics.js'
import diff from '../../examples/code-block/diff.js'
import float from '../../examples/code-block/float.js'
import focus from '../../examples/code-block/focus.js'
import follow from '../../examples/code-block/follow.js'
import own from '../../examples/code-block/own.js'
import select from '../../examples/code-block/select.js'
import wrap from '../../examples/code-block/wrap.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('code-block'),
  CodeBlockSlots,
  Recipes.CodeBlock,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'copy', example: copy },
    { name: 'diff', example: diff },
    { name: 'focus', example: focus },
    { name: 'diagnostics', example: diagnostics },
    { name: 'collapsed', example: collapsed },
    { name: 'select', example: select },
    { name: 'wrap', example: wrap },
    { name: 'float', example: float },
    { name: 'dark', example: dark },
    { name: 'follow', example: follow },
    { name: 'own', example: own },
  ],
)

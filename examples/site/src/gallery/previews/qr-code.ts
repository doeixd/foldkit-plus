import { QrCodeSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/qr-code/basic.js'
import download from '../../examples/qr-code/download.js'
import level from '../../examples/qr-code/level.js'
import logo from '../../examples/qr-code/logo.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('qr-code'),
  QrCodeSlots,
  Recipes.QrCode,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'logo', example: logo },
    { name: 'level', example: level },
    { name: 'download', example: download },
  ],
)

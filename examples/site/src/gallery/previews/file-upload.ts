import { FileUploadSlots, Recipes } from 'foldkit-mixins-ui'
import avatar from '../../examples/file-upload/avatar.js'
import basic from '../../examples/file-upload/basic.js'
import card from '../../examples/file-upload/card.js'
import configure from '../../examples/file-upload/configure.js'
import cover from '../../examples/file-upload/cover.js'
import drop from '../../examples/file-upload/drop.js'
import gallery from '../../examples/file-upload/gallery.js'
import images from '../../examples/file-upload/images.js'
import progress from '../../examples/file-upload/progress.js'
import table from '../../examples/file-upload/table.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('file-upload'),
  FileUploadSlots,
  Recipes.FileUpload,
  drop,
  // Each example holds the layout it shows, so a reader picks the size alone.
  ['size'],
  [
    { name: 'basic', example: basic },
    { name: 'avatar', example: avatar },
    { name: 'drop', example: drop },
    { name: 'gallery', example: gallery },
    { name: 'progress', example: progress },
    { name: 'table', example: table },
    { name: 'images', example: images },
    { name: 'card', example: card },
    { name: 'cover', example: cover },
    { name: 'configure', example: configure },
  ],
)

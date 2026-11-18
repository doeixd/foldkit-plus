import { ImageCropperSlots, Recipes } from 'foldkit-mixins-ui'
import aspect from '../../examples/image-cropper/aspect.js'
import avatar from '../../examples/image-cropper/avatar.js'
import basic from '../../examples/image-cropper/basic.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('image-cropper'),
  ImageCropperSlots,
  Recipes.ImageCropper,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'avatar', example: avatar },
    { name: 'aspect', example: aspect },
  ],
)

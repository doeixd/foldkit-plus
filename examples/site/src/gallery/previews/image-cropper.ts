import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, ImageCropperSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const cropperBasic = <Message>(style: NamedStyle<typeof ImageCropperSlots>, live: Live<Message>) =>
  Snippet.imageCropper(
    style,
    live.widgets.photo,
    message => live.onWidget(Widgets.Message.GotPhoto({ message })),
    live.h,
  )

export const showcase = fromRecipe(
  about('image-cropper'),
  ImageCropperSlots,
  Recipes.ImageCropper,
  cropperBasic,
  undefined,
  [
    { name: 'basic', title: 'Free crop', draw: cropperBasic },
    {
      name: 'avatar',
      title: 'Round, square, exported',
      pins: { viewport: 'square', handles: 'corners' },
      draw: (style, live) =>
        Snippet.avatarCropper(
          style,
          live.widgets.avatarCrop,
          live.widgets.avatarUrl,
          message => live.onWidget(Widgets.Message.GotAvatarCrop({ message })),
          live.h,
        ),
    },
  ],
)

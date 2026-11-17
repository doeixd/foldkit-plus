import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, QrCodeSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

const qrBasic = (style: NamedStyle<typeof QrCodeSlots>) => Snippet.qrCode(style, inert)

export const showcase = fromRecipe(
  about('qr-code'),
  QrCodeSlots,
  Recipes.QrCode,
  qrBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: qrBasic },
    {
      name: 'logo',
      title: 'A logo over the centre',
      draw: style => Snippet.qrCodeLogo(style, inert),
    },
    {
      name: 'download',
      title: 'Saved as a PNG or an SVG',
      draw: (style, live) =>
        Snippet.qrCodeDownload(
          style,
          format => live.onWidget(Widgets.Message.PressedQrDownload({ format })),
          live.h,
        ),
    },
  ],
)

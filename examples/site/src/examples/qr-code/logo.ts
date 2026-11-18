import { QrCode, QrCodeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#4f46e5"/><path d="M10 9h12v4h-8v3h7v4h-7v6h-4z" fill="#fff"/></svg>',
)}`

// An overlay raises the error correction to H, so the code still reads under it.
export default example({
  title: 'A logo over the centre',
  slots: QrCodeSlots,
  recipe: Recipes.QrCode,
  view: ({ style, h }) =>
    QrCode.view(
      {
        id: 'logo-qr',
        value: 'https://foldkit-plus.pages.dev/components',
        label: 'QR code for the Foldkit Plus components',
        overlay: h.img([h.Src(LOGO), h.Alt('')]),
        style,
      },
      h,
    ),
})

import { QrCode, QrCodeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A value, encoded on the page: no network, no canvas. The code is drawn on
// a light square whatever the page's scheme, which every reader can scan.
export default example({
  title: 'Basic',
  slots: QrCodeSlots,
  recipe: Recipes.QrCode,
  view: ({ style, h }) =>
    QrCode.view({ id: 'site-qr', value: 'https://foldkit-plus.pages.dev', style }, h),
})

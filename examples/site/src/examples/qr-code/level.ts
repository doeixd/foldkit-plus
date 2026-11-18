import { QrCode, QrCodeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// `level` trades size for resilience: L recovers 7% of the code, H 30%, at
// the cost of more, smaller modules. `quietZone` is the margin a scanner
// needs, four modules by default.
export default example({
  title: 'Error correction and margin',
  slots: QrCodeSlots,
  recipe: Recipes.QrCode,
  pins: { size: 'sm' },
  view: ({ style, h }) =>
    row(h, [
      QrCode.view({ id: 'low-qr', value: 'https://example.com/a/1', level: 'L', style }, h),
      QrCode.view({ id: 'high-qr', value: 'https://example.com/a/1', level: 'H', style }, h),
      QrCode.view({ id: 'tight-qr', value: 'https://example.com/a/1', quietZone: 1, style }, h),
    ]),
})

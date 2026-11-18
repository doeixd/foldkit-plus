import { Bundles, Recipes, SignaturePad, SignaturePadSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A filled pad for a pointer alone: `surface: 'muted'` and `fallback: false`,
// which leaves out the typed field. A broader pen is an arg of the Bundle.
export default example({
  title: 'Drawn only, on a filled pad',
  slots: SignaturePadSlots,
  recipe: Recipes.SignaturePad,
  pins: { surface: 'muted' },
  state: Bundles.SignaturePad.with({ id: 'initials', pen: { size: 6 } }),
  view: ({ style, model, onMessage, h }) =>
    SignaturePad.view({ model, onMessage, label: 'Initials', fallback: false, style }, h),
})

import { Bundles, Recipes, SignaturePad, SignaturePadSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The strokes and the typed name are the pad's Model, placed by
// `Bundles.SignaturePad`. Draw with a pointer, or type a name in the field
// below for a reader who cannot draw; undo and clear are built in.
export default example({
  title: 'Draw or type',
  slots: SignaturePadSlots,
  recipe: Recipes.SignaturePad,
  state: Bundles.SignaturePad.with({ id: 'signature' }),
  view: ({ style, model, onMessage, h }) =>
    SignaturePad.view({ model, onMessage, label: 'Signature', style }, h),
})

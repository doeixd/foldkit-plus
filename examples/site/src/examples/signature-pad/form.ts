import { Bundles, Recipes, SignaturePad, SignaturePadSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// `name` submits the signature with the form around the pad, as the SVG
// `toSvg` writes, in a hidden input that stays empty while nothing is
// signed. The words are the application's: here, the pad's in German.
export default example({
  title: 'A form field, in your words',
  slots: SignaturePadSlots,
  recipe: Recipes.SignaturePad,
  state: Bundles.SignaturePad.with({ id: 'consent' }),
  view: ({ style, model, onMessage, h }) =>
    SignaturePad.view(
      {
        model,
        onMessage,
        label: 'Unterschrift',
        name: 'signature',
        words: {
          undo: 'Rückgängig',
          clear: 'Löschen',
          placeholder: 'Hier unterschreiben',
          fallback: 'Oder Namen eingeben',
        },
        style,
      },
      h,
    ),
})

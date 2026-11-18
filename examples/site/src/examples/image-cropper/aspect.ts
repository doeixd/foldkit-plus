import { Equal, Option } from 'effect'
import { Bundle } from 'foldkit-bundle'
import {
  Bundles,
  ImageCropper,
  ImageCropperSlots,
  Recipes,
  Segmented,
  SegmentedSlots,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'
import { LANDSCAPE } from '../../snippets/landscape.js'
import { forSlots } from '../../snippets/theme.js'

const Ratios = forSlots(SegmentedSlots)(Recipes.Segmented({ size: 'sm' }))
const ratios = [
  { label: 'Free', aspect: Option.none<number>() },
  { label: '1:1', aspect: Option.some(1) },
  { label: '4:3', aspect: Option.some(4 / 3) },
  { label: '16:9', aspect: Option.some(16 / 9) },
]

// The lock is the cropper's: the page's buttons send `ChangedAspect` to the
// placed child, which fits the crop to it at once, about its centre.
const App = Bundle.compose({}).pipe(
  Bundle.withChild('crop', Bundles.ImageCropper, {
    args: { id: 'ratio-crop' },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Choose the aspect',
  slots: ImageCropperSlots,
  recipe: Recipes.ImageCropper,
  state: App.placements.runtime({ Model: App.Model, initial: {} }),
  view: ({ style, model, onMessage, h }) => {
    const toCrop = (message: ImageCropper.Message) =>
      onMessage(App.Message.GotCropMessage({ message }))
    return stack(h, [
      Segmented.view(
        {
          id: 'crop-ratio',
          label: 'Aspect',
          options: ratios.map(({ label }) => ({ value: label, label })),
          pressed: ratios
            .filter(({ aspect }) => Equal.equals(aspect, model.crop.aspect))
            .map(({ label }) => label),
          onPress: value =>
            toCrop(
              ImageCropper.Message.ChangedAspect({
                aspect: Option.flatMap(
                  Option.fromUndefinedOr(ratios.find(({ label }) => label === value)),
                  ({ aspect }) => aspect,
                ),
              }),
            ),
          style: Ratios,
        },
        h,
      ),
      ImageCropper.view(
        { model: model.crop, onMessage: toCrop, label: 'Crop the photo', src: LANDSCAPE, style },
        h,
      ),
    ])
  },
})

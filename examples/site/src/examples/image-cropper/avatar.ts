import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import {
  Avatar,
  Bundles,
  Button,
  ImageCropper,
  ImageCropperSlots,
  Recipes,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row, stack } from '../../snippets/layout.js'
import { LANDSCAPE } from '../../snippets/landscape.js'

const Use = Recipes.Button.style({ variant: 'outline', size: 'sm' })
const Picture = Recipes.Avatar.style({ size: 'lg' })

// A round crop locked square. The page asks for the crop with
// `RequestedExport`, sent to the placed child, and the Bundle reports
// `Exported` with a data URL, which the page keeps to show.
const App = Bundle.compose({ picture: Schema.Option(Schema.String) }).pipe(
  Bundle.withChild('crop', Bundles.ImageCropper, {
    args: { id: 'avatar-crop', shape: 'round', aspect: 1 },
    onOut: out => model => ({
      model: ImageCropper.OutMessage.match(out, {
        Exported: ({ url }) => ({ ...model, picture: Option.some(url) }),
        FailedExport: () => model,
      }),
    }),
  }),
)

export default example({
  title: 'Round, square, exported',
  slots: ImageCropperSlots,
  recipe: Recipes.ImageCropper,
  pins: { viewport: 'square', handles: 'corners' },
  state: App.placements.runtime({ Model: App.Model, initial: { picture: Option.none() } }),
  view: ({ style, model, onMessage, h }) => {
    const toCrop = (message: ImageCropper.Message) =>
      onMessage(App.Message.GotCropMessage({ message }))
    return stack(h, [
      ImageCropper.view(
        {
          model: model.crop,
          onMessage: toCrop,
          label: 'Profile picture',
          src: LANDSCAPE,
          controls: { rotate: false },
          style,
        },
        h,
      ),
      row(h, [
        Button.view(
          {
            label: 'Use this crop',
            onClick: toCrop(
              ImageCropper.Message.RequestedExport({ type: 'image/png', quality: 1 }),
            ),
            style: Use,
          },
          h,
        ),
        ...Option.match(model.picture, {
          onNone: () => [],
          onSome: src => [Avatar.view({ src, name: 'The cropped picture', style: Picture }, h)],
        }),
      ]),
    ])
  },
})

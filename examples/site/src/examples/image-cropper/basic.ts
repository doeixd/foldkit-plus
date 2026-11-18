import { Bundles, ImageCropper, ImageCropperSlots, Recipes, SliderSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { LANDSCAPE } from '../../snippets/landscape.js'
import { forSlots } from '../../snippets/theme.js'

// The zoom is a Slider you pass, so a cropper given none ships none; its
// label is the cropper's to say.
const Zoom = forSlots(SliderSlots)(Recipes.Slider({ label: 'hidden' }))

// The crop, zoom and turn are the cropper's Model, placed by
// `Bundles.ImageCropper`; the image is the page's. Drag the crop or its
// handles, or move it with the arrow keys once it has focus.
export default example({
  title: 'Free crop',
  slots: ImageCropperSlots,
  recipe: Recipes.ImageCropper,
  state: Bundles.ImageCropper.with({ id: 'photo' }),
  view: ({ style, model, onMessage, h }) =>
    ImageCropper.view(
      {
        model,
        onMessage,
        label: 'Crop the photo',
        src: LANDSCAPE,
        zoom: ImageCropper.zoomSlider(Zoom),
        style,
      },
      h,
    ),
})

import { Bundles, FileUpload, FileUploadSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// One image. The picker is the native input's label, so the dialog, the
// keys and a form's submission are the browser's own.
export default example({
  title: 'Basic',
  slots: FileUploadSlots,
  recipe: Recipes.FileUpload,
  pins: { layout: 'button' },
  state: Bundles.FileUpload.with({ id: 'logo', accept: ['image/*'] }),
  view: ({ style, model, onMessage, h }) =>
    FileUpload.view({ model, onMessage, label: 'Choose an image', name: 'logo', style }, h),
})

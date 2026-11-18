import { Bundles, FileUpload, FileUploadSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Given once: the application's words for every upload field. `configure`
// binds `parts` too, for a layout of the application's own.
const Upload = FileUpload.configure({
  base: { words: { prompt: 'Drag files in, or', remove: 'Take {name} off', clear: 'Start over' } },
  presets: { quiet: { words: { prompt: '' } } },
})

export default example({
  title: 'Configure once',
  slots: FileUploadSlots,
  recipe: Recipes.FileUpload,
  pins: { layout: 'zone' },
  state: Bundles.FileUpload.with({ id: 'configured', multiple: true }),
  view: ({ style, model, onMessage, h }) =>
    Upload.view({ model, onMessage, label: 'choose them', style }, h),
})

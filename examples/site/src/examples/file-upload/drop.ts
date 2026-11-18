import { Bundles, FileUpload, FileUploadSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The limits are the state's, so they are args: a file over them is refused
// and the reason listed. The prompt is a word; the label names the input.
export default example({
  title: 'Drag and drop',
  slots: FileUploadSlots,
  recipe: Recipes.FileUpload,
  pins: { layout: 'zone' },
  state: Bundles.FileUpload.with({
    id: 'documents',
    multiple: true,
    maxFiles: 5,
    maxSize: 5_000_000,
  }),
  view: ({ style, model, onMessage, h }) =>
    FileUpload.view(
      {
        model,
        onMessage,
        label: 'browse',
        words: { prompt: 'Drop files here or' },
        description: 'Contracts, invoices and anything else we should read.',
        style,
      },
      h,
    ),
})

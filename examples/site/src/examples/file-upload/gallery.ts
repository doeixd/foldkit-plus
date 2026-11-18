import { Bundles, FileUpload, FileUploadSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// `list: 'grid'` draws each file as a tile with its thumbnail: the same
// markup as the rows, laid out by the recipe.
export default example({
  title: 'Gallery',
  slots: FileUploadSlots,
  recipe: Recipes.FileUpload,
  pins: { layout: 'zone', list: 'grid' },
  state: Bundles.FileUpload.with({ id: 'gallery', multiple: true, accept: ['image/*'] }),
  view: ({ style, model, onMessage, h }) =>
    FileUpload.view(
      { model, onMessage, label: 'browse', words: { prompt: 'Drop images here or' }, style },
      h,
    ),
})

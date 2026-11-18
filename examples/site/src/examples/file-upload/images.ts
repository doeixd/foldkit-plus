import { Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import {
  Bundles,
  FileUpload,
  FileUploadProgress,
  FileUploadSlots,
  ProgressSlots,
  Recipes,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'
import { simulated } from '../../snippets/upload.js'

const LANES = 2
const App = Bundle.compose({}).pipe(
  Bundle.withChild('upload', Bundles.FileUpload, {
    args: { id: 'images', multiple: true, accept: ['image/*'], maxFiles: 8, lanes: LANES },
    onOut: Bundle.ignore,
  }),
)
const lift = (message: FileUpload.Message) => App.Message.GotUploadMessage({ message })
const Bar = FileUploadProgress.make({ style: forSlots(ProgressSlots)(Recipes.Progress({})) })

// The gallery and the sending together: each tile shows its thumbnail at
// once, from the file in the page, and a bar until it has been sent.
export default example({
  title: 'Image upload',
  slots: FileUploadSlots,
  recipe: Recipes.FileUpload,
  pins: { layout: 'zone', list: 'grid' },
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    subscriptions: FileUpload.lanes({
      count: LANES,
      model: (model: typeof App.Model.Type) => model.upload,
      send: job => simulated(job).pipe(Stream.map(lift)),
    }),
  }),
  view: ({ style, model, onMessage, h }) =>
    FileUpload.view(
      {
        model: model.upload,
        onMessage: message => onMessage(lift(message)),
        label: 'browse',
        words: { prompt: 'Drop images here or' },
        progress: Bar,
        style,
      },
      h,
    ),
})

import { Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import {
  Bundles,
  FileUpload,
  FileUploadProgress,
  FileUploadSlots,
  Recipes,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { simulated } from '../../snippets/upload.js'

const LANES = 3
const App = Bundle.compose({}).pipe(
  Bundle.withChild('upload', Bundles.FileUpload, {
    args: { id: 'sent', multiple: true, lanes: LANES },
    onOut: Bundle.ignore,
  }),
)
const lift = (message: FileUpload.Message) => App.Message.GotUploadMessage({ message })

// The widget sends nothing: the application's transport and the Progress
// bar are both passed in, so a field that only posts with a form ships neither.
const Bar = FileUploadProgress.make({ style: Recipes.Progress.style({}) })

export default example({
  title: 'Progress: three at a time (name a file "fail" to see a retry)',
  slots: FileUploadSlots,
  recipe: Recipes.FileUpload,
  pins: { layout: 'zone' },
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
        words: { prompt: 'Drop files here or' },
        progress: Bar,
        style,
      },
      h,
    ),
})

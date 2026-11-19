import { Option, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import {
  Bundles,
  FileUpload,
  FileUploadProgress,
  FileUploadSlots,
  Recipes,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { label } from '../../snippets/layout.js'
import { simulated } from '../../snippets/upload.js'

const App = Bundle.compose({}).pipe(
  Bundle.withChild('upload', Bundles.FileUpload, {
    args: { id: 'cover', accept: ['image/*'], lanes: 1 },
    onOut: Bundle.ignore,
  }),
)
const lift = (message: FileUpload.Message) => App.Message.GotUploadMessage({ message })
const Ring = FileUploadProgress.make({
  style: Recipes.Progress.style({ shape: 'ring' }),
})

// One wide image: the picker is the picture, and a ring stands on it while
// the file is sent.
export default example({
  title: 'Cover',
  slots: FileUploadSlots,
  recipe: Recipes.FileUpload,
  pins: { layout: 'cover' },
  state: App.placements.runtime({
    Model: App.Model,
    initial: {},
    subscriptions: FileUpload.lanes({
      count: 1,
      model: (model: typeof App.Model.Type) => model.upload,
      send: job => simulated(job).pipe(Stream.map(lift)),
    }),
  }),
  view: ({ style, model, onMessage, h }) =>
    FileUpload.view(
      {
        model: model.upload,
        onMessage: message => onMessage(lift(message)),
        label: 'Cover image',
        picture: url =>
          Option.match(url, {
            onNone: () => label(h, ['Add a cover image']),
            onSome: src => h.img([h.Src(src), h.Alt('')]),
          }),
        progress: Ring,
        style,
      },
      h,
    ),
})

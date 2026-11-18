import { Option, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import {
  Bundles,
  FileUpload,
  FileUploadProgress,
  FileUploadSlots,
  ProgressSlots,
  Recipes,
  Table,
  TableSlots,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { label } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'
import { simulated } from '../../snippets/upload.js'

const LANES = 2
const App = Bundle.compose({}).pipe(
  Bundle.withChild('upload', Bundles.FileUpload, {
    args: { id: 'tabled', multiple: true, lanes: LANES },
    onOut: Bundle.ignore,
  }),
)
const lift = (message: FileUpload.Message) => App.Message.GotUploadMessage({ message })
const Rows = forSlots(TableSlots)(Recipes.Table({}))
const Ring = FileUploadProgress.make({
  style: forSlots(ProgressSlots)(Recipes.Progress({ shape: 'ring' })),
})

// `FileUpload.parts` hands back the drawings `view` assembles, apart, so the
// files are rows of a Table the application lays out.
export default example({
  title: 'Composed: the files as a table',
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
  view: ({ style, model, onMessage, h }) => {
    const drawn = FileUpload.parts(
      {
        model: model.upload,
        onMessage: message => onMessage(lift(message)),
        label: 'browse',
        words: { prompt: 'Drop files here or' },
        progress: Ring,
        style,
      },
      h,
    )
    const or = (part: Option.Option<ReturnType<typeof label>>) =>
      Option.getOrElse(part, () => label(h, []))
    return drawn.root([
      drawn.input,
      ...Option.toArray(drawn.picker),
      drawn.status,
      Table.view(
        {
          caption: 'Files',
          rows: drawn.items,
          rowKey: row => row.entry.id,
          columns: [
            { header: 'Name', rowHeader: true, value: row => row.name },
            { header: 'Size', numeric: true, value: row => row.meta },
            { header: 'Status', value: row => or(Option.orElse(row.progress, () => row.state)) },
            { header: 'Actions', value: row => or(row.actions) },
          ],
          style: Rows,
        },
        h,
      ),
    ])
  },
})

import * as UiFileDrop from '@foldkit/ui/fileDrop'
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, FileDrop, FileDropSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Attached = Schema.Struct({ name: Schema.String, size: Schema.Number })

// Whether a drag hovers is the zone's, placed by `Bundles.FileDrop`; what it
// took is the page's, from `ReceivedFiles`: names and sizes, since a Model
// holds no `File`. The zone is a label around a hidden file input, so a press
// opens the browser's dialog.
const App = Bundle.compose({ attached: Schema.Array(Attached) }).pipe(
  Bundle.withChild('zone', Bundles.FileDrop, {
    args: { id: 'drop' },
    onOut: out => model => ({
      model: FileDrop.OutMessage.match(out, {
        ReceivedFiles: ({ files }) => ({
          ...model,
          attached: [...model.attached, ...files.map(({ name, size }) => ({ name, size }))],
        }),
        RejectedNonFiles: () => model,
      }),
    }),
  }),
)

export default example({
  title: 'Dropped files',
  slots: FileDropSlots,
  recipe: Recipes.FileDrop,
  state: App.placements.runtime({ Model: App.Model, initial: { attached: [] } }),
  view: ({ style, model, onMessage, h }) =>
    h.submodel({
      slotId: model.zone.id,
      model: model.zone,
      view: UiFileDrop.view,
      viewInputs: {
        multiple: true,
        toView: FileDrop.toView([style.mixin], { h }, ({ root, input }) =>
          h.label(root, [
            h.span([], ['Drop files or click to browse']),
            h.span(
              [],
              [
                model.attached.length === 0
                  ? 'Nothing attached yet.'
                  : `${model.attached.length} attached: ${model.attached.map(file => file.name).join(', ')}`,
              ],
            ),
            h.input(input),
          ]),
        ),
      },
      toParentMessage: message => onMessage(App.Message.GotZoneMessage({ message })),
    }),
})

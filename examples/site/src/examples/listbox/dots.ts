import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Listbox, ListboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { t } from '../../snippets/theme.js'

const statuses = ['Backlog', 'In progress', 'Done'] as const
const Statuses = Listbox.many(statuses)
const colours: ReadonlyMap<string, string> = new Map([
  ['Backlog', t.text.muted],
  ['In progress', t.warning.default],
  ['Done', t.success.default],
])

const App = Bundle.compose({ statuses: Schema.Array(Schema.Literals(statuses)) }).pipe(
  Bundle.withChild('box', Bundles.Listbox, {
    args: { id: 'statuses', multiple: true },
    onOut: out => model => ({
      model: { ...model, statuses: Statuses.picked(model.statuses, out) },
    }),
  }),
)

const dot = (colour: string, overlap: boolean) =>
  ({
    display: 'inline-block',
    inlineSize: '0.75em',
    blockSize: '0.75em',
    borderRadius: '50%',
    background: colour,
    outline: `2px solid ${t.surface.base}`,
    marginInlineStart: overlap ? '-0.3em' : '0',
  }) satisfies Record<string, string>

// `icon` puts a dot before each row, and `trigger` draws what the trigger
// shows for the rows chosen: here, their dots overlapping.
export default example({
  title: 'Dots, overlapping on the trigger',
  slots: ListboxSlots,
  recipe: Recipes.Listbox,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { statuses: ['Backlog', 'Done'] },
  }),
  view: ({ style, model, onMessage, h }) =>
    Listbox.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'Status',
        choice: Statuses,
        value: model.statuses,
        option: status => ({
          label: status,
          icon: h.span([h.Style(dot(colours.get(status) ?? '', false))], []),
        }),
        trigger: chosen =>
          h.span(
            [h.Style({ display: 'inline-flex', alignItems: 'center' })],
            chosen.map((row, index) =>
              h.span([h.Style(dot(colours.get(row.label) ?? '', index > 0))], []),
            ),
          ),
        placeholder: 'Any status',
        style,
        mixins: Listbox.fluid,
      },
      h,
    ),
})

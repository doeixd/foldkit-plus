import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Listbox, ListboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const zones = ['Lisbon', 'New York', 'Tokyo'] as const
const Zone = Listbox.one(zones)
const offsets: Readonly<Record<(typeof zones)[number], string>> = {
  Lisbon: 'UTC+0',
  'New York': 'UTC−5',
  Tokyo: 'UTC+9',
}

const App = Bundle.compose({ zone: Schema.Option(Schema.Literals(zones)) }).pipe(
  Bundle.withChild('box', Bundles.Listbox, {
    args: { id: 'zone' },
    onOut: out => model => ({ model: { ...model, zone: Zone.picked(model.zone, out) } }),
  }),
)

// `trailing` is drawn after the label at the row's end: an offset, a count,
// a badge or a shortcut. It shows in the list, not on the trigger.
export default example({
  title: 'A trailing part',
  slots: ListboxSlots,
  recipe: Recipes.Listbox,
  state: App.placements.runtime({ Model: App.Model, initial: { zone: Option.none() } }),
  view: ({ style, model, onMessage, h }) =>
    Listbox.view(
      {
        model: model.box,
        onMessage: message => onMessage(App.Message.GotBoxMessage({ message })),
        label: 'Time zone',
        choice: Zone,
        value: model.zone,
        option: zone => ({ label: zone, trailing: h.span([], [offsets[zone]]) }),
        placeholder: 'Pick a time zone',
        style,
        mixins: Listbox.fluid,
      },
      h,
    ),
})

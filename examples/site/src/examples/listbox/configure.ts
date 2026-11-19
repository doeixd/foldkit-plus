import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Listbox, ListboxSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

const Quiet = Recipes.Listbox.style({ trigger: 'ghost', size: 'sm' })

// Stated once, at module scope: the look every filter of the application
// starts from, and a named preset over it.
const Filter = Listbox.configure({
  base: { style: Quiet, placeholder: 'Any', mixins: Listbox.fluid },
  presets: { owner: { placeholder: 'Anyone', words: { clear: 'Clear the owner' } } },
})

const statuses = ['Open', 'Closed'] as const
const owners = ['Ada', 'Grace', 'Linus'] as const
const Status = Listbox.one(statuses)
const Owner = Listbox.one(owners)

const App = Bundle.compose({
  status: Schema.Option(Schema.Literals(statuses)),
  owner: Schema.Option(Schema.Literals(owners)),
}).pipe(
  Bundle.withChild('statusBox', Bundles.Listbox, {
    args: { id: 'filter-status' },
    onOut: out => model => ({ model: { ...model, status: Status.picked(model.status, out) } }),
  }),
  Bundle.withChild('ownerBox', Bundles.Listbox, {
    args: { id: 'filter-owner' },
    onOut: out => model => ({ model: { ...model, owner: Owner.picked(model.owner, out) } }),
  }),
)

// Each use gives only what differs: its label, its value and its rows.
export default example({
  title: 'Configure once',
  slots: ListboxSlots,
  recipe: Recipes.Listbox,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { status: Option.none(), owner: Option.none() },
  }),
  view: ({ model, onMessage, h }) =>
    row(h, [
      Filter.view(
        {
          model: model.statusBox,
          onMessage: message => onMessage(App.Message.GotStatusBoxMessage({ message })),
          label: 'Status',
          choice: Status,
          value: model.status,
        },
        h,
      ),
      Filter.view(
        {
          model: model.ownerBox,
          onMessage: message => onMessage(App.Message.GotOwnerBoxMessage({ message })),
          label: 'Owner',
          choice: Owner,
          value: model.owner,
          preset: 'owner',
        },
        h,
      ),
    ]),
})

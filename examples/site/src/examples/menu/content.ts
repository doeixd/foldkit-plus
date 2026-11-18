import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Avatar, Bundles, Menu, MenuSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { note, stack } from '../../snippets/layout.js'

const people = [
  { value: 'ada', name: 'Ada Lovelace', text: 'Pushed the pricing page', time: '2m' },
  { value: 'grace', name: 'Grace Hopper', text: 'Asked for a review', time: '1h' },
]

const App = Bundle.compose({ last: Schema.String }).pipe(
  Bundle.withChild('menu', Bundles.Menu, {
    args: { id: 'inbox-menu', rows: people.map(({ value }) => ({ value })), isAnimated: true },
    onOut: out => model => ({
      model: { ...model, last: Menu.OutMessage.match(out, { Selected: ({ value }) => value }) },
    }),
  }),
)

// A row's `content` is drawn in place of its words: an avatar, a title and a
// time. `label` stays the row's name and its typeahead key.
export default example({
  title: 'Rows of your own',
  slots: MenuSlots,
  recipe: Recipes.Menu,
  state: App.placements.runtime({ Model: App.Model, initial: { last: '' } }),
  view: ({ style, model, onMessage, h }) =>
    stack(h, [
      Menu.view(
        {
          model: model.menu,
          rows: people.map(person => ({
            value: person.value,
            label: person.name,
            content: h.span(
              [h.Style({ display: 'flex', gap: '0.5rem', alignItems: 'center' })],
              [
                Avatar.view({ name: person.name }, h),
                h.span([], [`${person.name}: ${person.text} (${person.time})`]),
              ],
            ),
          })),
          buttonContent: h.span([], ['Notifications']),
          onMessage: message => onMessage(App.Message.GotMenuMessage({ message })),
          mixins: [style.mixin],
        },
        h,
      ),
      note(h, [model.last === '' ? 'Nothing opened yet' : `Opened: ${model.last}`]),
    ]),
})

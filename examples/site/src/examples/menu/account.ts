import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Menu, MenuSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { note, stack } from '../../snippets/layout.js'

const rows: ReadonlyArray<Menu.Row> = [
  { value: 'profile', label: 'Profile', group: 'Account' },
  { value: 'billing', label: 'Billing', group: 'Account' },
  { value: 'team', label: 'Switch team', items: [{ value: 'acme', label: 'Acme Inc' }] },
  { value: 'out', label: 'Sign out', tone: 'destructive' },
]

// A Bundle holds the menu's state and answers a chosen row as `Selected`.
const App = Bundle.compose({ last: Schema.String }).pipe(
  Bundle.withChild('menu', Bundles.Menu, {
    args: { id: 'account-menu', rows, isAnimated: true },
    onOut: out => model => ({
      model: { ...model, last: Menu.OutMessage.match(out, { Selected: ({ value }) => value }) },
    }),
  }),
)

// `header` and `footer` are Html in the panel, above and below the rows, in
// slots of their own: they are no row, so the keys pass over them.
export default example({
  title: 'A header and a footer',
  slots: MenuSlots,
  recipe: Recipes.Menu,
  state: App.placements.runtime({ Model: App.Model, initial: { last: '' } }),
  view: ({ style, model, onMessage, h }) =>
    stack(h, [
      Menu.view(
        {
          model: model.menu,
          rows,
          buttonContent: h.span([], ['Ada']),
          onMessage: message => onMessage(App.Message.GotMenuMessage({ message })),
          header: h.div([], [h.strong([], ['Ada Lovelace']), h.div([], ['ada@example.com'])]),
          footer: h.span([], ['Foldkit Plus 0.41']),
          mixins: [style.mixin, ...Menu.fluid],
        },
        h,
      ),
      note(h, [model.last === '' ? 'Nothing chosen yet' : `Chose: ${model.last}`]),
    ]),
})

import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Menu, MenuSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const rows: ReadonlyArray<Menu.Row> = [
  { value: 'open', label: 'Open' },
  { value: 'rename', label: 'Rename' },
  { value: 'delete', label: 'Delete', tone: 'destructive' },
]

const Roomy = forSlots(MenuSlots)(Recipes.Menu({ size: 'md' }))

// The look and the anchor every menu of the application starts from. Its
// `mixins` and the call's concatenate; the Model, rows and Messages stay at the call.
const AppMenu = Menu.configure({
  base: { mixins: [Roomy.mixin, ...Menu.fluid] },
  presets: { above: { anchor: { placement: 'top-start' } } },
})

const App = Bundle.compose({ last: Schema.String }).pipe(
  Bundle.withChild('menu', Bundles.Menu, {
    args: { id: 'file-menu', rows, isAnimated: true },
    onOut: out => model => ({
      model: { ...model, last: Menu.OutMessage.match(out, { Selected: ({ value }) => value }) },
    }),
  }),
)

export default example({
  title: 'Configure once',
  slots: MenuSlots,
  recipe: Recipes.Menu,
  state: App.placements.runtime({ Model: App.Model, initial: { last: '' } }),
  view: ({ model, onMessage, h }) =>
    h.div(
      [h.Style({ paddingBlockStart: '9rem' })],
      [
        AppMenu.view(
          {
            model: model.menu,
            rows,
            buttonContent: h.span([], ['File']),
            preset: 'above',
            onMessage: message => onMessage(App.Message.GotMenuMessage({ message })),
          },
          h,
        ),
      ],
    ),
})

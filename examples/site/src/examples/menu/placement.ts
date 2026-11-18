import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Menu, MenuSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const rows: ReadonlyArray<Menu.Row> = [
  { value: 'cut', label: 'Cut', shortcut: ['⌘', 'X'] },
  { value: 'copy', label: 'Copy', shortcut: ['⌘', 'C'] },
  { value: 'paste', label: 'Paste', shortcut: ['⌘', 'V'] },
]

const App = Bundle.compose({ last: Schema.String }).pipe(
  Bundle.withChild('menu', Bundles.Menu, {
    args: { id: 'edit-menu', rows, isAnimated: true },
    onOut: out => model => ({
      model: { ...model, last: Menu.OutMessage.match(out, { Selected: ({ value }) => value }) },
    }),
  }),
)

// `anchor` is merged over the default `{ placement: 'bottom-start', gap: 4 }`:
// here the panel opens above the button, at its end, with a wider gap.
export default example({
  title: 'Where it opens',
  slots: MenuSlots,
  recipe: Recipes.Menu,
  state: App.placements.runtime({ Model: App.Model, initial: { last: '' } }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ paddingBlockStart: '9rem' })],
      [
        Menu.view(
          {
            model: model.menu,
            rows,
            buttonContent: h.span([], ['Edit']),
            onMessage: message => onMessage(App.Message.GotMenuMessage({ message })),
            anchor: { placement: 'top-end', gap: 10 },
            mixins: [style.mixin],
          },
          h,
        ),
      ],
    ),
})

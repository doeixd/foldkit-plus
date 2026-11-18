import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Menu, MenuSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { note, stack } from '../../snippets/layout.js'

const rows: ReadonlyArray<Menu.Row> = [
  { value: 'open', label: 'Open', group: 'File', shortcut: ['⏎'] },
  { value: 'rename', label: 'Rename', group: 'File', shortcut: ['F2'] },
  {
    value: 'share',
    label: 'Share',
    group: 'File',
    items: [
      { value: 'email', label: 'Email' },
      { value: 'link', label: 'Copy link' },
    ],
  },
  { value: 'delete', label: 'Delete', group: 'Danger', tone: 'destructive', shortcut: ['⌫'] },
]

const App = Bundle.compose({ last: Schema.String }).pipe(
  Bundle.withChild('menu', Bundles.Menu, {
    args: { id: 'context-menu', rows, isAnimated: true },
    onOut: out => model => ({
      model: { ...model, last: Menu.OutMessage.match(out, { Selected: ({ value }) => value }) },
    }),
  }),
)

// A context menu is a Menu that opens where the area was pressed: a right
// press, Shift+F10 or the ContextMenu key, or a long press on a touch screen.
// `Menu.target` goes on the area; `opensAt: 'point'` places the panel at it.
export default example({
  title: 'A context menu',
  slots: MenuSlots,
  recipe: Recipes.Menu,
  state: App.placements.runtime({ Model: App.Model, initial: { last: '' } }),
  view: ({ style, model, onMessage, h }) => {
    const toMenu = (message: Menu.Message) => onMessage(App.Message.GotMenuMessage({ message }))
    return stack(h, [
      h.div(
        [
          ...Menu.target(toMenu, h),
          h.Tabindex(0),
          h.AriaLabel('report.pdf, right-click or Shift+F10 for its actions'),
          h.Style({
            padding: '2rem 3rem',
            border: '1px dashed currentColor',
            borderRadius: '0.5rem',
            cursor: 'context-menu',
          }),
        ],
        ['report.pdf'],
      ),
      Menu.view(
        {
          model: model.menu,
          rows,
          buttonContent: h.span([], ['Actions for report.pdf']),
          opensAt: 'point',
          onMessage: toMenu,
          mixins: [style.mixin],
          // The highlight must not chase the submenus' rows: they hold the menu's own rows.
          submenuMixins: [style.mixin, ...Menu.fluid],
        },
        h,
      ),
      note(h, [model.last === '' ? 'Nothing chosen yet' : `Chose: ${model.last}`]),
    ])
  },
})

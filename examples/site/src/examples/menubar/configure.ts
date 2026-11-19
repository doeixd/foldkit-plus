import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Menubar, MenubarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const BarStyle = Recipes.Menubar.style({})
const MenuStyle = Recipes.MenubarMenu.style({})

// The bar's look, its menus' look and where they open, stated once. A preset
// moves the menus: this one opens them above the bar.
const AppBar = Menubar.configure({
  base: { style: BarStyle, menuMixins: [MenuStyle.mixin] },
  presets: { footer: { anchor: { placement: 'top-start' } } },
})

const App = Bundle.compose({ last: Schema.String }).pipe(
  Bundle.withChild('bar', Bundles.Menubar, {
    args: { ids: ['view', 'help'] },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Configure once',
  slots: MenubarSlots,
  recipe: Recipes.Menubar,
  state: App.placements.runtime({ Model: App.Model, initial: { last: '' } }),
  view: ({ model, onMessage, h }) =>
    h.div(
      [h.Style({ paddingBlockStart: '8rem' })],
      [
        AppBar.view(
          {
            label: 'Application',
            model: model.bar,
            onMessage: message => onMessage(App.Message.GotBarMessage({ message })),
            preset: 'footer',
            menus: [
              { label: 'View', rows: [{ value: 'zoom', label: 'Zoom in' }] },
              { label: 'Help', rows: [{ value: 'docs', label: 'Documentation' }] },
            ],
          },
          h,
        ),
      ],
    ),
})

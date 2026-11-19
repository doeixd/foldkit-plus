import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Menubar, MenubarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { note, stack } from '../../snippets/layout.js'

const MenuStyle = Recipes.MenubarMenu.style({})

// The bar's state is a Bundle: one shut menu for each id, the first trigger
// the tab stop. A chosen row comes out as `Selected`, with the menu's index.
const App = Bundle.compose({ last: Schema.String }).pipe(
  Bundle.withChild('bar', Bundles.Menubar, {
    args: { ids: ['file', 'edit'], isAnimated: true },
    onOut: out => model => ({ model: { ...model, last: `menu ${out.menu}: ${out.value}` } }),
  }),
)

// `header` and `footer` are Html in a menu's panel, above and below its rows.
export default example({
  title: 'A bar with a header and a footer',
  slots: MenubarSlots,
  recipe: Recipes.Menubar,
  state: App.placements.runtime({ Model: App.Model, initial: { last: '' } }),
  view: ({ style, model, onMessage, h }) =>
    stack(h, [
      Menubar.view(
        {
          label: 'Application',
          model: model.bar,
          onMessage: message => onMessage(App.Message.GotBarMessage({ message })),
          menus: [
            {
              label: 'File',
              rows: [
                { value: 'new', label: 'New', shortcut: ['⌘', 'N'] },
                { value: 'open', label: 'Open', shortcut: ['⌘', 'O'] },
              ],
              header: h.span([], ['Recent files']),
              footer: h.span([], ['3 of 12 shown']),
            },
            {
              label: 'Edit',
              rows: [
                { value: 'undo', label: 'Undo', shortcut: ['⌘', 'Z'] },
                { value: 'redo', label: 'Redo', shortcut: ['⇧', '⌘', 'Z'] },
              ],
            },
          ],
          style,
          menuMixins: [MenuStyle.mixin],
        },
        h,
      ),
      note(h, [model.last === '' ? 'Nothing chosen yet' : `Chose ${model.last}`]),
    ]),
})

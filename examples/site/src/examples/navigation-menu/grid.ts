import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Nav, NavSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

// The open panel is the Bundle's; the current page is the application's, set
// on each entry's `current`.
const App = Bundle.compose({ page: Schema.String }).pipe(
  Bundle.withChild('nav', Bundles.Nav, { args: { id: 'grid-nav' } }),
)

// `icon` stands before a link's words, in a column of its own beside a panel
// link's two lines. `panel: 'grid'` lays the groups in equal columns, and
// `footer` is Html after them, in a slot of its own: no link, so no key stops on it.
export default example({
  title: 'A grid with icons and a footer',
  slots: NavSlots,
  recipe: Recipes.Nav,
  pins: { panel: 'grid' },
  state: App.placements.runtime({ Model: App.Model, initial: { page: '' } }),
  view: ({ style, model, onMessage, h }) =>
    Nav.view(
      {
        model: model.nav,
        onMessage: message => onMessage(App.Message.GotNavMessage({ message })),
        label: 'Site',
        mixins: [style.mixin],
        entries: [
          { label: 'Home', href: '#home', icon: outline(h, 'M2 7l6-5 6 5v7H2zM6 14v-4h4v4') },
          {
            id: 'products',
            label: 'Products',
            groups: [
              {
                title: 'Build',
                links: [
                  {
                    label: 'Mixins',
                    href: '#mixins',
                    description: 'Slots, styles and behaviours.',
                    icon: outline(h, 'M2 5l6-3 6 3v6l-6 3-6-3zM2 5l6 3 6-3M8 8v6'),
                  },
                  {
                    label: 'Remote',
                    href: '#remote',
                    description: 'Server facts, cached.',
                    icon: outline(h, 'M2 8h12M8 2a8 8 0 0 1 0 12M8 2a8 8 0 0 0 0 12'),
                  },
                ],
              },
              {
                title: 'Run',
                links: [
                  {
                    label: 'Sync',
                    href: '#sync',
                    description: 'Offline edits, in order.',
                    icon: outline(h, 'M3 8a5 5 0 0 1 9-3M13 8a5 5 0 0 1-9 3'),
                  },
                ],
              },
            ],
            footer: h.a([h.Href('#products')], ['Learn more about the packages']),
          },
        ],
      },
      h,
    ),
})

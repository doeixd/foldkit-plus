import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Nav, NavSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Pill = forSlots(NavSlots)(Recipes.Nav({ indicator: 'pill' }))

// The look and the direction every navigation of the application starts
// from, and a named preset over them. A use gives the Model and the entries.
const AppNav = Nav.configure({
  base: { mixins: [Pill.mixin, ...Nav.fluid] },
  presets: { sidebar: { orientation: 'vertical' } },
})

const App = Bundle.compose({ page: Schema.String }).pipe(
  Bundle.withChild('nav', Bundles.Nav, { args: { id: 'sidebar-nav' } }),
)

export default example({
  title: 'Configure once',
  slots: NavSlots,
  recipe: Recipes.Nav,
  state: App.placements.runtime({ Model: App.Model, initial: { page: '' } }),
  view: ({ model, onMessage, h }) =>
    AppNav.view(
      {
        model: model.nav,
        onMessage: message => onMessage(App.Message.GotNavMessage({ message })),
        label: 'Sections',
        preset: 'sidebar',
        entries: [
          { label: 'Overview', href: '#overview', current: true },
          { label: 'Settings', href: '#settings' },
          { label: 'Members', href: '#members' },
        ],
      },
      h,
    ),
})

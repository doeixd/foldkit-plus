import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Badge, Bundles, Recipes, Tabs, TabsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

const App = Bundle.compose({ folder: Schema.String }).pipe(
  Bundle.withChild('tabs', Bundles.Tabs, {
    args: { id: 'mail' },
    onOut: out => model => ({ model: { ...model, folder: out.value } }),
  }),
)

// A row's `icon` stands before its words, and `trailing` after them: here a
// Badge, composed in, so the tabs hold no count of their own.
export default example({
  title: 'Icons and counts',
  slots: TabsSlots,
  recipe: Recipes.Tabs,
  state: App.placements.runtime({ Model: App.Model, initial: { folder: 'inbox' } }),
  view: ({ style, model, onMessage, h }) =>
    Tabs.view(
      {
        model: model.tabs,
        onMessage: message => onMessage(App.Message.GotTabsMessage({ message })),
        label: 'Mail',
        value: model.folder,
        tabs: [
          {
            value: 'inbox',
            label: 'Inbox',
            icon: outline(h, 'M2 9h3l1 2h4l1-2h3M2 9l2-6h8l2 6v4H2z'),
            trailing: Badge.view({ text: '12' }, h),
            panel: h.p([], ['Twelve unread.']),
          },
          {
            value: 'drafts',
            label: 'Drafts',
            icon: outline(h, 'M3 13l1-4 7-7 3 3-7 7z'),
            trailing: Badge.view({ text: '3' }, h),
            panel: h.p([], ['Three drafts.']),
          },
          {
            value: 'sent',
            label: 'Sent',
            icon: outline(h, 'M2 8l12-5-5 12-2-5z'),
            panel: h.p([], ['Nothing waiting.']),
          },
        ],
        style,
        mixins: [...Tabs.fluid],
      },
      h,
    ),
})

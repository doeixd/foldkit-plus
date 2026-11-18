import { Card, CardSlots, Recipes, Sidebar, SidebarSlots } from 'foldkit-mixins-ui'
import { Theme } from 'foldkit-mixins/theme'
import { example } from '../../gallery/example.js'
import { Got, SheetStyle, sidebarState, workspace } from '../../snippets/sidebar.js'
import { forSlots } from '../../snippets/theme.js'

const Inset = forSlots(SidebarSlots)(Recipes.Sidebar({ variant: 'inset' }))
const Page = forSlots(CardSlots)(Recipes.Card({}))
const token = Theme.ref(Theme.standard())

// Borderless, on the frame's muted surface; the page beside it is the card.
export default example({
  title: 'Inset',
  slots: SidebarSlots,
  recipe: Recipes.Sidebar,
  state: sidebarState(Sidebar.init({ id: 'inset-sidebar', rows: [], open: ['settings'] })),
  view: ({ model, onMessage, h }) =>
    h.div(
      [
        h.Style({
          display: 'flex',
          blockSize: '26rem',
          inlineSize: 'min(42rem, 100%)',
          boxSizing: 'border-box',
          padding: token.space.xs,
          gap: token.space['2xs'],
          background: token.surface.muted,
          borderRadius: token.radius.lg,
        }),
      ],
      [
        Sidebar.view(
          {
            model: model.sidebar,
            onMessage: message => onMessage(Got({ message })),
            label: 'Workspace',
            groups: workspace(h),
            style: Inset,
            mixins: Sidebar.fluid,
            sheet: [SheetStyle.mixin],
          },
          h,
        ),
        // A grid, so the card stands the frame's full height.
        h.div(
          [h.Style({ display: 'grid', flex: '1 1 0', minInlineSize: '0' })],
          [
            Card.view(
              {
                title: 'Inbox',
                description: '12 unread, 3 flagged',
                content: h.p([h.Style({ margin: '0' })], ['The page stands on a card of its own.']),
                style: Page,
              },
              h,
            ),
          ],
        ),
      ],
    ),
})

import type { HtmlBuilder } from 'foldkit/html'
import { Avatar, Recipes, Sidebar, SidebarSlots } from 'foldkit-mixins-ui'
import { Theme } from 'foldkit-mixins/theme'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { Got, LogoStyle, SheetStyle, sidebarState } from '../../snippets/sidebar.js'

const token = Theme.ref(Theme.standard())
const guide = (label: string, current = false) => ({ label, href: '#', current })

const docs = <Outer>(h: HtmlBuilder<Outer>): ReadonlyArray<Sidebar.SidebarGroup> => [
  {
    id: 'start',
    title: 'Getting started',
    rows: [
      {
        id: 'install',
        label: 'Installation',
        href: '#',
        icon: outline(h, 'M8 2v8M5 7l3 3 3-3M3 13h10'),
      },
      {
        id: 'structure',
        label: 'Project structure',
        href: '#',
        icon: outline(h, 'M2 8l6 3 6-3M8 2l6 3-6 3-6-3z'),
      },
    ],
  },
  {
    id: 'build',
    title: 'Building your app',
    rows: [
      {
        id: 'routing',
        label: 'Routing',
        icon: outline(
          h,
          'M4 13a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM12 6a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM5.5 11.5H8a2.5 2.5 0 002.5-2.5V5.5',
        ),
        items: [guide('Defining routes'), guide('Pages and layouts', true), guide('Linking')],
      },
      {
        id: 'styling',
        label: 'Styling',
        href: '#',
        badge: 'New',
        icon: outline(h, 'M3 13l1-3 7-7 2 2-7 7zM9.5 4.5l2 2'),
      },
    ],
  },
  {
    id: 'reference',
    title: 'API reference',
    rows: [
      {
        id: 'components',
        label: 'Components',
        href: '#',
        icon: outline(h, 'M5 4L1 8l4 4M11 4l4 4-4 4'),
      },
    ],
  },
]

// Each heading opens and shuts its group, several at once, and a branch nests
// its pages. A group shuts over the time it opens in.
export default example({
  title: 'Collapsible sections',
  slots: SidebarSlots,
  recipe: Recipes.Sidebar,
  state: sidebarState(
    Sidebar.init({ id: 'sections-sidebar', rows: [], open: ['start', 'build', 'routing'] }),
  ),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ display: 'flex', blockSize: '26rem', inlineSize: 'min(42rem, 100%)' })],
      [
        Sidebar.view(
          {
            model: model.sidebar,
            onMessage: message => onMessage(Got({ message })),
            label: 'Documentation',
            groups: docs(h),
            header: {
              mark: Avatar.view({ name: 'Docs', initials: 'D', style: LogoStyle }, h),
              content: h.span(
                [h.Style({ display: 'grid', lineHeight: '1.25' })],
                [
                  h.strong([], ['Documentation']),
                  h.small([h.Style({ color: token.text.muted })], ['v1.0.1']),
                ],
              ),
            },
            style,
            mixins: Sidebar.fluid,
            sheet: [SheetStyle.mixin],
          },
          h,
        ),
        h.p([h.Style({ margin: '0', padding: '1rem' })], ['Pages and layouts']),
      ],
    ),
})

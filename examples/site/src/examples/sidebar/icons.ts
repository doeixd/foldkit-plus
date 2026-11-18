import { Avatar, Recipes, Sidebar, SidebarSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import {
  Got,
  LogoStyle,
  PersonStyle,
  SheetStyle,
  TipStyle,
  WORKSPACE_ROWS,
  sidebarState,
  workspace,
} from '../../snippets/sidebar.js'

// Collapsed to a rail of icons named in tooltips (a Tooltip per row, made by
// `init`'s `rows`); on a phone the opener shows the navigation in a Sheet. A
// rail keeps each end's mark, centred over the icons.
export default example({
  title: 'A rail of icons',
  slots: SidebarSlots,
  recipe: Recipes.Sidebar,
  state: sidebarState(
    Sidebar.init({ id: 'icons-sidebar', rows: WORKSPACE_ROWS, open: ['settings'] }),
  ),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ blockSize: '26rem', inlineSize: 'min(42rem, 100%)' })],
      [
        Sidebar.view(
          {
            model: model.sidebar,
            onMessage: message => onMessage(Got({ message })),
            label: 'Workspace',
            groups: workspace(h),
            header: {
              mark: Avatar.view({ name: 'Acme', style: LogoStyle }, h),
              content: h.strong([], ['Acme']),
            },
            footer: {
              mark: Avatar.view({ name: 'Ada Lovelace', style: PersonStyle }, h),
              content: h.span([], ['ada@acme.dev']),
            },
            collapse: 'icons',
            style,
            mixins: Sidebar.fluid,
            tooltip: [TipStyle.mixin],
            sheet: [SheetStyle.mixin],
          },
          h,
        ),
      ],
    ),
})

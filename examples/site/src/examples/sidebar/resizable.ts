import { Recipes, Sidebar, SidebarSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import {
  Got,
  SheetStyle,
  TipStyle,
  WORKSPACE_ROWS,
  sidebarState,
  workspace,
} from '../../snippets/sidebar.js'

// Its width is the sidebar's Model: drag the edge or use the arrows on it,
// and below half the least width it collapses, coming back at the width the
// drag began at.
export default example({
  title: 'Resizable',
  slots: SidebarSlots,
  recipe: Recipes.Sidebar,
  state: sidebarState(
    Sidebar.init({
      id: 'resizable-sidebar',
      rows: WORKSPACE_ROWS,
      open: ['settings'],
      width: { size: 224, min: 176, max: 320 },
    }),
  ),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ display: 'flex', blockSize: '24rem', inlineSize: 'min(40rem, 100%)' })],
      [
        Sidebar.view(
          {
            model: model.sidebar,
            onMessage: message => onMessage(Got({ message })),
            label: 'Workspace',
            groups: workspace(h),
            collapse: 'icons',
            style,
            mixins: Sidebar.fluid,
            tooltip: [TipStyle.mixin],
            sheet: [SheetStyle.mixin],
          },
          h,
        ),
        h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['The page.']),
      ],
    ),
})

import type { Html } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { type Sidebar, SidebarSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const sidebarRail = <Message>(style: NamedStyle<typeof SidebarSlots>, live: Live<Message>) =>
  Snippet.sidebar(
    style,
    live.widgets.sidebar,
    message => live.onWidget(Widgets.Message.GotSidebar({ message })),
    live.h,
  )

const sidebarOf =
  <Message>(live: Live<Message>, example: Widgets.SidebarExample) =>
  (message: Sidebar.Message) =>
    live.onWidget(Widgets.Message.GotSidebarOf({ example, message }))

/** A box of its own size: the preview centres what it holds, which a row would shrink to nothing. */
const sidebarBox = <Message>(live: Live<Message>, children: ReadonlyArray<Html>) =>
  live.h.div([live.h.Style({ blockSize: '26rem', inlineSize: 'min(42rem, 100%)' })], children)

export const showcase = fromRecipe(
  about('sidebar'),
  SidebarSlots,
  Recipes.Sidebar,
  sidebarRail,
  undefined,
  [
    { name: 'icons', title: 'A rail of icons', draw: sidebarRail },
    {
      name: 'resizable',
      title: 'Resizable',
      draw: (_style, live) =>
        live.h.div(
          // A box of its own size: the preview centres what it holds, which a split would shrink to nothing.
          [live.h.Style({ blockSize: '24rem', inlineSize: 'min(40rem, 100%)' })],
          [
            Snippet.sidebarResizable(
              live.widgets.sidebars.resizable,
              sidebarOf(live, 'resizable'),
              live.h,
            ),
          ],
        ),
    },
    {
      name: 'floating',
      title: 'Floating, with actions',
      draw: (_style, live) =>
        sidebarBox(live, [
          Snippet.sidebarFloating(
            live.widgets.sidebars.floating,
            sidebarOf(live, 'floating'),
            {
              last: live.widgets.sidebarActed,
              toMessage: action => live.onWidget(Widgets.Message.ActedInSidebar({ action })),
            },
            live.h,
          ),
        ]),
    },
    {
      name: 'inset',
      title: 'Inset',
      draw: (_style, live) =>
        sidebarBox(live, [
          Snippet.sidebarInset(live.widgets.sidebars.inset, sidebarOf(live, 'inset'), live.h),
        ]),
    },
    {
      name: 'sections',
      title: 'Collapsible sections',
      draw: (_style, live) =>
        sidebarBox(live, [
          Snippet.sidebarSections(
            live.widgets.sidebars.sections,
            sidebarOf(live, 'sections'),
            live.h,
          ),
        ]),
    },
    {
      name: 'switcher',
      title: 'Team switcher and account',
      draw: (_style, live) =>
        sidebarBox(live, [
          Snippet.sidebarSwitcher(
            live.widgets.sidebars.switcher,
            {
              team: live.widgets.team,
              teamMenu: live.widgets.teamMenu,
              userMenu: live.widgets.userMenu,
            },
            {
              onSidebar: sidebarOf(live, 'switcher'),
              onTeamMenu: message => live.onWidget(Widgets.Message.GotTeamMenu({ message })),
              onUserMenu: message => live.onWidget(Widgets.Message.GotUserMenu({ message })),
            },
            live.h,
          ),
        ]),
    },
  ],
)

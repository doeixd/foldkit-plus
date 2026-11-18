import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import * as Command from 'foldkit/command'
import { Avatar, Bundles, Menu, MenuSlots, Recipes, Sidebar, SidebarSlots } from 'foldkit-mixins-ui'
import { Theme } from 'foldkit-mixins/theme'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import {
  LogoStyle,
  PersonStyle,
  TipStyle,
  WORKSPACE_ROWS,
  workspace,
} from '../../snippets/sidebar.js'
import { forSlots } from '../../snippets/theme.js'

const token = Theme.ref(Theme.standard())
const TEAMS: ReadonlyArray<Menu.Row> = ['Acme Inc', 'Acme Corp.', 'Evil Corp.'].map(team => ({
  value: team,
  label: team,
}))
const ACCOUNT: ReadonlyArray<Menu.Row> = ['Account', 'Notifications', 'Log out'].map(row => ({
  value: row,
  label: row,
}))

// A menu whose trigger is the whole end beside its mark, as wide as the column.
const EndMenu = forSlots(MenuSlots)(
  Recipes.Menu.extend({
    base: {
      wrapper: { display: 'block', inlineSize: '100%' },
      button: {
        inlineSize: '100%',
        justifyContent: 'space-between',
        gap: token.space.xs,
        paddingInline: token.space.xs,
        border: '0',
        textAlign: 'start',
        fontWeight: 'inherit',
      },
    },
  })({}),
)

// The header switches teams and the footer opens the account's menu, each a
// Menu Bundle; a rail keeps their marks.
const App = Bundle.compose({ team: Schema.String, sidebar: Sidebar.Model }).pipe(
  Bundle.withMessages({ GotSidebar: { message: Sidebar.Message } }),
  Bundle.withChild('teams', Bundles.Menu, {
    args: { id: 'switcher-teams', rows: TEAMS, isAnimated: true },
    onOut: out => model => ({
      model: { ...model, team: Menu.OutMessage.match(out, { Selected: ({ value }) => value }) },
    }),
  }),
  Bundle.withChild('account', Bundles.Menu, {
    args: { id: 'switcher-account', rows: ACCOUNT, isAnimated: true },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Team switcher and account',
  slots: SidebarSlots,
  recipe: Recipes.Sidebar,
  state: App.placements.runtime({
    Model: App.Model,
    initial: {
      team: 'Acme Inc',
      sidebar: Sidebar.init({ id: 'switcher-sidebar', rows: WORKSPACE_ROWS }),
    },
    update: App.placements.update((model, { message }) => {
      const next = Sidebar.update(model.sidebar, message)
      return {
        model: next.model === model.sidebar ? model : { ...model, sidebar: next.model },
        commands: Command.mapMessages(next.commands ?? [], message =>
          App.Message.GotSidebar({ message }),
        ),
      }
    }),
  }),
  view: ({ style, model, onMessage, h }) => {
    const upDown = outline(h, 'M5 6l3-3 3 3M5 10l3 3 3-3')
    const lines = (first: string, second: string) =>
      h.span(
        [h.Style({ display: 'grid', minInlineSize: '0', lineHeight: '1.25' })],
        [h.strong([], [first]), h.small([h.Style({ color: token.text.muted })], [second])],
      )
    return h.div(
      [h.Style({ display: 'flex', blockSize: '26rem', inlineSize: 'min(42rem, 100%)' })],
      [
        Sidebar.view(
          {
            model: model.sidebar,
            onMessage: message => onMessage(App.Message.GotSidebar({ message })),
            label: 'Workspace',
            groups: workspace(h),
            header: {
              mark: Avatar.view({ name: model.team, style: LogoStyle }, h),
              content: Menu.view(
                {
                  model: model.teams,
                  rows: TEAMS,
                  buttonContent: h.span(
                    [h.Style({ display: 'contents' })],
                    [lines(model.team, 'Enterprise'), upDown],
                  ),
                  onMessage: message => onMessage(App.Message.GotTeamsMessage({ message })),
                  mixins: [EndMenu.mixin, ...Menu.fluid],
                },
                h,
              ),
            },
            footer: {
              mark: Avatar.view({ name: 'Ada Lovelace', style: PersonStyle }, h),
              content: Menu.view(
                {
                  model: model.account,
                  rows: ACCOUNT,
                  buttonContent: h.span(
                    [h.Style({ display: 'contents' })],
                    [lines('Ada Lovelace', 'ada@acme.dev'), upDown],
                  ),
                  onMessage: message => onMessage(App.Message.GotAccountMessage({ message })),
                  mixins: [EndMenu.mixin, ...Menu.fluid],
                },
                h,
              ),
            },
            collapse: 'icons',
            style,
            mixins: Sidebar.fluid,
            tooltip: [TipStyle.mixin],
          },
          h,
        ),
        h.p([h.Style({ margin: '0', padding: '1rem' })], [`The ${model.team} inbox.`]),
      ],
    )
  },
})

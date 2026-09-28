import { Slots, Style, type StyleValue } from 'foldkit-mixins'
import { Recipes, TabsSlots } from 'foldkit-mixins-ui'

import { forSlots, t } from '../../style.js'
import { container, demoSlots, demoStyles } from './shared.js'

export const TabsPageSlots = Slots.define({
  ...demoSlots,
  horizontal: container,
  vertical: container,
  tabLabel: container,
  panelContent: container,
  panelLead: container,
  panelEmphasis: container,
  panelNote: container,
})

export const TabsPageStyle = forSlots(TabsPageSlots)(
  {
    ...demoStyles,
    vertical: Style.self({ display: 'flex' }),
    panelLead: Style.self({ margin: `0 0 ${t.space.sm}`, color: t.text.default }),
    panelEmphasis: Style.self({ color: t.text.overt }),
    panelNote: Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
  },
  { name: 'TabsPageStyle' },
)

const border = `${t.border.thin} solid ${t.outline.subtle}`

/** Upstream's folder tabs: gray tabs, the selected one white and joined to its panel. */
const folderTab: StyleValue = Style.compose(
  Style.self({
    position: 'relative',
    padding: `${t.space.xs} ${t.space.md}`,
    border,
    background: t.surface.muted,
    color: t.text.muted,
    fontWeight: t.weight.normal,
  }),
  Style.pseudo(':hover:not([aria-selected="true"])', {
    background: t.surface.subtle,
    color: t.text.default,
  }),
  Style.pseudo('[aria-selected="true"]', {
    zIndex: '10',
    background: t.surface.base,
    color: t.text.overt,
    boxShadow: 'none',
  }),
)

const folderPanel: StyleValue = Style.self({
  padding: t.space.lg,
  border,
  background: t.surface.base,
})

const folderTabs = Recipes.Tabs.extend({
  base: { tablist: Style.self({ gap: '0' }), tab: folderTab, panel: folderPanel },
})

export const HorizontalTabsStyle = forSlots(TabsSlots)(
  folderTabs.extend({
    base: {
      tab: Style.compose(
        Style.self({
          marginBottom: '-1px',
          borderRadius: `${t.radius.lg} ${t.radius.lg} 0 0`,
        }),
        Style.pseudo('[aria-selected="true"]', { borderBottomColor: 'transparent' }),
      ),
      panel: Style.self({ borderRadius: `0 ${t.radius.lg} ${t.radius.lg} ${t.radius.lg}` }),
    },
  })({ variant: null }),
  { name: 'HorizontalTabsStyle' },
)

export const VerticalTabsStyle = forSlots(TabsSlots)(
  folderTabs.extend({
    base: {
      tablist: Style.self({ flexDirection: 'column' }),
      tab: Style.compose(
        Style.self({
          marginRight: '-1px',
          textAlign: 'left',
          borderRadius: `${t.radius.lg} 0 0 ${t.radius.lg}`,
        }),
        Style.pseudo('[aria-selected="true"]', { borderRightColor: 'transparent' }),
      ),
      panel: Style.self({
        flex: '1',
        borderRadius: `0 ${t.radius.lg} ${t.radius.lg} ${t.radius.lg}`,
      }),
    },
  })({ variant: null }),
  { name: 'VerticalTabsStyle' },
)

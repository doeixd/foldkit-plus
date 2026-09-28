/**
 * The page's appearance, as `foldkit-mixins` data. `main.ts` publishes the
 * Slots and draws the markup; everything it looks like lives here.
 *
 * Every slot style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the shipped recipes and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Capability, Layers, Slot, Slots, Style, type StyleValue } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, Recipes, TabsSlots } from 'foldkit-mixins-ui'

const L = Layers.standard
const app = L.layer('app')

// THEME

/** Indigo accent over near-neutral slate surfaces, like upstream's palette. */
const palette = Theme.oklch({ accent: { h: 277, c: 0.2, l: '51%' }, surfaceSaturation: 0.01 })

const theme = Theme.compose(Theme.tokens, palette)

const t = Theme.ref(theme)

const panel: StyleValue = Style.self({
  background: t.surface.base,
  borderRadius: t.radius.lg,
  boxShadow: '0 1px 3px rgb(0 0 0 / 10%)',
})

const stack = (gap: string): StyleValue => L.in('layouts', Layout.stack({ gap }))

// PAGE

export const PageSlots = Slots.define({
  page: Slot.make({ capability: Capability.Container }),
  column: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  lead: Slot.make({ capability: Capability.Container }),
  section: Slot.make({ capability: Capability.Container }),
  toolbar: Slot.make({ capability: Capability.Container }),
  heading: Slot.make({ capability: Capability.Container }),
  hint: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  rowText: Slot.make({ capability: Capability.Container }),
  rowTitle: Slot.make({ capability: Capability.Container }),
  rowExcerpt: Slot.make({ capability: Capability.Container }),
  badge: Slot.make({ capability: Capability.Container }),
  card: Slot.make({ capability: Capability.Container }),
  cardTitle: Slot.make({ capability: Capability.Container }),
  byline: Slot.make({ capability: Capability.Container }),
  body: Slot.make({ capability: Capability.Container }),
  footnote: Slot.make({ capability: Capability.Container }),
  stats: Slot.make({ capability: Capability.Container }),
  stat: Slot.make({ capability: Capability.Container }),
  statLabel: Slot.make({ capability: Capability.Container }),
  statValue: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Container }),
  updatedAt: Slot.make({ capability: Capability.Container }),
  refreshing: Slot.make({ capability: Capability.Container }),
  placeholder: Slot.make({ capability: Capability.Container }),
  alert: Slot.make({ capability: Capability.Container }),
  alertText: Slot.make({ capability: Capability.Container }),
})

export const PageStyle = Style.forSlots(PageSlots)(
  {
    page: Style.self({
      boxSizing: 'border-box',
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      padding: t.space.lg,
      background: t.surface.muted,
      color: t.text.default,
    }),
    column: Style.compose(stack(t.space.lg), Style.self({ width: 'min(42rem, 100%)' })),
    header: stack(t.space['2xs']),
    title: Style.self({
      margin: '0',
      fontSize: t.size['3xl'],
      fontWeight: t.weight.bold,
      color: t.text.overt,
    }),
    lead: Style.self({ margin: '0', color: t.text.muted }),
    section: stack(t.space.md),
    toolbar: L.in('layouts', Layout.cluster({ justify: 'space-between', align: 'center' })),
    heading: Style.self({
      margin: '0',
      fontSize: t.size.xl,
      fontWeight: t.weight.bold,
      color: t.text.overt,
    }),
    hint: Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
    list: Style.compose(
      stack(t.space.xs),
      Style.self({ margin: '0', padding: '0', listStyle: 'none' }),
    ),
    item: Style.self({ margin: '0' }),
    rowText: Style.self({ textAlign: 'start' }),
    rowTitle: Style.self({ fontWeight: t.weight.semibold, color: t.text.overt }),
    rowExcerpt: Style.self({ fontSize: t.size.sm, color: t.text.muted }),
    badge: Style.self({
      flexShrink: '0',
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      color: t.success.ink,
      background: t.success.subtle,
      borderRadius: t.radius.full,
      padding: `${t.space['2xs']} ${t.space.xs}`,
    }),
    card: Style.compose(stack(t.space.sm), panel, Style.self({ padding: t.space.lg })),
    cardTitle: Style.self({
      margin: '0',
      fontSize: t.size['2xl'],
      fontWeight: t.weight.bold,
      color: t.text.overt,
    }),
    byline: Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
    body: Style.self({ margin: '0', lineHeight: t.leading.relaxed }),
    footnote: Style.self({ margin: '0', fontSize: t.size.xs, color: t.text.subtle }),
    stats: Style.self({
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: t.space.md,
    }),
    stat: Style.compose(stack(t.space['3xs']), panel, Style.self({ padding: t.space.md })),
    statLabel: Style.self({ fontSize: t.size.sm, color: t.text.muted }),
    statValue: Style.self({
      fontSize: t.size['2xl'],
      fontWeight: t.weight.bold,
      color: t.text.overt,
    }),
    status: Style.compose(
      L.in('layouts', Layout.cluster({ gap: t.space.sm, align: 'center' })),
      Style.self({ fontSize: t.size.sm, color: t.text.muted }),
    ),
    updatedAt: Style.self({}),
    refreshing: Style.self({ fontWeight: t.weight.semibold, color: t.accent.ink }),
    placeholder: Style.compose(
      panel,
      Style.self({ padding: t.space.lg, textAlign: 'center', color: t.text.muted }),
    ),
    alert: Style.compose(
      L.in('layouts', Layout.cluster({ justify: 'space-between', align: 'center' })),
      Style.self({
        padding: t.space.md,
        borderRadius: t.radius.lg,
        border: `1px solid ${t.error.outline}`,
        background: t.error.subtle,
        color: t.error.ink,
      }),
    ),
    alertText: Style.self({ margin: '0' }),
  },
  { name: 'PageStyle', layer: app },
)

// TABS

/** The shipped pill tabs, with the selected tab filled in the accent. */
const AppTabs = Recipes.Tabs.extend({
  base: {
    tablist: Style.self({ background: 'transparent', padding: '0', gap: t.space.xs }),
    tab: Style.compose(
      Style.self({
        background: t.surface.base,
        borderRadius: t.radius.lg,
        fontWeight: t.weight.semibold,
      }),
      Style.pseudo('[aria-selected="true"]', {
        background: t.accent.default,
        color: t.accent['on-fill'],
      }),
    ),
    panel: Style.self({ paddingBlock: '0' }),
  },
})

export const TabsStyle = Style.forSlots(TabsSlots)(AppTabs({ variant: 'pill' }), {
  name: 'TabsStyle',
  layer: app,
})

// BUTTONS

/** Invalidate and Refresh: a white button in the toolbar. */
export const ToolbarButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
  { name: 'ToolbarButtonStyle', layer: app },
)

/** A post in the list: the whole row is the button. */
export const PostButtonStyle = Style.forSlots(ButtonSlots)(
  {
    button: Style.compose(
      L.in('layouts', Layout.cluster({ justify: 'space-between', align: 'center' })),
      panel,
      Style.self({
        boxSizing: 'border-box',
        width: '100%',
        padding: `${t.space.sm} ${t.space.md}`,
        border: '0',
        font: 'inherit',
        color: 'inherit',
        textAlign: 'start',
        cursor: 'pointer',
      }),
      Style.pseudo(':hover', { background: t.surface.subtle }),
      Style.pseudo(':focus-visible', {
        outline: `2px solid ${t.outline.focus}`,
        outlineOffset: '2px',
      }),
    ),
  },
  { name: 'PostButtonStyle', layer: app },
)

/** Back to posts: a link-like button that keeps to its label's width. */
const BackButton = Recipes.Button.extend({
  base: { button: Style.self({ alignSelf: 'flex-start' }) },
})

export const BackButtonStyle = Style.forSlots(ButtonSlots)(
  BackButton({ variant: 'ghost', size: 'sm' }),
  { name: 'BackButtonStyle', layer: app },
)

export const RetryButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'danger', size: 'sm' }),
  { name: 'RetryButtonStyle', layer: app },
)

// STYLESHEET

/**
 * What a slot cannot carry: the layer order, the tokens the styles read, and
 * the body defaults. The slot styles' own classes are injected when a Slot
 * first draws them, so they are not repeated here.
 */
export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens, { colorScheme: 'light' })),
  L.in('theme', Theme.root(palette, { omit: Theme.tokens, colorScheme: 'light' })),
  L.in('defaults', Defaults.body),
)

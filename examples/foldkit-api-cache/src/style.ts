/**
 * The page's appearance, as `foldkit-mixins` data. `main.ts` draws the markup
 * through the Slots declared here; everything it looks like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the shipped recipes and the `Layout`
 * pieces by layer order rather than by specificity.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ButtonSlots, Recipes, TabsSlots } from 'foldkit-mixins-ui'

/** Indigo accent over near-neutral slate surfaces, like upstream's palette. */
const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.oklch({ accent: { h: 277, c: 0.2, l: '51%' }, surfaceSaturation: 0.01 }),
  colorScheme: 'light',
})

export { stylesheet }

const panel = [U.bg('surface.base'), U.rounded('lg'), { boxShadow: '0 1px 3px rgb(0 0 0 / 10%)' }]

const stack = (gap: string): StyleValue => L.in('layouts', Layout.stack({ gap }))

// PAGE

export const CachePage = slots(
  {
    page: [
      U.flex,
      U.justify('center'),
      U.p('lg'),
      U.bg('surface.muted'),
      U.color('text.default'),
      { boxSizing: 'border-box', minHeight: '100vh' },
    ],
    column: [stack(t.space.lg), { width: 'min(42rem, 100%)' }],
    header: stack(t.space['2xs']),
    title: [U.text('3xl'), U.font('bold'), U.color('text.overt'), { margin: '0' }],
    lead: [U.color('text.muted'), { margin: '0' }],
    section: stack(t.space.md),
    toolbar: L.in('layouts', Layout.cluster({ justify: 'space-between', align: 'center' })),
    heading: [U.text('xl'), U.font('bold'), U.color('text.overt'), { margin: '0' }],
    hint: [U.text('sm'), U.color('text.muted'), { margin: '0' }],
    list: [stack(t.space.xs), { margin: '0', padding: '0', listStyle: 'none' }],
    item: { margin: '0' },
    rowText: { textAlign: 'start' },
    rowTitle: [U.font('semibold'), U.color('text.overt')],
    rowExcerpt: [U.text('sm'), U.color('text.muted')],
    badge: [
      U.text('xs'),
      U.font('semibold'),
      U.color('success.ink'),
      U.bg('success.subtle'),
      U.rounded('full'),
      { flexShrink: '0', padding: `${t.space['2xs']} ${t.space.xs}` },
    ],
    card: [stack(t.space.sm), panel, U.p('lg')],
    cardTitle: [U.text('2xl'), U.font('bold'), U.color('text.overt'), { margin: '0' }],
    byline: [U.text('sm'), U.color('text.muted'), { margin: '0' }],
    body: [U.leading('relaxed'), { margin: '0' }],
    footnote: [U.text('xs'), U.color('text.subtle'), { margin: '0' }],
    stats: [U.grid, U.gap('md'), { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }],
    stat: [stack(t.space['3xs']), panel, U.p('md')],
    statLabel: [U.text('sm'), U.color('text.muted')],
    statValue: [U.text('2xl'), U.font('bold'), U.color('text.overt')],
    status: [
      L.in('layouts', Layout.cluster({ gap: t.space.sm, align: 'center' })),
      U.text('sm'),
      U.color('text.muted'),
    ],
    updatedAt: {},
    refreshing: [U.font('semibold'), U.color('accent.ink')],
    placeholder: [panel, U.p('lg'), U.textCenter, U.color('text.muted')],
    alert: [
      L.in('layouts', Layout.cluster({ justify: 'space-between', align: 'center' })),
      U.p('md'),
      U.rounded('lg'),
      U.bg('error.subtle'),
      U.color('error.ink'),
      { border: `1px solid ${t.error.outline}` },
    ],
    alertText: { margin: '0' },
  },
  { name: 'PageStyle' },
)

// TABS

/** The shipped pill tabs, with the selected tab filled in the accent. */
const AppTabs = Recipes.Tabs.extend({
  base: {
    tablist: [{ background: 'transparent', padding: '0' }, U.gap('xs')],
    tab: [
      U.bg('surface.base'),
      U.rounded('lg'),
      U.font('semibold'),
      Style.pseudo('[aria-selected="true"]', {
        background: t.accent.default,
        color: t.accent['on-fill'],
      }),
    ],
    panel: { paddingBlock: '0' },
  },
})

export const TabsStyle = forSlots(TabsSlots)(AppTabs({ variant: 'pill' }), {
  name: 'TabsStyle',
})

// BUTTONS

/** Invalidate and Refresh: a white button in the toolbar. */
export const ToolbarButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
  { name: 'ToolbarButtonStyle' },
)

/** A post in the list: the whole row is the button. */
export const PostButtonStyle = forSlots(ButtonSlots)(
  {
    button: [
      L.in('layouts', Layout.cluster({ justify: 'space-between', align: 'center' })),
      panel,
      {
        boxSizing: 'border-box',
        width: '100%',
        padding: `${t.space.sm} ${t.space.md}`,
        border: '0',
        font: 'inherit',
        color: 'inherit',
        textAlign: 'start',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { background: t.surface.subtle }),
      Style.pseudo(':focus-visible', {
        outline: `2px solid ${t.outline.focus}`,
        outlineOffset: '2px',
      }),
    ],
  },
  { name: 'PostButtonStyle' },
)

/** Back to posts: a link-like button that keeps to its label's width. */
const BackButton = Recipes.Button.extend({
  base: { button: { alignSelf: 'flex-start' } },
})

export const BackButtonStyle = forSlots(ButtonSlots)(BackButton({ variant: 'ghost', size: 'sm' }), {
  name: 'BackButtonStyle',
})

export const RetryButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'danger', size: 'sm' }),
  { name: 'RetryButtonStyle' },
)

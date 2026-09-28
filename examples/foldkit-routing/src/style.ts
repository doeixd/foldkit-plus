/**
 * The routing example's appearance, as `foldkit-mixins` data. `main.ts` and
 * `page/people.ts` publish the Slots and draw the markup; everything it looks
 * like lives here.
 *
 * Every slot style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the shipped Button recipe and the
 * `Layout` pieces by layer order rather than by specificity.
 */
import { Capability, Layers, Slot, Slots, Style, type StyleValue } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, InputSlots, Recipes } from 'foldkit-mixins-ui'

const L = Layers.standard
const app = L.layer('app')

// THEME

/** Blue, as upstream's `blue-500` nav bar and links are. */
const palette = Theme.oklch({ accent: { h: 260, c: 0.21, l: '62%' } })

/** A white base, so the cards and the search field stand out from the gray page. */
const theme = Theme.compose(
  Theme.compose(Theme.tokens, palette),
  Theme.define({ knob: { 'base-l': '100%' } }),
)

const t = Theme.ref(theme)

const container = Slot.make({ capability: Capability.Container })

const content = L.in('layouts', Layout.center({ max: '56rem' }))

const heading: StyleValue = Style.self({
  margin: `0 0 ${t.space.lg}`,
  fontSize: t.size['4xl'],
  fontWeight: t.weight.bold,
  color: t.text.overt,
})

const errorHeading: StyleValue = Style.compose(heading, Style.self({ color: t.error.ink }))

const lead: StyleValue = Style.self({
  margin: `0 0 ${t.space.md}`,
  fontSize: t.size.lg,
  color: t.text.muted,
})

const link: StyleValue = Style.compose(
  Style.self({ color: t.accent.ink, textDecoration: 'none' }),
  Style.pseudo(':hover', { textDecoration: 'underline' }),
)

const bordered: StyleValue = Style.self({
  border: `${t.border.thin} solid ${t.outline.subtle}`,
  borderRadius: t.radius.lg,
})

const card: StyleValue = Style.compose(
  bordered,
  Style.self({ padding: t.space.lg, background: t.surface.subtle }),
)

const meta: StyleValue = Style.self({ fontSize: t.size.sm, color: t.text.muted })

// PAGE

export const PageSlots = Slots.define({
  page: container,
  header: container,
  nav: container,
  navList: container,
  navItem: container,
  navLink: container,
  main: container,
  content: container,
  heading: container,
  errorHeading: container,
  lead: container,
  link: container,
  backLink: container,
  article: container,
  card: container,
  details: container,
  detail: container,
  detailLabel: container,
  detailValue: container,
  entries: container,
  entry: container,
  entryMeta: container,
  breadcrumb: container,
  crumb: container,
  crumbSeparator: container,
  crumbCurrent: container,
  fileName: container,
  fileSize: container,
  missing: container,
})

export const PageStyle = Style.forSlots(PageSlots)(
  {
    page: Style.self({ minHeight: '100vh', background: t.surface.muted, color: t.text.default }),
    header: Style.self({ marginBottom: t.space.lg }),
    nav: Style.self({
      padding: t.space.md,
      background: t.accent.default,
      color: t.accent['on-fill'],
    }),
    navList: Style.compose(
      L.in('layouts', Layout.center({ max: '56rem', gutters: '0' })),
      L.in('layouts', Layout.cluster({ gap: t.space.lg })),
      Style.self({ margin: '0', listStyle: 'none' }),
    ),
    // The link to the section the route is in carries `aria-current="page"`.
    navLink: Style.compose(
      Style.self({
        display: 'inline-block',
        padding: `${t.space['2xs']} ${t.space.sm}`,
        borderRadius: t.radius.sm,
        fontWeight: t.weight.medium,
        color: 'inherit',
        textDecoration: 'none',
        transition: `background ${t.motion.fast} ${t.motion.ease}`,
      }),
      Style.pseudo(':hover', { background: t.accent.hover }),
      Style.pseudo('[aria-current="page"]', {
        background: `color-mix(in oklch, ${t.accent.active} 50%, transparent)`,
      }),
    ),
    main: Style.self({ paddingBlock: t.space.xl }),
    content,
    heading,
    errorHeading,
    lead,
    link,
    backLink: Style.compose(
      link,
      Style.self({ display: 'inline-block', marginBottom: t.space.md }),
    ),
    card,
    details: Style.self({
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: t.space.md,
    }),
    detailLabel: Style.self({
      margin: '0',
      fontSize: t.size.sm,
      fontWeight: t.weight.medium,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: '0.025em',
    }),
    detailValue: Style.self({
      margin: `${t.space['2xs']} 0 0`,
      fontSize: t.size.lg,
      color: t.text.overt,
    }),
    entries: Style.compose(
      bordered,
      Style.self({ margin: '0', padding: '0', listStyle: 'none', background: t.surface.base }),
    ),
    entry: Style.compose(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${t.space.sm} ${t.space.md}`,
      }),
      Style.pseudo(':not(:first-child)', {
        borderTop: `${t.border.thin} solid ${t.outline.subtle}`,
      }),
    ),
    entryMeta: meta,
    breadcrumb: Style.compose(
      L.in('layouts', Layout.cluster({ gap: t.space.xs })),
      Style.self({ marginBottom: t.space.lg, fontSize: t.size.sm }),
    ),
    crumb: L.in('layouts', Layout.cluster({ gap: t.space.xs })),
    crumbSeparator: Style.self({ color: t.text.subtle }),
    crumbCurrent: Style.self({ fontWeight: t.weight.medium, color: t.text.overt }),
    fileName: Style.self({
      margin: `0 0 ${t.space.xs}`,
      fontSize: t.size['2xl'],
      fontWeight: t.weight.bold,
      color: t.text.overt,
    }),
    fileSize: Style.self({ margin: '0', color: t.text.muted }),
  },
  { name: 'PageStyle', layer: app },
)

// PEOPLE

export const PeopleSlots = Slots.define({
  content: container,
  heading: container,
  search: container,
  form: container,
  field: container,
  history: container,
  historyLabel: container,
  historyTerm: container,
  status: container,
  people: container,
  person: container,
  personLink: container,
  personRow: container,
  personName: container,
  personRole: container,
})

export const PeopleStyle = Style.forSlots(PeopleSlots)(
  {
    content,
    heading,
    search: Style.self({ display: 'block', marginBottom: t.space.lg }),
    form: L.in('layouts', Layout.cluster({ gap: t.space.xs, align: 'stretch' })),
    field: Style.self({ flex: '1' }),
    history: Style.compose(
      L.in('layouts', Layout.cluster({ gap: t.space.xs })),
      Style.self({ marginBottom: t.space.lg }),
      meta,
    ),
    historyLabel: Style.self({ fontWeight: t.weight.medium }),
    historyTerm: Style.self({
      padding: `${t.space['2xs']} ${t.space.xs}`,
      borderRadius: t.radius.sm,
      background: t.surface.overt,
      fontFamily: t.font.mono,
      color: t.text.overt,
    }),
    status: Style.compose(lead, Style.self({ marginBottom: t.space.lg })),
    people: L.in('layouts', Layout.stack({ gap: t.space.sm })),
    person: Style.compose(
      bordered,
      Style.self({ listStyle: 'none', background: t.surface.base }),
      Style.pseudo(':hover', { background: t.surface.subtle }),
    ),
    personLink: Style.self({
      display: 'block',
      padding: t.space.md,
      color: 'inherit',
      textDecoration: 'none',
    }),
    personRow: Style.self({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }),
    personName: Style.self({
      margin: '0',
      fontSize: t.size.xl,
      fontWeight: t.weight.semibold,
      color: t.text.overt,
    }),
    personRole: Style.self({ margin: '0', color: t.text.muted }),
  },
  { name: 'PeopleStyle', layer: app },
)

// SEARCH

/** The label is for screen readers only, as upstream's `sr-only` is. */
export const SearchInputStyle = Style.forSlots(InputSlots)(
  {
    input: Style.compose(
      bordered,
      Style.self({
        boxSizing: 'border-box',
        width: '100%',
        padding: `${t.space.xs} ${t.space.md}`,
        font: 'inherit',
        color: t.text.default,
        background: t.surface.base,
        borderColor: t.outline.default,
      }),
      Style.pseudo(':focus', {
        outline: 'none',
        boxShadow: `0 0 0 ${t.border.thick} ${t.accent.default}`,
      }),
    ),
    label: Style.self({
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: '0',
    }),
  },
  { name: 'SearchInputStyle', layer: app },
)

export const SearchButtonStyle = Style.forSlots(ButtonSlots)(Recipes.Button(), {
  name: 'SearchButtonStyle',
  layer: app,
})

// STYLESHEET

/**
 * What a slot cannot carry: the layer order, the tokens the styles read, and
 * the body defaults. The slot styles' own classes are injected when a Slot
 * first draws them, so they are not repeated here. `colorScheme: 'light'`
 * keeps the page light in a dark browser, as upstream's is.
 */
export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens, { colorScheme: 'light' })),
  L.in('theme', Theme.root(theme, { omit: Theme.tokens, colorScheme: 'light' })),
  L.in('defaults', Defaults.body),
)

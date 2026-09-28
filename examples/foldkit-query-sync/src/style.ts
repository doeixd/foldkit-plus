/**
 * The explorer's appearance, as `foldkit-mixins` data. `main.ts` publishes the
 * Slots and draws the markup; everything it looks like lives here.
 *
 * Every slot style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the `Layout` pieces it composes by layer
 * order rather than by specificity.
 */
import { Capability, Layers, Slot, Slots, Style, type StyleValue } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, InputSlots } from 'foldkit-mixins-ui'

const L = Layers.standard
const app = L.layer('app')

// THEME

/**
 * Emerald, as upstream's Tailwind classes are. The hue shifts and the info
 * hue give the six badge tones their own families: the page shows no info
 * messages, so the info family is free to carry the orange one.
 */
const palette = Theme.oklch({
  accent: { h: 163, c: 0.145, l: '59.6%' },
  secondaryHueShift: 67,
  tertiaryHueShift: 140,
  surfaceSaturation: 0.003,
  feedback: { info: 50 },
})

/** A white base, so the controls and the table stand out from the page's `surface.subtle`. */
const theme = Theme.compose(
  Theme.compose(Theme.tokens, palette),
  Theme.define({ knob: { 'base-l': '100%' } }),
)

const t = Theme.ref(theme)

const container = Slot.make({ capability: Capability.Container })

// PAGE

export const PageSlots = Slots.define({
  page: container,
  header: container,
  headerInner: container,
  brand: container,
  tagline: container,
  main: container,
  content: container,
  heading: container,
  intro: container,
  controls: container,
  filter: container,
  filterButton: container,
  filterButtonContent: container,
  chevron: container,
  filterItems: container,
  filterOption: container,
  filterCheck: container,
  filterBackdrop: container,
  count: container,
  empty: container,
  emptyTitle: container,
  emptyHint: container,
  tableFrame: container,
  table: container,
  head: container,
  headerCell: container,
  numericHeaderCell: container,
  sortIndicator: container,
  row: container,
  nameCell: container,
  cell: container,
  numericCell: container,
  badge: container,
  footnote: container,
  notFound: container,
  notFoundHeading: container,
  notFoundText: container,
  backLink: container,
})

const bordered = (color: string): StyleValue =>
  Style.self({ border: `${t.border.thin} solid ${color}`, borderRadius: t.radius.lg })

const cell: StyleValue = Style.self({
  padding: `${t.space.sm} ${t.space.md}`,
  fontSize: t.size.sm,
  color: t.text.default,
})

/** A badge's colors, per the `data-tone` the view writes: the period or the diet it shows. */
const tone = (family: { readonly subtle: string; readonly ink: string }) => ({
  background: family.subtle,
  color: family.ink,
})

export const PageStyle = Style.forSlots(PageSlots)(
  {
    page: Style.self({
      minHeight: '100vh',
      background: t.surface.subtle,
      color: t.text.default,
    }),
    header: Style.self({
      background: t.accent.default,
      color: t.accent['on-fill'],
      padding: `${t.space.md} ${t.space.lg}`,
      marginBottom: t.space.xl,
      boxShadow: '0 1px 2px rgb(0 0 0 / 5%)',
    }),
    headerInner: Style.compose(
      L.in('layouts', Layout.center({ max: '72rem', gutters: '0' })),
      L.in('layouts', Layout.cluster({ gap: t.space.sm, align: 'center' })),
    ),
    brand: Style.self({ fontSize: t.size.lg, fontWeight: t.weight.semibold }),
    tagline: Style.self({
      fontSize: t.size.sm,
      color: `color-mix(in oklch, ${t.accent['on-fill']} 70%, ${t.accent.default})`,
    }),
    main: Style.self({ paddingBottom: t.space['2xl'] }),
    content: L.in('layouts', Layout.center({ max: '72rem' })),
    heading: Style.self({
      margin: `0 0 ${t.space.xs}`,
      fontSize: t.size['3xl'],
      fontWeight: t.weight.bold,
      color: t.text.overt,
    }),
    intro: Style.self({ margin: `0 0 ${t.space.lg}`, color: t.text.muted }),
    controls: Style.compose(
      L.in('layouts', Layout.cluster({ gap: t.space.sm, align: 'flex-start' })),
      Style.self({ marginBottom: t.space.lg }),
    ),
    filter: Style.self({ position: 'relative', display: 'inline-block' }),
    filterButton: Style.compose(
      bordered(t.outline.default),
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        minWidth: '10rem',
        padding: `${t.space.xs} ${t.space.md}`,
        font: 'inherit',
        fontSize: t.size.sm,
        color: t.text.default,
        background: t.surface.base,
        cursor: 'pointer',
        userSelect: 'none',
      }),
      Style.pseudo(':hover', { background: t.surface.subtle }),
      Style.pseudo(':focus-visible', {
        outline: `${t.border.thick} solid ${t.outline.focus}`,
        outlineOffset: '0',
      }),
    ),
    filterButtonContent: Style.self({
      display: 'flex',
      width: '100%',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.md,
    }),
    chevron: Style.self({ width: '1rem', height: '1rem', color: t.text.muted }),
    filterItems: Style.compose(
      bordered(t.outline.subtle),
      Style.self({
        minWidth: '10rem',
        overflow: 'hidden',
        zIndex: '10',
        background: t.surface.base,
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)',
        outline: 'none',
      }),
      // `@foldkit/ui` Listbox takes only a class name per option, so the
      // options are styled from their container, by the role and the
      // `data-active` the component writes.
      Style.nest('> [role="option"]', {
        padding: `${t.space.xs} ${t.space.sm}`,
        fontSize: t.size.sm,
        color: t.text.default,
        cursor: 'pointer',
      }),
      Style.nest('> [data-active]', { background: t.accent.subtle, color: t.accent.ink }),
    ),
    filterOption: Style.self({ display: 'flex', alignItems: 'center', gap: t.space.xs }),
    filterCheck: Style.compose(
      Style.self({
        width: '1rem',
        textAlign: 'center',
        color: t.accent.ink,
        visibility: 'hidden',
      }),
      Style.nest('[data-selected] &', { visibility: 'visible' }),
    ),
    filterBackdrop: Style.self({ position: 'fixed', inset: '0', zIndex: '0' }),
    count: Style.self({
      margin: `0 0 ${t.space.sm}`,
      fontSize: t.size.sm,
      color: t.text.muted,
    }),
    empty: Style.self({
      padding: `${t.space['2xl']} 0`,
      textAlign: 'center',
      color: t.text.muted,
    }),
    emptyTitle: Style.self({ margin: '0', fontSize: t.size.lg }),
    emptyHint: Style.self({ margin: `${t.space.xs} 0 0`, fontSize: t.size.sm }),
    tableFrame: Style.compose(
      bordered(t.outline.subtle),
      Style.self({ overflowX: 'auto', background: t.surface.base }),
    ),
    table: Style.self({ width: '100%', borderCollapse: 'collapse' }),
    head: Style.self({
      background: t.surface.subtle,
      borderBottom: `${t.border.thin} solid ${t.outline.subtle}`,
    }),
    headerCell: Style.self({ padding: '0', textAlign: 'left' }),
    numericHeaderCell: Style.self({ padding: '0', textAlign: 'right' }),
    sortIndicator: Style.self({ display: 'inline-block', width: '1rem', textAlign: 'center' }),
    row: Style.compose(
      Style.self({ borderBottom: `${t.border.thin} solid ${t.outline.subtle}` }),
      Style.pseudo(':hover', { background: t.surface.subtle }),
    ),
    nameCell: Style.compose(cell, Style.self({ fontWeight: t.weight.medium, color: t.text.overt })),
    cell,
    numericCell: Style.compose(
      cell,
      Style.self({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }),
    ),
    badge: Style.compose(
      Style.self({
        padding: `${t.space['3xs']} ${t.space.xs}`,
        borderRadius: t.radius.full,
        fontSize: t.size.xs,
        fontWeight: t.weight.medium,
      }),
      Style.states(
        {
          Triassic: tone(t.warning),
          Jurassic: tone(t.secondary),
          Cretaceous: tone(t.tertiary),
          Carnivore: tone(t.error),
          Herbivore: tone(t.success),
          Omnivore: tone(t.info),
        },
        'data-tone',
      ),
    ),
    footnote: Style.self({
      margin: `${t.space.lg} 0 0`,
      textAlign: 'center',
      fontSize: t.size.xs,
      color: t.text.muted,
    }),
    notFound: Style.compose(
      L.in('layouts', Layout.center({ max: '56rem' })),
      Style.self({ textAlign: 'center' }),
    ),
    notFoundHeading: Style.self({
      margin: `0 0 ${t.space.lg}`,
      fontSize: t.size['4xl'],
      fontWeight: t.weight.bold,
      color: t.error.ink,
    }),
    notFoundText: Style.self({
      margin: `0 0 ${t.space.md}`,
      fontSize: t.size.lg,
      color: t.text.muted,
    }),
    backLink: Style.compose(
      Style.self({ color: t.accent.ink, textDecoration: 'none' }),
      Style.pseudo(':hover', { textDecoration: 'underline' }),
    ),
  },
  { name: 'PageStyle', layer: app },
)

// SEARCH

export const SearchStyle = Style.forSlots(InputSlots)(
  {
    input: Style.compose(
      bordered(t.outline.default),
      Style.self({
        flex: '1',
        minWidth: '12rem',
        padding: `${t.space.xs} ${t.space.md}`,
        font: 'inherit',
        fontSize: t.size.sm,
        color: t.text.default,
        background: t.surface.base,
      }),
      Style.pseudo(':focus', {
        outline: 'none',
        borderColor: t.accent.default,
        boxShadow: `0 0 0 ${t.border.thick} ${t.accent.default}`,
      }),
    ),
  },
  { name: 'SearchStyle', layer: app },
)

// COLUMN HEADER

export const HeaderButtonStyle = Style.forSlots(ButtonSlots)(
  {
    button: Style.compose(
      Style.self({
        width: '100%',
        padding: `${t.space.sm} ${t.space.md}`,
        border: '0',
        background: 'transparent',
        font: 'inherit',
        fontSize: t.size.sm,
        fontWeight: t.weight.semibold,
        color: t.text.default,
        textAlign: 'inherit',
        cursor: 'pointer',
        userSelect: 'none',
        transition: `background ${t.motion.fast} ${t.motion.ease}`,
      }),
      Style.pseudo(':hover', { background: t.surface.muted }),
      Style.pseudo(':focus-visible', {
        outline: 'none',
        background: t.accent.subtle,
        color: t.accent.ink,
      }),
    ),
  },
  { name: 'HeaderButtonStyle', layer: app },
)

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

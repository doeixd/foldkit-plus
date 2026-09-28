/**
 * The explorer's appearance, as `foldkit-mixins` data. `main.ts` draws the
 * markup through the Slots declared here; everything it looks like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the `Layout` pieces it composes by layer
 * order rather than by specificity.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ButtonSlots, InputSlots } from 'foldkit-mixins-ui'

/**
 * Emerald, as upstream's Tailwind classes are. The hue shifts and the info
 * hue give the six badge tones their own families: the page shows no info
 * messages, so the info family is free to carry the orange one.
 * A white base, so the controls and the table stand out from the page's
 * `surface.subtle`.
 */
const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.compose(
    Theme.oklch({
      accent: { h: 163, c: 0.145, l: '59.6%' },
      secondaryHueShift: 67,
      tertiaryHueShift: 140,
      surfaceSaturation: 0.003,
      feedback: { info: 50 },
    }),
    Theme.define({ knob: { 'base-l': '100%' } }),
  ),
  colorScheme: 'light',
})

export { stylesheet }

const bordered = (color: string): StyleValue =>
  Style.self({ border: `${t.border.thin} solid ${color}`, borderRadius: t.radius.lg })

const cell = [U.py('sm'), U.px('md'), U.text('sm'), U.color('text.default')]

/** A badge's colors, per the `data-tone` the view writes: the period or the diet it shows. */
const tone = (family: { readonly subtle: string; readonly ink: string }) => ({
  background: family.subtle,
  color: family.ink,
})

// PAGE

export const ExplorerPage = slots(
  {
    page: [U.bg('surface.subtle'), U.color('text.default'), { minHeight: '100vh' }],
    header: [
      U.bg('accent.default'),
      U.color('accent.on-fill'),
      {
        padding: `${t.space.md} ${t.space.lg}`,
        marginBottom: t.space.xl,
        boxShadow: '0 1px 2px rgb(0 0 0 / 5%)',
      },
    ],
    headerInner: [
      L.in('layouts', Layout.center({ max: '72rem', gutters: '0' })),
      L.in('layouts', Layout.cluster({ gap: t.space.sm, align: 'center' })),
    ],
    brand: [U.text('lg'), U.font('semibold')],
    tagline: [
      U.text('sm'),
      { color: `color-mix(in oklch, ${t.accent['on-fill']} 70%, ${t.accent.default})` },
    ],
    main: { paddingBottom: t.space['2xl'] },
    content: L.in('layouts', Layout.center({ max: '72rem' })),
    heading: [
      U.text('3xl'),
      U.font('bold'),
      U.color('text.overt'),
      { margin: `0 0 ${t.space.xs}` },
    ],
    intro: [U.color('text.muted'), { margin: `0 0 ${t.space.lg}` }],
    controls: [
      L.in('layouts', Layout.cluster({ gap: t.space.sm, align: 'flex-start' })),
      { marginBottom: t.space.lg },
    ],
    filter: { position: 'relative', display: 'inline-block' },
    filterButton: [
      bordered(t.outline.default),
      U.text('sm'),
      U.color('text.default'),
      U.bg('surface.base'),
      U.selectNone,
      U.pointer,
      {
        display: 'inline-flex',
        alignItems: 'center',
        minWidth: '10rem',
        padding: `${t.space.xs} ${t.space.md}`,
        font: 'inherit',
      },
      Style.pseudo(':hover', { background: t.surface.subtle }),
      Style.pseudo(':focus-visible', {
        outline: `${t.border.thick} solid ${t.outline.focus}`,
        outlineOffset: '0',
      }),
    ],
    filterButtonContent: {
      display: 'flex',
      width: '100%',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.md,
    },
    chevron: [U.color('text.muted'), { width: '1rem', height: '1rem' }],
    filterItems: [
      bordered(t.outline.subtle),
      U.bg('surface.base'),
      {
        minWidth: '10rem',
        overflow: 'hidden',
        zIndex: '10',
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)',
        outline: 'none',
      },
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
    ],
    filterOption: [U.flex, U.items('center'), U.gap('xs')],
    filterCheck: [
      U.textCenter,
      U.color('accent.ink'),
      { width: '1rem', visibility: 'hidden' },
      Style.nest('[data-selected] &', { visibility: 'visible' }),
    ],
    filterBackdrop: { position: 'fixed', inset: '0', zIndex: '0' },
    count: [U.text('sm'), U.color('text.muted'), { margin: `0 0 ${t.space.sm}` }],
    empty: [U.textCenter, U.color('text.muted'), { padding: `${t.space['2xl']} 0` }],
    emptyTitle: [U.text('lg'), { margin: '0' }],
    emptyHint: [U.text('sm'), { margin: `${t.space.xs} 0 0` }],
    tableFrame: [bordered(t.outline.subtle), U.bg('surface.base'), { overflowX: 'auto' }],
    table: { width: '100%', borderCollapse: 'collapse' },
    head: [U.bg('surface.subtle'), { borderBottom: `${t.border.thin} solid ${t.outline.subtle}` }],
    headerCell: { padding: '0', textAlign: 'left' },
    numericHeaderCell: { padding: '0', textAlign: 'right' },
    sortIndicator: { display: 'inline-block', width: '1rem', textAlign: 'center' },
    row: [
      { borderBottom: `${t.border.thin} solid ${t.outline.subtle}` },
      Style.pseudo(':hover', { background: t.surface.subtle }),
    ],
    nameCell: [cell, U.font('medium'), U.color('text.overt')],
    cell,
    numericCell: [cell, { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }],
    badge: [
      U.text('xs'),
      U.font('medium'),
      U.rounded('full'),
      { padding: `${t.space['3xs']} ${t.space.xs}` },
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
    ],
    footnote: [U.textCenter, U.text('xs'), U.color('text.muted'), { margin: `${t.space.lg} 0 0` }],
    notFound: [L.in('layouts', Layout.center({ max: '56rem' })), U.textCenter],
    notFoundHeading: [
      U.text('4xl'),
      U.font('bold'),
      U.color('error.ink'),
      { margin: `0 0 ${t.space.lg}` },
    ],
    notFoundText: [U.text('lg'), U.color('text.muted'), { margin: `0 0 ${t.space.md}` }],
    backLink: [
      U.color('accent.ink'),
      { textDecoration: 'none' },
      Style.pseudo(':hover', { textDecoration: 'underline' }),
    ],
  },
  { name: 'PageStyle' },
)

// SEARCH

export const SearchStyle = forSlots(InputSlots)(
  {
    input: [
      bordered(t.outline.default),
      U.text('sm'),
      U.color('text.default'),
      U.bg('surface.base'),
      {
        flex: '1',
        minWidth: '12rem',
        padding: `${t.space.xs} ${t.space.md}`,
        font: 'inherit',
      },
      Style.pseudo(':focus', {
        outline: 'none',
        borderColor: t.accent.default,
        boxShadow: `0 0 0 ${t.border.thick} ${t.accent.default}`,
      }),
    ],
  },
  { name: 'SearchStyle' },
)

// COLUMN HEADER

export const HeaderButtonStyle = forSlots(ButtonSlots)(
  {
    button: [
      U.text('sm'),
      U.font('semibold'),
      U.color('text.default'),
      U.selectNone,
      U.pointer,
      {
        width: '100%',
        padding: `${t.space.sm} ${t.space.md}`,
        border: '0',
        background: 'transparent',
        font: 'inherit',
        textAlign: 'inherit',
        transition: `background ${t.motion.fast} ${t.motion.ease}`,
      },
      Style.pseudo(':hover', { background: t.surface.muted }),
      Style.pseudo(':focus-visible', {
        outline: 'none',
        background: t.accent.subtle,
        color: t.accent.ink,
      }),
    ],
  },
  { name: 'HeaderButtonStyle' },
)

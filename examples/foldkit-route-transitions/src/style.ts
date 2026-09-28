/**
 * The route-transitions example's appearance, as `foldkit-mixins` data.
 * `main.ts` publishes the Slots and draws the markup; everything it looks like
 * lives here.
 *
 * Every slot style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the `Layout` pieces it composes by layer
 * order rather than by specificity.
 */
import { Capability, Event, Layers, Slot, Slots, Style, type StyleValue } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'

const L = Layers.standard
const app = L.layer('app')

/** Upstream's Tailwind `sm` and `lg`: two columns of paintings, and the log beside the page. */
const sm = '(min-width: 40rem)'
const lg = '(min-width: 64rem)'

// THEME

/**
 * Indigo, as upstream's nav bar and links are. The secondary hue is violet,
 * for the cold-load badge; success is shifted to emerald, for the entered one.
 */
const palette = Theme.oklch({
  accent: { h: 277, c: 0.24, l: '51%' },
  secondaryHueShift: 16,
  feedback: { success: 163 },
})

/** A white base, so the cards and the log stand out from the gray page. */
const theme = Theme.compose(
  Theme.compose(Theme.tokens, palette),
  Theme.define({ knob: { 'base-l': '100%' } }),
)

const t = Theme.ref(theme)

const container = Slot.make({ capability: Capability.Container })

const shadow = '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)'

const heading: StyleValue = Style.self({
  margin: `0 0 ${t.space.lg}`,
  fontSize: t.size['4xl'],
  fontWeight: t.weight.bold,
  color: t.text.overt,
})

const lead: StyleValue = Style.self({
  margin: `0 0 ${t.space.md}`,
  fontSize: t.size.lg,
  color: t.text.muted,
})

const link: StyleValue = Style.compose(
  Style.self({ color: t.accent.default, textDecoration: 'none' }),
  Style.pseudo(':hover', { textDecoration: 'underline' }),
)

const card: StyleValue = Style.self({
  overflow: 'hidden',
  borderRadius: t.radius.lg,
  background: t.surface.base,
  boxShadow: shadow,
})

const muted = (fontSize: string): StyleValue =>
  Style.self({ margin: '0', fontSize, color: t.text.muted })

const tone = (family: { readonly subtle: string; readonly ink: string }) => ({
  background: family.subtle,
  color: family.ink,
})

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
  sectionHeading: container,
  errorHeading: container,
  lead: container,
  intro: container,
  link: container,
  tipsLabel: container,
  tips: container,
  tip: container,
  loading: container,
  paintingGrid: container,
  paintingItem: container,
  paintingCard: container,
  swatch: container,
  cardBody: container,
  cardTitle: container,
  cardArtist: container,
  backLink: container,
  article: container,
  banner: container,
  articleBody: container,
  articleTitle: container,
  articleArtist: container,
  neighbors: container,
  neighborLink: container,
  neighborMissing: container,
  position: container,
  draft: Slot.make({ capability: Capability.TextInput, events: [Event.Input] }),
  saved: container,
  nothingSaved: container,
  savedCard: container,
  savedLabel: container,
  savedText: container,
  log: container,
  logTitle: container,
  logIntro: container,
  logList: container,
  logEntry: container,
  logSummary: container,
  badges: container,
  badge: container,
})

export const PageStyle = Style.forSlots(PageSlots)(
  {
    page: Style.self({ minHeight: '100vh', background: t.surface.muted, color: t.text.default }),
    nav: Style.self({
      padding: t.space.md,
      background: t.accent.default,
      color: t.accent['on-fill'],
    }),
    navList: Style.compose(
      L.in('layouts', Layout.center({ max: '72rem', gutters: '0' })),
      L.in('layouts', Layout.cluster({ gap: t.space.md })),
      Style.self({ margin: '0', padding: '0', listStyle: 'none' }),
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
      Style.pseudo(':hover', {
        background: `color-mix(in oklch, ${t.accent.default} 80%, white)`,
      }),
      Style.pseudo('[aria-current="page"]', { background: t.accent.active }),
    ),
    main: Style.compose(
      L.in('layouts', Layout.center({ max: '72rem', gutters: t.space.md })),
      Style.self({
        display: 'grid',
        gap: t.space.xl,
        alignItems: 'start',
        paddingBlock: t.space.xl,
      }),
      Style.media(lg, { gridTemplateColumns: 'minmax(0, 1fr) 360px' }),
    ),
    heading,
    sectionHeading: Style.compose(heading, Style.self({ marginBottom: t.space.xs })),
    errorHeading: Style.compose(heading, Style.self({ color: t.error.ink })),
    lead,
    intro: Style.self({ margin: `0 0 ${t.space.lg}`, color: t.text.muted }),
    link,
    tipsLabel: Style.self({ margin: `0 0 ${t.space.xs}`, color: t.text.muted }),
    tips: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.xs })),
      Style.self({ margin: '0', paddingLeft: t.space.lg, color: t.text.muted }),
    ),
    tip: Style.self({ listStyle: 'disc' }),
    loading: Style.self({
      padding: t.space['2xl'],
      border: `${t.border.thin} dashed ${t.outline.default}`,
      borderRadius: t.radius.lg,
      textAlign: 'center',
      color: t.text.muted,
    }),
    paintingGrid: Style.compose(
      Style.self({
        display: 'grid',
        gap: t.space.md,
        margin: '0',
        padding: '0',
        listStyle: 'none',
      }),
      Style.media(sm, { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }),
    ),
    paintingCard: Style.compose(
      card,
      Style.self({
        display: 'block',
        color: 'inherit',
        textDecoration: 'none',
        transition: `box-shadow ${t.motion.fast} ${t.motion.ease}`,
      }),
      Style.pseudo(':hover', {
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      }),
    ),
    // The painting's colours arrive on the element as `--painting-gradient`.
    swatch: Style.self({ height: '7rem', background: 'var(--painting-gradient)' }),
    cardBody: Style.self({ padding: t.space.md }),
    cardTitle: Style.self({
      margin: '0',
      fontSize: t.size.md,
      fontWeight: t.weight.semibold,
      color: t.text.overt,
    }),
    cardArtist: muted(t.size.sm),
    backLink: Style.compose(
      link,
      Style.self({ display: 'inline-block', marginBottom: t.space.md }),
    ),
    article: card,
    banner: Style.self({ height: '14rem', background: 'var(--painting-gradient)' }),
    articleBody: Style.self({ padding: t.space.lg }),
    articleTitle: Style.self({
      margin: `0 0 ${t.space['2xs']}`,
      fontSize: t.size['3xl'],
      fontWeight: t.weight.bold,
      color: t.text.overt,
    }),
    articleArtist: muted(t.size.md),
    neighbors: Style.self({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: t.space.lg,
    }),
    neighborLink: Style.compose(link, Style.self({ fontWeight: t.weight.medium })),
    neighborMissing: Style.self({ color: t.outline.default }),
    position: muted(t.size.sm),
    draft: Style.compose(
      Style.self({
        boxSizing: 'border-box',
        display: 'block',
        width: '100%',
        height: '10rem',
        padding: t.space.md,
        font: 'inherit',
        color: t.text.default,
        background: t.surface.base,
        border: `${t.border.thin} solid ${t.outline.default}`,
        borderRadius: t.radius.lg,
      }),
      Style.pseudo(':focus', {
        outline: 'none',
        boxShadow: `0 0 0 ${t.border.thick} ${t.accent.default}`,
      }),
    ),
    saved: Style.self({ marginTop: t.space.lg }),
    nothingSaved: muted(t.size.sm),
    savedCard: Style.self({
      padding: t.space.md,
      background: t.surface.base,
      border: `${t.border.thin} solid ${t.outline.subtle}`,
      borderRadius: t.radius.lg,
    }),
    savedLabel: Style.self({
      margin: `0 0 ${t.space['2xs']}`,
      fontSize: t.size.sm,
      fontWeight: t.weight.medium,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: '0.025em',
    }),
    savedText: Style.self({ margin: '0', color: t.text.overt }),
    log: Style.compose(
      Style.self({
        padding: t.space.md,
        borderRadius: t.radius.lg,
        background: t.surface.base,
        boxShadow: shadow,
      }),
      Style.media(lg, { position: 'sticky', top: t.space.xl }),
    ),
    logTitle: Style.self({
      margin: `0 0 ${t.space['2xs']}`,
      fontSize: t.size.lg,
      fontWeight: t.weight.bold,
      color: t.text.overt,
    }),
    logIntro: Style.compose(muted(t.size.sm), Style.self({ marginBottom: t.space.md })),
    logList: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      Style.self({ margin: '0', padding: '0', listStyle: 'none' }),
    ),
    logEntry: Style.self({
      padding: t.space.sm,
      border: `${t.border.thin} solid ${t.outline.subtle}`,
      borderRadius: t.radius.md,
    }),
    logSummary: Style.compose(muted(t.size.xs), Style.self({ marginBottom: t.space.xs })),
    badges: L.in('layouts', Layout.cluster({ gap: '0.375rem' })),
    badge: Style.compose(
      Style.self({
        padding: `${t.space['3xs']} ${t.space.xs}`,
        borderRadius: t.radius.full,
        fontSize: t.size.xs,
        fontWeight: t.weight.medium,
        whiteSpace: 'nowrap',
      }),
      Style.states(
        {
          coldLoad: tone(t.secondary),
          entered: tone(t.success),
          exited: tone(t.warning),
          stayed: tone(t.info),
          within: { background: t.surface.default, color: t.text.muted },
        },
        'data-tone',
      ),
    ),
  },
  { name: 'PageStyle', layer: app },
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

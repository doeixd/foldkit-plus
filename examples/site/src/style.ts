/**
 * The site's appearance, as `foldkit-mixins` data. A quiet, monochrome page:
 * a rail on the left with the site's places and the page's outline, hairlines
 * between sections, the second half of a heading in grey, and a monospace
 * voice for labels. Markup the build renders inside static regions (an
 * article, a sidebar) is reached through its container's slot by element.
 */
import { Capability, Style, type Piece } from 'foldkit-mixins'
import { CodeBlockSlots, DrawerSlots, Recipes, TabsSlots, TooltipSlots } from 'foldkit-mixins-ui'
import { AppStyle } from 'foldkit-mixins/app'
import { Prose } from 'foldkit-mixins/prose'
import { Theme } from 'foldkit-mixins/theme'
import { STATIC_ATTRIBUTE } from 'foldkit-ssr/client'

import { declared } from './gallery/theme.js'

const { t, slots, stylesheet } = AppStyle.make({
  theme: Theme.make({
    accent: { hue: 270, chroma: { light: 0, dark: 0 }, lightness: { light: 14, dark: 96 } },
    // A white page, and a near-black one, as plain as the content.
    surface: { saturation: 0, lightness: { light: 100, dark: 14 } },
    type: { body: '"Geist", ui-sans-serif, system-ui, sans-serif' },
  }),
  tokens: Theme.define({
    // Grey that steps back: the second half of a heading, a label's number.
    site: { faint: Theme.lightDark('oklch(66% 0 0)', 'oklch(52% 0 0)') },
    font: { mono: '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace' },
  }),
})

export { stylesheet }

/** The site's code: the shipped recipe, colored from the theme's `syntax` group. */
export const CodeStyle = Style.forSlots(CodeBlockSlots)(Recipes.CodeBlock({}))

/**
 * Below this width `/create` stacks its preview and docks its knobs to the
 * bottom of the screen: the Drawer recipe's `below-xl`, read the same way.
 */
const ONE_COLUMN = '(max-width: 79.99rem)'
/** At and above it, the knobs are a column beside the preview. */
const COLUMNS = '(min-width: 80rem)'
/** What of the docked drawer shows peeking: its handle and the pane names. */
const DRAWER_PEEK = '6rem'

/** Below this width the rail becomes a bar over the page. */
const NARROW = '(max-width: 56rem)'
/** Below this width a doc page drops its "On this page" column. */
const NO_OUTLINE = '(max-width: 76rem)'
/** A phone: one card across, and a table's rows stacked. */
const PHONE = '(max-width: 36rem)'

const focus = Style.pseudo(':focus-visible', {
  outline: `2px solid ${t.accent.default}`,
  outlineOffset: '2px',
  borderRadius: t.radius.sm,
})

/** A link in the text's own colour that darkens under the pointer. */
const quiet = (color: string, ...more: ReadonlyArray<Piece>) =>
  Style.slot({ capability: Capability.Focusable }, [
    ...more,
    { color, textDecoration: 'none' },
    Style.pseudo(':hover', { color: t.text.overt }),
    focus,
  ])

const mono = { fontFamily: t.font.mono, fontSize: '0.75rem', letterSpacing: '0.02em' }
const rule = `${t.border.thin} solid ${t.outline.subtle}`

/** Links in a rendered list: the current one marked by `aria-current`. */
const navList = Style.compose(
  Style.nest('ul', { listStyle: 'none', margin: '0', padding: '0' }),
  Style.nest('li a', {
    display: 'block',
    padding: `0.3125rem 0 0.3125rem 0.75rem`,
    borderInlineStart: `${t.border.thin} solid ${t.outline.subtle}`,
    color: t.text.muted,
    textDecoration: 'none',
    fontSize: '0.875rem',
    lineHeight: '1.35',
  }),
  Style.nest('li a:hover', { color: t.text.overt }),
  Style.nest('li a[aria-current]', {
    color: t.text.overt,
    fontWeight: t.weight.medium,
    borderInlineStartColor: t.text.overt,
  }),
  Style.nest('a:focus-visible', { outline: `2px solid ${t.accent.default}`, outlineOffset: '2px' }),
)

const codeBox = {
  background: t.surface.muted,
  border: rule,
  borderRadius: t.radius.md,
}

export const SiteStyle = slots(
  {
    // The rail and the page beside it; on a phone, a bar above the page.
    shell: [
      {
        display: 'grid',
        gridTemplateColumns: 'var(--rail) minmax(0, 1fr)',
        maxWidth: '84rem',
        marginInline: 'auto',
        minHeight: '100dvh',
        '--rail': '15rem',
      },
      Style.media(NARROW, { gridTemplateColumns: 'minmax(0, 1fr)' }),
    ],
    rail: [
      {
        position: 'sticky',
        top: '0',
        alignSelf: 'start',
        height: '100dvh',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: `${t.space.xl} ${t.space.lg} ${t.space.xl} ${t.space.lg}`,
        borderInlineEnd: rule,
        display: 'flex',
        flexDirection: 'column',
        gap: t.space.lg,
        // Scrolling the rail to its end does not carry on into the page.
        overscrollBehavior: 'contain',
        scrollbarWidth: 'thin',
      },
      Style.media(NARROW, {
        height: 'auto',
        padding: `${t.space.sm} ${t.space.md}`,
        borderInlineEnd: '0',
        borderBlockEnd: rule,
        background: t.surface.base,
        zIndex: '10',
        gap: t.space.sm,
      }),
    ],
    railTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    brand: quiet(t.text.overt, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: t.space.xs,
      fontWeight: t.weight.semibold,
      letterSpacing: '-0.01em',
    }),
    brandMark: {
      display: 'inline-grid',
      placeItems: 'center',
      width: '1.375rem',
      height: '1.375rem',
      borderRadius: '999px',
      background: t.text.overt,
      color: t.surface.base,
      fontFamily: t.font.mono,
      fontSize: '0.6875rem',
      fontWeight: t.weight.bold,
    },
    menuButton: Style.slot({ capability: Capability.Focusable }, [
      {
        display: 'none',
        font: 'inherit',
        fontSize: '0.875rem',
        color: t.text.default,
        background: 'transparent',
        border: rule,
        borderRadius: t.radius.md,
        padding: `0.25rem ${t.space.sm}`,
        cursor: 'pointer',
      },
      Style.media(NARROW, { display: 'inline-block' }),
      focus,
    ]),
    // What the rail holds below the brand; on a phone, only while the menu is open.
    railBody: [
      { display: 'flex', flexDirection: 'column', gap: t.space.lg },
      Style.nest('&[data-open="false"]', { display: 'var(--rail-closed, flex)' }),
      // On a phone the open menu scrolls on its own, under the bar it opens from.
      Style.media(NARROW, {
        paddingBlock: t.space.sm,
        '--rail-closed': 'none',
        maxBlockSize: 'calc(100dvh - 3.75rem)',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
      }),
    ],
    nav: [
      { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
      Style.nest('a', {
        color: t.text.muted,
        textDecoration: 'none',
        fontSize: '0.9375rem',
        padding: '0.1875rem 0 0.1875rem 0.75rem',
        borderInlineStart: '2px solid transparent',
      }),
      Style.nest('a:hover', { color: t.text.overt }),
      Style.nest('a[aria-current="page"]', {
        color: t.text.overt,
        borderInlineStartColor: t.text.overt,
      }),
      Style.nest('a:focus-visible', {
        outline: `2px solid ${t.accent.default}`,
        outlineOffset: '2px',
      }),
    ],
    railRule: { border: '0', borderBlockStart: rule, margin: '0' },
    railNote: [{ ...mono, color: t.text.subtle, margin: '0', lineHeight: '1.6' }],
    // The page's light or dark: three buttons in one outline, the chosen one filled.
    schemeChoice: [
      {
        display: 'flex',
        alignSelf: 'flex-start',
        border: rule,
        borderRadius: t.radius.md,
        overflow: 'hidden',
      },
      Style.nest('button', {
        ...mono,
        color: t.text.muted,
        background: 'transparent',
        border: '0',
        padding: `0.25rem ${t.space.sm}`,
        cursor: 'pointer',
      }),
      Style.nest('button[aria-pressed="true"]', {
        color: t.text.overt,
        background: t.surface.muted,
      }),
      Style.nest('button:focus-visible', {
        outline: `2px solid ${t.accent.default}`,
        outlineOffset: '-2px',
      }),
    ],
    // The home page's sections, numbered, in the mono voice.
    contents: [
      { listStyle: 'none', margin: '0', padding: '0', counterReset: 'section' },
      Style.nest('a', {
        ...mono,
        display: 'block',
        padding: '0.1875rem 0',
        color: t.text.muted,
        textDecoration: 'none',
      }),
      Style.nest('a:hover', { color: t.text.overt }),
      Style.nest('li', { counterIncrement: 'section' }),
      Style.nest('a::before', {
        content: 'counter(section, decimal-leading-zero) "  "',
        whiteSpace: 'pre',
        color: t.text.subtle,
      }),
    ],
    // A subsite's Guides and API, rendered by the build.
    sidebar: [
      { display: 'flex', flexDirection: 'column', gap: t.space.lg },
      Style.nest('h2', {
        ...mono,
        margin: `0 0 ${t.space.xs}`,
        textTransform: 'uppercase',
        color: t.text.subtle,
        fontWeight: t.weight.normal,
        letterSpacing: '0.08em',
      }),
      Style.nest('h3', {
        margin: `${t.space.md} 0 ${t.space['2xs']}`,
        fontSize: '0.8125rem',
        fontWeight: t.weight.medium,
        color: t.text.default,
      }),
      Style.nest('h3 code', { fontFamily: t.font.mono, fontSize: '0.75rem' }),
      navList,
      Style.nest(`> [${STATIC_ATTRIBUTE}] > * + *`, { marginBlockStart: t.space.lg }),
      // The subsite's own name, heading its sidebar.
      Style.nest('.subsite', { margin: '0', fontSize: '1rem', fontWeight: t.weight.semibold }),
      Style.nest('.subsite a', { color: t.text.overt, textDecoration: 'none' }),
    ],
    main: [
      {
        minWidth: '0',
        boxSizing: 'border-box',
        padding: `${t.space['2xl']} clamp(1rem, 4vw, 4rem) ${t.space['3xl']}`,
        // The hero's dot grid reaches past the gutter a phone has; clip makes
        // no scroll container, so the outline column stays sticky.
        overflowX: 'clip',
      },
      Style.media(NARROW, { padding: `${t.space.xl} ${t.space.md} ${t.space['2xl']}` }),
    ],

    // HOME

    // A faint dot grid behind the opening, fading out below it.
    hero: [
      {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: t.space.lg,
        maxWidth: '50rem',
        paddingBlockEnd: t.space['2xl'],
        isolation: 'isolate',
      },
      Style.pseudo('::before', {
        content: '""',
        position: 'absolute',
        inset: `calc(-1 * ${t.space['2xl']}) calc(-1 * ${t.space['2xl']}) 0`,
        zIndex: '-1',
        backgroundImage: `radial-gradient(${t.outline.default} 1px, transparent 1px)`,
        backgroundSize: '18px 18px',
        maskImage: 'linear-gradient(to bottom, black 20%, transparent 95%)',
        pointerEvents: 'none',
      }),
    ],
    eyebrow: {
      ...mono,
      alignSelf: 'flex-start',
      margin: '0',
      padding: `0.25rem ${t.space.sm}`,
      border: rule,
      borderRadius: '999px',
      background: t.surface.base,
      color: t.text.muted,
    },
    heroTitle: {
      margin: '0',
      fontSize: 'clamp(2.25rem, 5.5vw, 3.5rem)',
      lineHeight: '1.05',
      letterSpacing: '-0.035em',
      fontWeight: t.weight.semibold,
      color: t.text.overt,
      textWrap: 'balance',
    },
    quiet: { color: t.site.faint },
    lede: [
      {
        margin: '0',
        fontSize: '1.125rem',
        lineHeight: '1.6',
        color: t.text.muted,
        maxWidth: '38rem',
      },
      Style.nest('a', { color: t.text.overt, textUnderlineOffset: '0.2em' }),
    ],
    actions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: t.space.sm },
    primary: Style.slot({ capability: Capability.Focusable }, [
      {
        display: 'inline-flex',
        alignItems: 'center',
        padding: `0.625rem ${t.space.md}`,
        borderRadius: t.radius.md,
        background: t.accent.default,
        color: t.accent['on-fill'],
        fontWeight: t.weight.medium,
        fontSize: '0.9375rem',
        textDecoration: 'none',
      },
      Style.pseudo(':hover', { background: t.accent.hover }),
      focus,
    ]),
    install: Style.slot({ capability: Capability.Focusable }, [
      {
        display: 'inline-flex',
        alignItems: 'center',
        gap: t.space.sm,
        padding: `0.5625rem ${t.space.md}`,
        borderRadius: t.radius.md,
        border: `${t.border.thin} dashed ${t.outline.default}`,
        background: 'transparent',
        color: t.text.default,
        fontFamily: t.font.mono,
        fontSize: '0.8125rem',
        // A sentence, which wraps on a phone: from its start, not centred.
        textAlign: 'start',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { borderColor: t.text.muted }),
      focus,
    ]),
    installHint: {
      color: t.text.subtle,
      fontFamily: t.font.body,
      fontSize: '0.75rem',
      flexShrink: '0',
    },
    setup: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: t.space.xs,
    },
    setupLabel: { margin: '0', color: t.text.muted, fontSize: '0.9375rem' },
    // Above previews drawn in a theme the reader made, with the way back.
    themeNotice: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: `${t.space.xs} ${t.space.md}`,
      padding: `${t.space.xs} ${t.space.sm}`,
      borderRadius: t.radius.md,
      background: t.surface.muted,
      color: t.text.muted,
      fontSize: '0.875rem',
    },
    themeNoticeText: { margin: '0', marginInlineEnd: 'auto' },
    themeAction: Style.slot({ capability: Capability.Focusable }, [
      {
        padding: '0',
        border: 'none',
        background: 'none',
        color: t.text.overt,
        font: 'inherit',
        fontWeight: t.weight.medium,
        textDecoration: 'underline',
        textUnderlineOffset: '0.2em',
        cursor: 'pointer',
      },
      focus,
    ]),
    // Primitives running in the page, between an article and its pager.
    live: {
      ...codeBox,
      marginBlockStart: t.space['2xl'],
      padding: t.space.lg,
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.md,
    },
    liveRow: {
      display: 'flex',
      flexDirection: 'column',
      gap: t.space['2xs'],
      paddingBlockStart: t.space.md,
      borderBlockStart: rule,
    },
    liveValue: { ...mono, color: t.text.subtle, overflowWrap: 'anywhere' },
    liveButton: Style.slot({ capability: Capability.Interactive }, [
      {
        marginInlineStart: t.space.xs,
        padding: `0.125rem ${t.space.sm}`,
        borderRadius: t.radius.sm,
        border: rule,
        background: t.surface.base,
        color: t.text.overt,
        font: 'inherit',
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { borderColor: t.text.muted }),
      focus,
    ]),
    section: {
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.lg,
      paddingBlock: t.space['2xl'],
      borderBlockStart: rule,
      scrollMarginTop: t.space.lg,
    },
    sectionHead: { display: 'flex', flexDirection: 'column', gap: t.space['2xs'] },
    sectionNumber: { ...mono, margin: '0', color: t.text.subtle },
    sectionTitle: {
      margin: '0',
      fontSize: '1.5rem',
      letterSpacing: '-0.02em',
      fontWeight: t.weight.semibold,
      color: t.text.overt,
    },
    sectionText: [
      { margin: '0', color: t.text.muted, lineHeight: '1.65', maxWidth: '44rem' },
      Style.nest('code', { fontFamily: t.font.mono, fontSize: '0.875em', color: t.text.default }),
      Style.nest('a', { color: t.text.default, textUnderlineOffset: '3px' }),
    ],
    // The five rules, a grid of cells sharing hairlines.
    grid: [
      {
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        border: rule,
        borderRadius: t.radius.lg,
        overflow: 'hidden',
        listStyle: 'none',
        margin: '0',
        padding: '0',
        gap: t.border.thin,
        background: t.outline.subtle,
      },
      // Five across while they fit, then two, the fifth spanning; one on a phone.
      Style.media('(max-width: 80rem)', { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }),
      Style.at(
        '@media (max-width: 80rem)',
        Style.nest('> :last-child:nth-child(odd)', { gridColumn: '1 / -1' }),
      ),
      Style.media(PHONE, { gridTemplateColumns: 'minmax(0, 1fr)' }),
    ],
    cell: {
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.xs,
      padding: t.space.lg,
      background: t.surface.base,
    },
    cellLabel: { ...mono, color: t.text.subtle, margin: '0' },
    cellTitle: { margin: '0', fontSize: '1rem', fontWeight: t.weight.medium, color: t.text.overt },
    cellText: [
      { margin: '0', fontSize: '0.9375rem', color: t.text.muted, lineHeight: '1.55' },
      Style.nest('code', { fontFamily: t.font.mono, fontSize: '0.85em', color: t.text.default }),
    ],
    // The examples: a tab strip over a code frame.
    frame: { ...codeBox, overflow: 'hidden' },
    tabs: {
      display: 'flex',
      overflowX: 'auto',
      borderBlockEnd: rule,
      background: t.surface.base,
    },
    tab: Style.slot({ capability: Capability.Focusable }, [
      {
        font: 'inherit',
        fontSize: '0.875rem',
        padding: `0.75rem ${t.space.md}`,
        border: '0',
        borderInlineEnd: rule,
        background: 'transparent',
        color: t.text.muted,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      Style.pseudo(':hover', { color: t.text.overt }),
      Style.nest('&[aria-selected="true"]', {
        color: t.text.overt,
        background: t.surface.muted,
        boxShadow: `inset 0 -2px 0 ${t.text.overt}`,
      }),
      focus,
    ]),
    panel: [
      { display: 'grid', gridTemplateColumns: 'minmax(0, 16rem) minmax(0, 1fr)' },
      Style.nest('&[hidden]', { display: 'none' }),
      Style.media('(max-width: 44rem)', { gridTemplateColumns: 'minmax(0, 1fr)' }),
    ],
    panelAbout: [
      {
        display: 'flex',
        flexDirection: 'column',
        gap: t.space.sm,
        padding: t.space.lg,
        borderInlineEnd: rule,
        background: t.surface.base,
      },
      Style.media('(max-width: 44rem)', { borderInlineEnd: '0', borderBlockEnd: rule }),
    ],
    // The example's code block sits in the frame, which draws the border, and
    // a long one scrolls within it rather than taking the page.
    code: [
      { minWidth: '0' },
      Style.nest('figure', { border: '0', borderRadius: '0', background: 'transparent' }),
      Style.nest('pre', { maxBlockSize: '32rem', overflow: 'auto' }),
    ],
    // The packages, shelf by shelf, a card each.
    // Each shelf opens with a rule across and a heading of its own, so the
    // four read as parts of the list rather than as labels on their cards.
    shelf: {
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.md,
      marginBlockStart: t.space.xl,
      paddingBlockStart: t.space.lg,
      borderBlockStart: rule,
    },
    shelfHead: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
    shelfTitle: {
      margin: '0',
      fontSize: '1.25rem',
      letterSpacing: '-0.01em',
      fontWeight: t.weight.semibold,
      color: t.text.overt,
    },
    shelfAbout: { margin: '0', fontSize: '0.9375rem', color: t.text.muted },
    cards: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(14.5rem, 1fr))',
      gap: t.space.sm,
      listStyle: 'none',
      margin: '0',
      padding: '0',
    },
    card: Style.slot({ capability: Capability.Focusable }, [
      {
        display: 'flex',
        flexDirection: 'column',
        gap: t.space.xs,
        height: '100%',
        boxSizing: 'border-box',
        padding: t.space.md,
        border: rule,
        borderRadius: t.radius.lg,
        color: 'inherit',
        textDecoration: 'none',
        background: t.surface.base,
        transition: `border-color ${t.motion.fast}`,
      },
      Style.pseudo(':hover', { borderColor: t.text.muted }),
      focus,
    ]),
    cardTitle: {
      margin: '0',
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: '0.9375rem',
      fontWeight: t.weight.semibold,
      color: t.text.overt,
    },
    cardArrow: { color: t.text.subtle, fontWeight: t.weight.normal },
    cardText: {
      margin: '0',
      fontSize: '0.875rem',
      lineHeight: '1.5',
      color: t.text.muted,
      flexGrow: '1',
    },
    cardMeta: { ...mono, margin: '0', color: t.text.subtle, fontSize: '0.6875rem' },
    // The demos, one row each under a hairline.
    rows: { margin: '0', padding: '0', listStyle: 'none' },
    row: [
      {
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'start',
        gap: `${t.space.xs} ${t.space.xl}`,
        paddingBlock: t.space.md,
        borderBlockStart: rule,
      },
      Style.media(PHONE, { gridTemplateColumns: '1fr' }),
    ],
    rowAbout: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
    rowTitle: { margin: '0', fontSize: '1rem', fontWeight: t.weight.medium, color: t.text.overt },
    titleLink: quiet('inherit'),
    rowText: [
      { margin: '0', color: t.text.muted, fontSize: '0.9375rem', maxWidth: '40rem' },
      Style.nest('a', { color: t.text.overt, textUnderlineOffset: '0.2em' }),
    ],
    packages: { ...mono, margin: '0', color: t.text.subtle },
    package: quiet(t.text.subtle),
    rowActions: { margin: '0', display: 'flex', gap: t.space.md, alignItems: 'center' },
    open: quiet(t.text.overt, { fontSize: '0.875rem', fontWeight: t.weight.medium }),
    source: quiet(t.text.muted, { fontSize: '0.875rem' }),
    footer: [
      {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: t.space.sm,
        marginBlockStart: t.space['2xl'],
        paddingBlockStart: t.space.lg,
        borderBlockStart: rule,
        color: t.text.subtle,
        fontSize: '0.8125rem',
      },
      Style.nest('a', { color: t.text.muted, textDecoration: 'none' }),
      Style.nest('a:hover', { color: t.text.overt }),
      Style.nest('p', { margin: '0' }),
      Style.nest('nav', { display: 'flex', gap: t.space.md }),
    ],

    // DOC PAGES

    doc: [
      {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 46rem) 13rem',
        justifyContent: 'space-between',
        gap: t.space['2xl'],
      },
      Style.media(NO_OUTLINE, { gridTemplateColumns: 'minmax(0, 46rem)' }),
    ],
    article: [
      Prose.style({ measure: '46rem', leading: '1.7' }),
      // The build's markup sits in a static region's element, one level below
      // the article, where Prose's rhythm between siblings does not reach.
      Style.nest(`> [${STATIC_ATTRIBUTE}] > *`, { marginBlock: '0' }),
      Style.nest(`> [${STATIC_ATTRIBUTE}] > * + *`, { marginBlockStart: t.space.md }),
      Style.nest(`> [${STATIC_ATTRIBUTE}] > :is(h2, h3, h4)`, { marginBlockStart: t.space['2xl'] }),
      Style.nest(`> [${STATIC_ATTRIBUTE}] > :is(h2, h3, h4) + *`, { marginBlockStart: t.space.sm }),
      Style.nest(`> [${STATIC_ATTRIBUTE}] > :is(figure, .table, blockquote, hr)`, {
        marginBlock: t.space.lg,
      }),
      { color: t.text.default, fontSize: '0.96875rem' },
      Style.nest('header', { marginBlockEnd: t.space.xl }),
      Style.nest('header p', { margin: '0' }),
      Style.nest('.crumb', { ...mono, color: t.text.subtle, marginBlockEnd: t.space.xs }),
      Style.nest('h1', {
        margin: '0',
        fontSize: 'clamp(1.75rem, 3.5vw, 2.25rem)',
        lineHeight: '1.15',
        letterSpacing: '-0.025em',
        fontWeight: t.weight.semibold,
        color: t.text.overt,
      }),
      Style.nest('.lede', {
        marginBlockStart: t.space.sm,
        fontSize: '1.125rem',
        color: t.text.muted,
      }),
      Style.nest('h2', {
        fontSize: '1.375rem',
        letterSpacing: '-0.015em',
        fontWeight: t.weight.semibold,
        color: t.text.overt,
        scrollMarginTop: t.space.lg,
      }),
      Style.nest('h3', {
        fontSize: '1.0625rem',
        fontWeight: t.weight.semibold,
        color: t.text.overt,
        scrollMarginTop: t.space.lg,
      }),
      Style.nest('h4', { fontSize: '1rem', fontWeight: t.weight.semibold, color: t.text.overt }),
      Style.nest(':is(h2, h3, h4) .anchor', {
        marginInlineStart: '0.375rem',
        color: t.text.subtle,
        textDecoration: 'none',
        opacity: '0',
      }),
      Style.nest(':is(h2, h3, h4):hover .anchor', { opacity: '1' }),
      Style.nest('a', {
        color: t.text.overt,
        textUnderlineOffset: '3px',
        textDecorationColor: t.outline.default,
      }),
      Style.nest('a:hover', { textDecorationColor: t.text.overt }),
      // A tint, no border, and little padding: a name in a sentence sits close
      // to the punctuation around it, `(Me)` reading as one thing.
      Style.nest(':not(pre) > code', {
        fontFamily: t.font.mono,
        fontSize: '0.85em',
        padding: '0.0625em 0.25em',
        borderRadius: t.radius.sm,
        background: t.surface.muted,
      }),
      // Code that names something the site explains: the span keeps its look,
      // with the link's underline under it.
      Style.nest('a.code-link', { textDecorationColor: t.outline.default }),
      Style.nest('a.code-link:hover code', { background: t.surface.default }),
      Style.nest('.mentions', { listStyle: 'none', paddingInlineStart: '0' }),
      Style.nest('.mentions li', {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        gap: `0 ${t.space.sm}`,
      }),
      Style.nest('.mentions small', { ...mono, color: t.text.subtle }),
      Style.nest('.table', { overflowX: 'auto', marginBlock: t.space.lg }),
      Style.nest('table', { minWidth: '100%' }),
      Style.nest(':is(th, td)', {
        textAlign: 'start',
        padding: `0.625rem 0.75rem`,
        borderBlockEnd: rule,
        verticalAlign: 'top',
        lineHeight: '1.5',
      }),
      Style.nest('th', { fontWeight: t.weight.medium, color: t.text.overt }),
      // Each row's first cell names what the rest answer.
      Style.nest('td:first-child', { color: t.text.overt }),
      // Prose lets code break anywhere, which in a cell shrinks a column to a
      // letter and splits a name mid-word; the table scrolls instead.
      Style.nest(':is(th, td) code', { overflowWrap: 'normal', whiteSpace: 'nowrap' }),
      // An entry point's index: the name never breaks, the summary takes the rest.
      Style.nest('.index :is(th, td):first-child', { whiteSpace: 'nowrap' }),
      Style.nest('.full-type > summary', {
        ...mono,
        cursor: 'pointer',
        color: t.text.subtle,
      }),
      // On a phone a table of prose is its rows, one under another: the first
      // cell heads each, and every other cell is shown under its column's name,
      // since its columns would each be a word wide.
      Style.at(
        `@media ${PHONE}`,
        Style.compose(
          Style.nest('.table:not(.index) :is(table, tbody, tr, td)', { display: 'block' }),
          Style.nest('.table:not(.index) thead', {
            position: 'absolute',
            width: '1px',
            height: '1px',
            overflow: 'hidden',
            clipPath: 'inset(50%)',
            whiteSpace: 'nowrap',
          }),
          Style.nest('.table:not(.index) tr', {
            paddingBlock: t.space.sm,
            borderBlockEnd: rule,
          }),
          Style.nest('.table:not(.index) td', { padding: '0.125rem 0', borderBlockEnd: '0' }),
          Style.nest('.table:not(.index) td:first-child', {
            fontWeight: t.weight.medium,
            color: t.text.overt,
          }),
          Style.nest('.table:not(.index) td:not(:first-child)[data-label]::before', {
            ...mono,
            content: 'attr(data-label)',
            display: 'block',
            color: t.text.subtle,
          }),
        ),
      ),
      Style.nest('blockquote', { color: t.text.muted }),
      Style.nest('strong', { color: t.text.overt, fontWeight: t.weight.semibold }),
      Style.nest('.pager', {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: t.space.sm,
        marginBlockStart: t.space['2xl'],
        paddingBlockStart: t.space.lg,
        borderBlockStart: rule,
      }),
      Style.nest('.pager a', {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.125rem',
        padding: t.space.md,
        border: rule,
        borderRadius: t.radius.md,
        textDecoration: 'none',
      }),
      Style.nest('.pager a:hover', { borderColor: t.text.muted }),
      Style.nest('.pager .next', { gridColumn: '2', textAlign: 'end' }),
      Style.nest('.pager small', { ...mono, color: t.text.subtle }),
      // An API entry: its signature, then what it does, then its members.
      Style.nest('.entry', { paddingBlockStart: t.space.lg, borderBlockStart: rule }),
      Style.nest('.kind', { ...mono, color: t.text.subtle, textTransform: 'lowercase' }),
      Style.nest('.source', { ...mono, color: t.text.subtle }),
      Style.nest('.tag', {
        ...mono,
        display: 'inline-block',
        padding: '0.125rem 0.375rem',
        border: rule,
        borderRadius: t.radius.sm,
        color: t.text.muted,
      }),
      Style.nest('.params', { paddingInlineStart: '0', listStyle: 'none' }),
      Style.nest('.params code', { fontWeight: t.weight.medium }),
    ],
    outline: [
      {
        position: 'sticky',
        top: t.space.xl,
        alignSelf: 'start',
        maxHeight: `calc(100dvh - 2 * ${t.space.xl})`,
        overflowY: 'auto',
        fontSize: '0.8125rem',
      },
      Style.nest('h2', {
        margin: `0 0 ${t.space.sm}`,
        fontSize: '0.8125rem',
        fontWeight: t.weight.medium,
        color: t.text.overt,
      }),
      Style.nest('ul', {
        listStyle: 'none',
        margin: '0',
        padding: '0',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
      }),
      Style.nest('a', { color: t.text.muted, textDecoration: 'none', lineHeight: '1.4' }),
      Style.nest('a:hover', { color: t.text.overt }),
      Style.nest('.depth-3', { paddingInlineStart: t.space.sm }),
      Style.nest('p', { margin: `${t.space.md} 0 0`, color: t.text.subtle }),
      Style.media(NO_OUTLINE, { display: 'none' }),
    ],

    // COMPONENTS

    // The component theme, declared on the preview itself: a knob `/create`
    // sets inline here re-derives every token below it, which it would not
    // if the tokens were inherited from `:root` already resolved.
    preview: [
      Style.self(declared),
      {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.space.md,
        boxSizing: 'border-box',
        minBlockSize: '14rem',
        padding: t.space.xl,
        border: rule,
        borderRadius: t.radius.lg,
        background: t.surface.base,
        color: t.text.default,
        fontFamily: t.font.body,
      },
      // A gallery card's: smaller, and nothing in it takes a click or focus.
      Style.nest('&[data-size="thumb"]', {
        minBlockSize: '11rem',
        padding: t.space.lg,
        overflow: 'hidden',
      }),
      // `/create`'s: every component at once, in columns.
      // `/create`'s type, palette and screen: one column, read down the page.
      Style.nest('&[data-size="specimen"]', { display: 'block', padding: t.space.xl }),
      Style.nest('&[data-size="canvas"]', {
        display: 'block',
        columns: '2 15rem',
        columnGap: t.space.lg,
        padding: t.space.lg,
      }),
    ],
    gallery: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))',
      gap: t.space.lg,
      listStyle: 'none',
      margin: '0',
      padding: '0',
    },
    galleryCard: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.xs,
    },
    // The card's one link, stretched over the whole card.
    galleryLink: quiet(
      t.text.overt,
      { fontWeight: t.weight.medium, fontSize: '0.9375rem' },
      Style.pseudo('::after', { content: '""', position: 'absolute', inset: '0' }),
    ),
    galleryText: { margin: '0', fontSize: '0.875rem', color: t.text.muted },
    // A component's pickers, its preview and the selection they make, as one block.
    stage: {
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.md,
      paddingBlockEnd: t.space['2xl'],
    },
    toolbar: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      gap: `${t.space.md} ${t.space.lg}`,
    },
    axis: {
      display: 'flex',
      flexDirection: 'column',
      gap: t.space['2xs'],
      margin: '0',
      padding: '0',
      border: '0',
      minWidth: '0',
    },
    // A legend takes no flex gap: its room above the choices is its own padding.
    axisName: { ...mono, padding: `0 0 ${t.space.xs}`, color: t.text.subtle },
    choices: {
      display: 'inline-flex',
      flexWrap: 'wrap',
      gap: '2px',
      padding: '2px',
      border: rule,
      borderRadius: t.radius.md,
    },
    choice: Style.slot({ capability: Capability.Interactive }, [
      {
        font: 'inherit',
        fontSize: '0.8125rem',
        padding: `0.25rem 0.625rem`,
        border: '0',
        borderRadius: t.radius.sm,
        background: 'transparent',
        color: t.text.muted,
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { color: t.text.overt }),
      Style.nest('&[aria-pressed="true"]', {
        background: t.surface.muted,
        color: t.text.overt,
        fontWeight: t.weight.medium,
      }),
      focus,
    ]),
    selection: { ...mono, margin: '0', color: t.text.muted, overflowWrap: 'anywhere' },
    studio: [
      {
        display: 'grid',
        gridTemplateColumns: 'minmax(18rem, 22rem) minmax(0, 1fr)',
        alignItems: 'start',
        gap: t.space.xl,
      },
      Style.media(ONE_COLUMN, { display: 'flex', flexDirection: 'column', alignItems: 'stretch' }),
    ],
    // The tabs over the chosen pane, which scrolls on its own below them.
    sections: [
      {
        display: 'flex',
        flex: '1',
        flexDirection: 'column',
        gap: t.space.md,
        minBlockSize: '0',
      },
      Style.media(ONE_COLUMN, { gap: t.space.sm }),
    ],
    // Room at the page's end for the docked drawer's peek, so nothing ends under it.
    drawerRoom: [
      { display: 'none' },
      Style.media(ONE_COLUMN, { display: 'block', blockSize: DRAWER_PEEK }),
    ],
    pane: { display: 'flex', flexDirection: 'column', gap: t.space.md },
    knob: { display: 'flex', flexDirection: 'column', gap: t.space.xs },
    // A slider's name and its value, on one line above its track.
    knobHead: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: t.space.xs,
    },
    knobValue: { ...mono, color: t.text.default, fontVariantNumeric: 'tabular-nums' },
    presets: { display: 'flex', flexWrap: 'wrap', gap: t.space['2xs'] },
    canvasColumn: { display: 'flex', flexDirection: 'column', gap: t.space.sm, minInlineSize: '0' },
    // The preview's own settings: how it reads, not what the theme is.
    previewBar: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      gap: `${t.space.sm} ${t.space.lg}`,
    },
    toCode: quiet(t.text.muted, { ...mono, paddingBlock: '0.375rem' }),
    // At the end of the preview's bar: the code, and the two ways to take the theme away.
    previewActions: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: t.space.xs,
      marginInlineStart: 'auto',
    },
    swatch: {
      display: 'inline-block',
      inlineSize: '0.75rem',
      blockSize: '0.75rem',
      borderRadius: '999px',
    },
    // One component of `/create`'s preview, kept whole within a column.
    tile: [
      {
        display: 'flex',
        flexDirection: 'column',
        gap: t.space.sm,
        breakInside: 'avoid',
        marginBlockEnd: t.space.lg,
      },
      // A menu shown open in a tile keeps room under its button for its rows,
      // so what follows in the tile moves down rather than hide behind it.
      // Its button only: a row that opens a submenu is a menu button too.
      Style.nest(':not([role="menuitem"])[aria-haspopup="menu"][aria-expanded="true"]', {
        marginBlockEnd: '10.5rem',
      }),
      // The gallery's menu stays shown until answered, so the backdrop its
      // menu draws to catch a press elsewhere would cover the page for good:
      // presses go through it while that menu is shown.
      Style.global(
        '@layer app { :root:has([id^="preview-page-menu"][aria-expanded="true"]) #foldkit-portal-root > * { pointer-events: none } }',
      ),
    ],
    scaleGrid: {
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0, 10fr) minmax(0, 4fr)',
      alignItems: 'center',
      gap: `${t.space['2xs']} ${t.space.sm}`,
    },
    scaleName: { ...mono, color: t.text.subtle },
    scaleRow: {
      display: 'grid',
      gridAutoFlow: 'column',
      gridAutoColumns: 'minmax(0, 1fr)',
      gap: '2px',
    },
    scaleCell: { blockSize: '2rem', borderRadius: t.radius.sm },
    scaleNote: { margin: '0', color: t.text.muted, maxInlineSize: '60ch' },
    tileName: {
      ...mono,
      margin: '0',
      color: t.text.muted,
      textDecoration: 'none',
    },
    // `/create`'s other previews: the type, the palette and an application's screen.
    specimen: {
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.xl,
      minInlineSize: '0',
    },
    specimenGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.sm,
      minInlineSize: '0',
    },
    specimenHeading: {
      ...mono,
      margin: '0',
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      fontWeight: t.weight.normal,
    },
    specimenRow: [
      {
        display: 'grid',
        gridTemplateColumns: '6rem minmax(0, 1fr)',
        alignItems: 'baseline',
        gap: t.space.md,
      },
      Style.media(PHONE, { gridTemplateColumns: 'minmax(0, 1fr)', gap: t.space['3xs'] }),
    ],
    specimenName: { ...mono, color: t.text.muted, overflowWrap: 'anywhere' },
    swatchGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(8.5rem, 1fr))',
      gap: t.space.sm,
    },
    swatchTile: [
      {
        display: 'flex',
        flexDirection: 'column',
        gap: t.space['2xs'],
        margin: '0',
        minInlineSize: '0',
      },
    ],
    // Each sample draws its token the way the token is used.
    swatchSample: [
      {
        display: 'grid',
        placeItems: 'center',
        blockSize: '3.5rem',
        border: `1px solid ${t.outline.subtle}`,
        borderRadius: t.radius.md,
        background: t.surface.base,
        fontSize: '1.5rem',
        fontWeight: t.weight.semibold,
      },
      Style.nest(':where([data-draw="line"]) > &', { borderWidth: t.border.thick }),
      Style.nest(':where([data-draw="shadow"]) > &', {
        borderColor: 'transparent',
        background: t.surface.default,
      }),
      Style.nest(':where([data-draw="corner"]) > &', {
        borderColor: t.outline.overt,
        borderWidth: t.border.thick,
        background: t.surface.subtle,
      }),
    ],
    swatchName: {
      display: 'flex',
      flexDirection: 'column',
      fontSize: '0.8125rem',
      color: t.text.default,
      minInlineSize: '0',
    },
    // A title, and beside it what the screen is about; below it where there is no room.
    appHeader: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.md,
    },
    appGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(16rem, 100%), 1fr))',
      alignItems: 'start',
      gap: t.space.lg,
    },
    appForm: { display: 'flex', flexDirection: 'column', gap: t.space.md, minInlineSize: '0' },
    // A screen's panels: two across where there is room, a wide one across both.
    screenGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(22rem, 100%), 1fr))',
      alignItems: 'start',
      gap: t.space.lg,
    },
    screenWide: { gridColumn: '1 / -1', minInlineSize: '0' },
    // A panel as wide as what it holds beside one taking the rest; stacked on a phone.
    screenSplit: [
      {
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        alignItems: 'start',
        gap: t.space.lg,
      },
      Style.media(PHONE, { gridTemplateColumns: 'minmax(0, 1fr)' }),
    ],
    appActions: { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: t.space.xs },
    themeCode: [
      { display: 'flex', flexDirection: 'column', gap: t.space.sm, minWidth: '0' },
      Style.nest('pre', { overflowX: 'auto' }),
    ],
  },
  { name: 'SiteStyle' },
)

/**
 * `/create`'s knobs: the Drawer recipe, docked below xl, and beside the
 * preview a column of its own that scrolls on its own, its pane scrolling
 * under the pane names.
 */
export const StudioDrawerStyle = Style.forSlots(DrawerSlots)(
  Recipes.Drawer.extend({
    base: {
      // Wide only: the site's rules sit above the recipe's docked ones, so
      // a sticky column written for every width would undock the drawer.
      panel: Style.compose(
        Style.self({ '--fk-drawer-peek': DRAWER_PEEK, '--fk-drawer-height': '62dvh' }),
        Style.at(
          `@media ${COLUMNS}`,
          Style.self({
            position: 'sticky',
            top: t.space.lg,
            display: 'flex',
            flexDirection: 'column',
            gap: t.space.md,
            boxSizing: 'border-box',
            maxBlockSize: `calc(100dvh - 2 * ${t.space.lg})`,
            padding: t.space.lg,
            border: rule,
            borderRadius: t.radius.lg,
            background: t.surface.base,
          }),
        ),
        // Docked, the pane names sit a little in from the edges under the handle.
        Style.media(ONE_COLUMN, {
          gap: t.space.sm,
          paddingInline: t.space.md,
          paddingBlockStart: t.space['2xs'],
        }),
      ),
      body: Style.self({
        flex: '1',
        minBlockSize: '0',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        scrollbarWidth: 'thin',
        // Room for a focus ring at the edges of what scrolls.
        padding: '3px',
        margin: '-3px',
      }),
    },
  })({ dock: 'below-xl' }),
)

/**
 * `/create`'s pane names, across the whole knobs column and sharing what
 * their words leave; past its width (a phone's drawer) they scroll.
 */
export const StudioTabsStyle = Style.forSlots(TabsSlots)(
  Recipes.Tabs.extend({
    base: {
      tablist: Style.self({ inlineSize: '100%' }),
      // The least room around each name, so five fit the column; the spare width is shared out.
      tab: Style.self({ flexGrow: '1', paddingInline: t.space['2xs'] }),
    },
  })({ variant: 'pill', size: 'sm', overflow: 'scroll' }),
)

/**
 * `/create`'s knob names: each a Tooltip's dotted trigger, set as the other
 * axis names are, so a name says more when it is hovered or focused.
 */
export const HintStyle = Style.forSlots(TooltipSlots)(
  Recipes.Tooltip.extend({
    base: {
      trigger: Style.self({
        ...mono,
        alignSelf: 'flex-start',
        fontWeight: 'inherit',
        lineHeight: 'inherit',
        color: t.text.subtle,
        textAlign: 'start',
        cursor: 'help',
      }),
    },
  })({}),
)

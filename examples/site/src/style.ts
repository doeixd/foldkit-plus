/**
 * The site's appearance, as `foldkit-mixins` data. A quiet, monochrome page:
 * a rail on the left with the site's places and the page's outline, hairlines
 * between sections, the second half of a heading in grey, and a monospace
 * voice for labels. Markup the build renders inside static regions (an
 * article, a sidebar) is reached through its container's slot by element.
 */
import { Capability, Style, type Piece } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Prose } from 'foldkit-mixins/prose'
import { Theme } from 'foldkit-mixins/theme'
import { STATIC_ATTRIBUTE } from 'foldkit-ssr/client'

const { t, slots, stylesheet } = AppStyle.make({
  palette: Theme.compose(
    Theme.oklch({
      accent: { h: 270, c: 0, l: '14%', dark: { l: '96%', c: 0 } },
      surfaceSaturation: 0,
    }),
    Theme.define({
      // A white page, and a near-black one, as plain as the content.
      knob: { 'base-l': '100%', 'base-l-dark': '14%' },
      // Grey that steps back: the second half of a heading, a label's number.
      site: { faint: Theme.lightDark('oklch(66% 0 0)', 'oklch(52% 0 0)') },
      font: {
        body: '"Geist", ui-sans-serif, system-ui, sans-serif',
        heading: 'inherit',
        mono: '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace',
      },
    }),
  ),
})

export { stylesheet }

/** Below this width the rail becomes a bar over the page. */
const NARROW = '(max-width: 56rem)'
/** Below this width a doc page drops its "On this page" column. */
const NO_OUTLINE = '(max-width: 76rem)'

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
      Style.media(NARROW, { paddingBlock: t.space.sm, '--rail-closed': 'none' }),
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
      },
      Style.media(NARROW, { padding: `${t.space.xl} ${t.space.md} ${t.space['2xl']}` }),
    ],

    // HOME

    hero: {
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.lg,
      maxWidth: '50rem',
      paddingBlockEnd: t.space['2xl'],
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
    lede: {
      margin: '0',
      fontSize: '1.125rem',
      lineHeight: '1.6',
      color: t.text.muted,
      maxWidth: '38rem',
    },
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
        cursor: 'pointer',
      },
      Style.pseudo(':hover', { borderColor: t.text.muted }),
      focus,
    ]),
    installHint: { color: t.text.subtle, fontFamily: t.font.body, fontSize: '0.75rem' },
    note: [
      { margin: '0', color: t.text.muted, fontSize: '0.9375rem' },
      Style.nest('a', { color: t.text.default, textUnderlineOffset: '3px' }),
    ],
    section: {
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.lg,
      paddingBlock: t.space['2xl'],
      borderBlockStart: rule,
      scrollMarginTop: t.space.lg,
    },
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
        gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))',
        border: rule,
        borderRadius: t.radius.lg,
        overflow: 'hidden',
        listStyle: 'none',
        margin: '0',
        padding: '0',
        gap: t.border.thin,
        background: t.outline.subtle,
      },
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
    code: [
      { minWidth: '0' },
      Style.nest('pre', {
        margin: '0',
        padding: t.space.lg,
        overflowX: 'auto',
        fontFamily: t.font.mono,
        fontSize: '0.8125rem',
        lineHeight: '1.65',
        tabSize: '2',
      }),
    ],
    // The packages, shelf by shelf, a card each.
    shelf: { display: 'flex', flexDirection: 'column', gap: t.space.sm },
    shelfHead: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      gap: `0 ${t.space.sm}`,
    },
    shelfTitle: {
      ...mono,
      margin: '0',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: t.text.default,
      fontWeight: t.weight.medium,
    },
    shelfAbout: { margin: '0', fontSize: '0.875rem', color: t.text.subtle },
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
      Style.media('(max-width: 36rem)', { gridTemplateColumns: '1fr' }),
    ],
    rowAbout: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
    rowTitle: { margin: '0', fontSize: '1rem', fontWeight: t.weight.medium, color: t.text.overt },
    titleLink: quiet('inherit'),
    rowText: { margin: '0', color: t.text.muted, fontSize: '0.9375rem', maxWidth: '40rem' },
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
      Style.nest(`> [${STATIC_ATTRIBUTE}] > :is(pre, .table, blockquote, hr)`, {
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
      Style.nest(':not(pre) > code', {
        fontFamily: t.font.mono,
        fontSize: '0.85em',
        padding: '0.1em 0.3em',
        borderRadius: t.radius.sm,
        background: t.surface.muted,
        border: rule,
      }),
      Style.nest('pre', {
        ...codeBox,
        padding: t.space.md,
        overflowX: 'auto',
        fontFamily: t.font.mono,
        fontSize: '0.8125rem',
        lineHeight: '1.65',
        tabSize: '2',
      }),
      Style.nest('.table', { overflowX: 'auto', marginBlock: t.space.lg }),
      Style.nest('table', { minWidth: '100%' }),
      Style.nest(':is(th, td)', {
        textAlign: 'start',
        padding: `0.5rem 0.75rem`,
        borderBlockEnd: rule,
        verticalAlign: 'top',
      }),
      Style.nest('th', { fontWeight: t.weight.medium, color: t.text.overt }),
      // An entry point's index: the name never breaks, the summary takes the rest.
      Style.nest('td:first-child', { whiteSpace: 'nowrap' }),
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
  },
  { name: 'SiteStyle' },
)

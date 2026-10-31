/**
 * The page's look, after upstream's `styles.css`: a black page in Geist, grey
 * hairlines, the search box in the hero until the first search moves it into
 * the header. Every element draws through a Slot here; the Slots that
 * upstream's Playwright suites select by class also carry that class
 * (`Style.class('domain-card')`), so the suites run against this page as
 * they are.
 *
 * Upstream's greys are this application's tokens (`t.domains.*`), not
 * literals: the shipped palette has no `#0a0a0a` beside a `#1a1a1a`, and the
 * comparison with upstream is by eye, so its exact greys are kept.
 */
import geistLatinUrl from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'
import { Style, type Piece } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { DialogSlots, ListboxSlots, Recipes, WindowListSlots } from 'foldkit-mixins-ui'
import { Theme } from 'foldkit-mixins/theme'

export { geistLatinUrl }

export const { t, slots, forSlots, stylesheet } = AppStyle.make({
  theme: Theme.make({
    type: { body: "'Geist Variable', Arial, Helvetica, sans-serif", heading: 'inherit' },
    accent: { chroma: 0 },
    // Upstream's dropdowns are the page's own dark, not an inverted panel.
    menu: { panel: 'default' },
  }),
  tokens: Theme.define({
    domains: {
      page: '#000',
      panel: '#0a0a0a',
      raised: '#1a1a1a',
      text: '#ededed',
      muted: '#999',
      soft: '#888',
      faint: '#777',
      line: '#262626',
      lineSoft: '#222',
      lineHeader: '#1f1f1f',
      lineControl: '#2b2b2b',
      lineStrong: '#333',
      lineFirm: '#292929',
      lineHover: '#555',
      lineFocus: '#666',
      added: '#50e3a4',
      skeleton: '#1c1c1c',
      scrim: 'rgb(0 0 0 / 0.6)',
      /** How long upstream's phone sheets take to slide in or out. */
      slide: '500ms',
    },
  }),
  // Upstream is dark only: every `light-dark()` token takes its dark half.
  colorScheme: 'dark',
  global: [
    Style.global(`@font-face {
  font-family: 'Geist Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url(${geistLatinUrl}) format('woff2-variations');
}`),
    Style.global(`@keyframes domains-skeleton-pulse { from { opacity: 0.45 } to { opacity: 1 } }`),
  ],
})

const d = t.domains

/** A phone, or a small tablet held by a finger: upstream's one breakpoint. */
export const NARROW =
  '(max-width: 700px), (max-width: 1000px) and (hover: none) and (pointer: coarse)'

/** Visually hidden, still read. */
const srOnly: Piece = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  borderWidth: '0',
}

const focusRing = Style.pseudo(':focus-visible', {
  outline: `2px solid ${d.text}`,
  outlineOffset: '4px',
})

/** A rule on this slot while the page is in the search layout. */
const inSearch = (declarations: Parameters<typeof Style.nest>[1]) =>
  Style.nest('[data-search-layout="Search"] &', declarations)
/** A rule on this slot while the search box is empty. */
const whenIdle = (declarations: Parameters<typeof Style.nest>[1]) =>
  Style.nest('[data-search="idle"] &', declarations)

/**
 * A rule on this slot while the search box has focus on a phone: upstream
 * moves the box into the header's second row as soon as it is tapped.
 */
const whileTyping = (selector: string, declarations: Parameters<typeof Style.nest>[1]) =>
  Style.at(`@media ${NARROW}`, Style.nest(selector, declarations))

/** A rule on this slot under `selector`, on a window at most `width` wide. */
const atMost = (width: string, selector: string, declarations: Parameters<typeof Style.nest>[1]) =>
  Style.at(`@media (max-width: ${width})`, Style.nest(selector, declarations))

const sectionTitle: Piece = [
  { margin: '0', fontSize: '22px', fontWeight: '550', letterSpacing: '-0.7px' },
  Style.media(NARROW, { fontSize: '20px' }),
]

const control: Piece = [
  {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${d.lineControl}`,
    borderRadius: '6px',
    background: d.panel,
    color: 'inherit',
    cursor: 'pointer',
    font: 'inherit',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
  },
  Style.pseudo(':hover', { borderColor: d.lineHover, background: d.raised }),
  focusRing,
]

export const Page = slots({
  app: [
    Style.class('app'),
    {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100svh',
      background: d.page,
      color: d.text,
      fontSynthesis: 'none',
      WebkitFontSmoothing: 'antialiased',
      lineHeight: 'normal',
      '--header-height': '65px',
      '--hero-title-size': '46px',
      '--hero-title-line-height': '1.18',
      '--hero-subtitle-gap': '20px',
      '--hero-subtitle-height': '20px',
      '--hero-search-gap': '24px',
      '--search-height': '42px',
      '--hero-bottom-gap': '24px',
      '--hero-content-height':
        'calc(var(--hero-title-size) * var(--hero-title-line-height) * 2 + var(--hero-subtitle-gap) + var(--hero-subtitle-height) + var(--hero-search-gap) + var(--search-height))',
      '--hero-top':
        'max(48px, calc(50svh - var(--header-height) - var(--hero-content-height) / 2))',
    },
    Style.media(NARROW, {
      '--hero-top': 'clamp(100px, calc(50svh - 218px), 280px)',
      '--hero-title-size': 'clamp(32px, 10.2vw, 40px)',
      '--hero-title-line-height': '1.2',
      '--hero-subtitle-gap': '12px',
      '--hero-subtitle-height': '24px',
      '--hero-search-gap': '32px',
      '--search-height': '38px',
    }),
    Style.at(
      '@media (max-width: 700px)',
      Style.pseudo('[data-search-layout="Search"]', { '--header-height': '123px' }),
    ),
    whileTyping('&:has(input[type="search"]:focus)', { '--header-height': '123px' }),
  ],
  skip: [
    Style.class('skip-link'),
    srOnly,
    Style.pseudo(':focus', {
      position: 'fixed',
      top: '8px',
      left: '8px',
      zIndex: '50',
      width: 'auto',
      height: 'auto',
      margin: '0',
      overflow: 'visible',
      clip: 'auto',
      borderRadius: '6px',
      background: d.text,
      color: d.page,
      padding: '12px 16px',
    }),
  ],
  srOnly: srOnly,
  header: [
    Style.class('header'),
    {
      position: 'sticky',
      top: '0',
      zIndex: '10',
      display: 'flex',
      alignItems: 'center',
      gap: '24px',
      height: 'var(--header-height)',
      borderBottom: `1px solid ${d.lineHeader}`,
      background: d.page,
      padding: '0 24px',
    },
    Style.media(NARROW, { alignItems: 'flex-start', gap: '14px', padding: '10px 16px 0' }),
  ],
  brand: [
    Style.class('brand'),
    {
      display: 'flex',
      alignItems: 'center',
      gap: '18px',
      fontSize: '14px',
      whiteSpace: 'nowrap',
      color: 'inherit',
      textDecoration: 'none',
    },
    focusRing,
    Style.media(NARROW, { minHeight: '44px', minWidth: '44px', gap: '12px', fontSize: '16px' }),
  ],
  logo: [Style.class('logo'), { width: '20px', height: '20px' }],
  brandDivider: [{ fontSize: '23px', fontWeight: '300', color: d.lineStrong }],
  demoLabel: [
    Style.class('demo-label'),
    {
      display: 'inline-flex',
      height: '34px',
      flexShrink: '0',
      alignItems: 'center',
      fontSize: '11px',
      whiteSpace: 'nowrap',
      color: d.muted,
    },
    Style.media(NARROW, { height: '44px', fontSize: '10px' }),
  ],
  headerActions: [{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }],
  button: [
    Style.class('button'),
    control,
    { height: '34px', gap: '8px', padding: '0 12px', fontSize: '13px', whiteSpace: 'nowrap' },
    Style.media(NARROW, { minHeight: '44px', minWidth: '44px' }),
  ],
  icon: [Style.class('icon'), { display: 'block', width: '18px', height: '18px', flexShrink: '0' }],
  main: [
    { flex: '1', scrollMarginTop: '80px' },
    Style.pseudo(':focus', { outline: 'none' }),
    atMost('700px', '[data-search="idle"] &', {
      minHeight: 'calc(100svh - var(--header-height))',
    }),
  ],
  pageHeading: [
    Style.class('search-page-heading'),
    srOnly,
    whenIdle({ display: 'none' }),
    whileTyping('.app:has(input[type="search"]:focus) &', { display: 'block' }),
  ],
  hero: [
    Style.class('hero'),
    { padding: 'var(--hero-top) 24px 160px', textAlign: 'center' },
    inSearch({ padding: '0' }),
    whileTyping('.app:has(input[type="search"]:focus) &', { padding: '0' }),
  ],
  heroTitle: [
    {
      margin: '0',
      fontWeight: '600',
      letterSpacing: '-2.2px',
      fontSize: 'var(--hero-title-size)',
      lineHeight: 'var(--hero-title-line-height)',
    },
    Style.media(NARROW, { letterSpacing: '-2.4px' }),
    inSearch({ display: 'none' }),
    whileTyping('.app:has(input[type="search"]:focus) &', { display: 'none' }),
  ],
  heroAccent: [{ color: d.soft }],
  heroLine: [
    {
      fontSize: '14px',
      color: d.muted,
      lineHeight: 'var(--hero-subtitle-height)',
      margin: 'var(--hero-subtitle-gap) 0 0',
    },
    inSearch({ display: 'none' }),
    whileTyping('.app:has(input[type="search"]:focus) &', { display: 'none' }),
  ],
  heroLink: [
    { color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '4px' },
    focusRing,
  ],
  heroSpace: [
    Style.class('hero-search-space'),
    { height: 'calc(var(--hero-search-gap) + var(--search-height) + var(--hero-bottom-gap))' },
    inSearch({ display: 'none' }),
    whileTyping('.app:has(input[type="search"]:focus) &', { display: 'none' }),
  ],
  search: [
    Style.class('search'),
    {
      position: 'absolute',
      left: '50%',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      height: 'var(--search-height)',
      top: 'calc(var(--header-height) + var(--hero-top) + var(--hero-content-height) - var(--search-height))',
      transform: 'translateX(-50%)',
      width: 'min(520px, calc(100vw - 48px))',
      border: `1px solid ${d.lineFocus}`,
      borderRadius: '8px',
      background: d.panel,
      padding: '0 12px',
      textAlign: 'left',
      boxShadow: '0 1px 2px #000',
    },
    Style.pseudo(':focus-within', { borderColor: d.soft, boxShadow: `0 0 0 2px ${d.lineStrong}` }),
    Style.media(NARROW, { width: 'calc(100vw - 36px)' }),
    inSearch({
      position: 'fixed',
      top: '13px',
      zIndex: '20',
      height: '38px',
      width: 'min(700px, calc(100vw - 880px))',
    }),
    atMost('1200px', '[data-search-layout="Search"] &', {
      width: 'calc(100vw - 600px)',
    }),
    atMost('700px', '[data-search-layout="Search"] &', {
      top: '75px',
      width: 'calc(100vw - 32px)',
    }),
    whileTyping('.app:has(input[type="search"]:focus) &', {
      position: 'fixed',
      top: '75px',
      zIndex: '20',
      height: '38px',
      width: 'calc(100vw - 32px)',
    }),
  ],
  searchIcon: [{ display: 'block', width: '16px', height: '16px', flexShrink: '0', color: d.soft }],
  searchInput: [
    {
      height: '100%',
      minWidth: '0',
      flex: '1',
      border: '0',
      background: 'transparent',
      padding: '0',
      fontSize: '14px',
      color: d.text,
      outline: 'none',
      font: 'inherit',
    },
    Style.pseudo('::placeholder', { color: d.soft }),
    Style.pseudo('::-webkit-search-cancel-button', { display: 'none' }),
    Style.media(NARROW, { fontSize: '16px' }),
  ],
  clearSearch: [
    Style.class('clear-search'),
    {
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      border: '0',
      padding: '0',
      background: 'transparent',
      color: d.soft,
      cursor: 'pointer',
    },
    Style.nest('[data-search="active"] &', { display: 'flex' }),
    Style.media(NARROW, { marginRight: '-12px', height: '44px', width: '44px', flexShrink: '0' }),
  ],
  kbd: [
    {
      borderRadius: '3px',
      border: `1px solid ${d.lineStrong}`,
      padding: '3px',
      font: '11px Arial, sans-serif',
    },
    Style.media(NARROW, { display: 'none' }),
  ],
  clearIcon: [
    { display: 'none', width: '18px', height: '18px' },
    Style.media(NARROW, { display: 'block', margin: '0 auto' }),
  ],
  beginSearch: [
    Style.class('begin-search'),
    { display: 'none' },
    Style.nest('[data-search-layout="Search"][data-search="idle"] &', {
      display: 'flex',
      justifyContent: 'center',
      padding: 'clamp(24px, calc(50svh - 235.5px), 280px) 24px 40px',
    }),
    whileTyping('[data-search="idle"]:has(input[type="search"]:focus) &', {
      display: 'flex',
      justifyContent: 'center',
      padding: 'clamp(24px, calc(50svh - 235.5px), 280px) 24px 40px',
    }),
  ],
  beginCopy: [
    {
      display: 'flex',
      maxWidth: '320px',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      textAlign: 'center',
    },
  ],
  beginIcon: [
    {
      display: 'grid',
      width: '36px',
      height: '36px',
      placeItems: 'center',
      borderRadius: '6px',
      border: `1px solid ${d.lineControl}`,
      background: d.panel,
    },
  ],
  beginTitle: [
    {
      margin: '0',
      fontSize: '24px',
      lineHeight: '32px',
      fontWeight: '600',
      letterSpacing: '-0.96px',
    },
  ],
  beginText: [{ margin: '0', fontSize: '14px', lineHeight: '20px', color: d.muted }],
  results: [
    Style.class('results'),
    { display: 'none', margin: '0 auto', maxWidth: '1080px', padding: '24px 28px 64px' },
    Style.nest('[data-search="active"] &', { display: 'block' }),
    Style.media(NARROW, { padding: '24px 16px 48px' }),
  ],
  resultsContent: [Style.class('results-content')],
  topHeading: [
    Style.class('top-results-heading'),
    {
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
    },
  ],
  sectionTitle,
  resultsTitle: [sectionTitle, Style.media(NARROW, { fontSize: '18px', whiteSpace: 'nowrap' })],
  sampleLabel: [Style.class('sample-data-label'), { fontSize: '12px', color: d.soft }],
  topResults: [
    Style.class('top-results'),
    { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' },
    Style.media('(max-width: 1000px)', { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }),
    Style.media('(max-width: 700px)', { gridTemplateColumns: 'minmax(0, 1fr)' }),
  ],
  card: [
    Style.class('domain-card'),
    {
      '--domain-action-size': '32px',
      minHeight: '110px',
      minWidth: '0',
      borderRadius: '7px',
      border: `1px solid ${d.line}`,
      background: d.panel,
      padding: '20px',
    },
    Style.media(NARROW, {
      '--domain-action-size': '44px',
      minHeight: '92px',
      padding: '12px 16px',
    }),
  ],
  cardName: [
    {
      margin: '0 0 12px',
      fontSize: '18px',
      fontWeight: '500',
      letterSpacing: '-0.3px',
      overflowWrap: 'anywhere',
    },
    Style.nest('[data-unavailable] &', { color: d.soft }),
    Style.media(NARROW, { marginBottom: '4px', fontSize: '16px', lineHeight: '20px' }),
  ],
  action: [
    Style.class('domain-action'),
    {
      '--domain-action-gap': '6px',
      '--domain-price-width': '8ch',
      display: 'grid',
      minWidth: '0',
      alignItems: 'center',
      fontSize: '15px',
      lineHeight: '16px',
      gap: 'var(--domain-action-gap)',
      gridTemplateColumns: 'minmax(0, 1fr) var(--domain-action-size)',
      minHeight: 'max(32px, var(--domain-action-size))',
    },
  ],
  skeletonPrice: [
    Style.class('skeleton'),
    Style.class('skeleton-price'),
    {
      display: 'block',
      maxWidth: '100%',
      width: 'var(--domain-price-width)',
      height: '16px',
      borderRadius: '2px',
      background: d.skeleton,
      animation: 'domains-skeleton-pulse 1.5s ease-in-out infinite alternate',
    },
    Style.media('(prefers-reduced-motion: reduce)', { animation: 'none' }),
  ],
  skeletonAction: [
    Style.class('skeleton'),
    Style.class('skeleton-action'),
    {
      display: 'inline-flex',
      width: 'var(--domain-action-size, 32px)',
      height: 'var(--domain-action-size, 32px)',
      flexShrink: '0',
      borderRadius: '6px',
      background: d.skeleton,
      animation: 'domains-skeleton-pulse 1.5s ease-in-out infinite alternate',
    },
    Style.media('(prefers-reduced-motion: reduce)', { animation: 'none' }),
  ],
  price: [
    Style.class('price'),
    {
      display: 'block',
      maxWidth: '100%',
      width: 'var(--domain-price-width)',
      overflowWrap: 'anywhere',
    },
  ],
  unavailable: [
    Style.class('unavailable'),
    { gridColumn: 'span 2', fontSize: '13px', whiteSpace: 'nowrap', color: d.soft },
    Style.media(NARROW, { fontSize: '14px', justifySelf: 'end' }),
  ],
  banner: [
    {
      position: 'sticky',
      bottom: '16px',
      zIndex: '10',
      marginTop: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      borderRadius: '6px',
      border: `1px solid ${d.lineFirm}`,
      background: d.panel,
      padding: '16px',
      fontSize: '14px',
      color: d.muted,
    },
  ],
  bannerText: [{ margin: '0' }],
  filters: [
    Style.class('filters'),
    { display: 'flex', gap: '6px' },
    Style.media(NARROW, { minWidth: '0', alignItems: 'center' }),
  ],
  desktopTld: [Style.class('desktop-tld-filter'), Style.media(NARROW, { display: 'none' })],
  desktopFilters: [
    Style.class('desktop-filters'),
    { display: 'flex', gap: '6px' },
    Style.media(NARROW, { display: 'none' }),
  ],
  filtersButton: [
    Style.class('filters-button'),
    {
      position: 'relative',
      display: 'none',
      width: '44px',
      height: '44px',
      flexShrink: '0',
      alignItems: 'center',
      justifyContent: 'center',
      border: '0',
      borderRadius: '6px',
      background: 'transparent',
      padding: '0',
      color: 'inherit',
      cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent',
      touchAction: 'manipulation',
    },
    Style.pseudo('[data-active-filters]::after', {
      content: '""',
      position: 'absolute',
      top: '8px',
      right: '8px',
      width: '6px',
      height: '6px',
      borderRadius: '9999px',
      background: d.text,
    }),
    focusRing,
    Style.media(NARROW, { display: 'inline-flex' }),
  ],
  mobileTld: [
    Style.class('filter-trigger'),
    Style.class('mobile-tld-filter'),
    control,
    {
      display: 'none',
      minHeight: '44px',
      minWidth: '0',
      gap: '16px',
      justifyContent: 'space-between',
      padding: '8px 12px',
      fontSize: '13px',
      whiteSpace: 'nowrap',
    },
    Style.media(NARROW, { display: 'flex' }),
  ],
  tldSearch: [
    Style.class('tld-search'),
    {
      display: 'flex',
      minHeight: '44px',
      flexShrink: '0',
      alignItems: 'center',
      gap: '12px',
      borderBottom: `1px solid ${d.lineFirm}`,
      padding: '0 12px',
      color: d.muted,
    },
  ],
  tldSearchInput: [
    {
      minWidth: '0',
      flex: '1',
      border: '0',
      background: 'transparent',
      padding: '12px 0',
      fontSize: '16px',
      color: d.text,
      outline: 'none',
      font: 'inherit',
    },
    Style.pseudo('::placeholder', { color: d.soft }),
  ],
  tldOptions: [
    Style.class('tld-options'),
    {
      minHeight: '0',
      flex: '1',
      overflowY: 'auto',
      overscrollBehavior: 'contain',
      padding: '8px 6px',
    },
  ],
  tldNoResults: [
    Style.class('tld-no-results'),
    { padding: '16px 20px', fontSize: '14px', color: d.muted },
  ],
  choice: [
    Style.class('filter-choice'),
    {
      display: 'flex',
      minHeight: '44px',
      width: '100%',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      border: '0',
      borderRadius: '4px',
      background: d.panel,
      padding: '0 20px',
      textAlign: 'left',
      fontSize: '16px',
      color: 'inherit',
      cursor: 'pointer',
    },
    Style.pseudo(':hover', { background: d.raised }),
    focusRing,
  ],
  choiceCheck: [
    Style.class('filter-choice-check'),
    { visibility: 'hidden', display: 'flex', width: '20px', height: '20px', flexShrink: '0' },
    Style.nest('[aria-pressed="true"] > &', { visibility: 'visible' }),
  ],
  filterGroup: [{}],
  filterGroupLabel: [
    Style.class('filter-group-label'),
    { margin: '0', padding: '8px 12px 4px', fontSize: '12px', fontWeight: '400', color: d.muted },
  ],
  filterDivider: [
    Style.class('filter-group-divider'),
    { margin: '6px 0', border: '0', borderTop: `1px solid ${d.lineFirm}` },
  ],
  emptyResults: [Style.class('empty-results'), { margin: '16px 0' }],
  iconButton: [
    Style.class('icon-button'),
    control,
    {
      width: 'var(--domain-action-size, 32px)',
      height: 'var(--domain-action-size, 32px)',
      flexShrink: '0',
      border: `1px solid ${d.lineFirm}`,
      padding: '0',
    },
    Style.pseudo('[data-added]', { color: d.added }),
    Style.media(NARROW, { minHeight: '44px', minWidth: '44px' }),
  ],
  cartButton: [
    Style.class('button'),
    Style.class('cart-button'),
    control,
    {
      position: 'relative',
      height: '34px',
      gap: '8px',
      padding: '0 12px',
      fontSize: '13px',
      whiteSpace: 'nowrap',
    },
    Style.media(NARROW, { width: '44px', height: '44px', padding: '0' }),
  ],
  cartLabel: [Style.media(NARROW, { display: 'none' })],
  cartCount: [
    Style.class('cart-count'),
    {
      display: 'grid',
      width: '17px',
      height: '17px',
      placeItems: 'center',
      borderRadius: '9999px',
      background: d.text,
      fontSize: '10px',
      color: d.page,
    },
    Style.media(NARROW, { position: 'absolute', top: '-4px', right: '-4px' }),
  ],
  cartPanel: [
    Style.class('cart-panel'),
    { minHeight: '100%', background: d.panel, padding: '24px' },
  ],
  cartHeading: [
    Style.class('cart-heading'),
    {
      marginBottom: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  ],
  cartItems: [Style.class('cart-items'), { margin: '16px 0', listStyle: 'none', padding: '0' }],
  cartItem: [
    {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      borderBottom: `1px solid ${d.lineSoft}`,
      padding: '18px 0',
    },
  ],
  cartName: [{ marginBottom: '8px', display: 'block', fontSize: '14px', overflowWrap: 'anywhere' }],
  cartTerms: [{ fontSize: '13px', color: d.soft }],
  cartRenewal: [{ marginTop: '4px', display: 'block', fontSize: '12px', color: d.soft }],
  cartTotal: [
    Style.class('cart-total'),
    {
      display: 'flex',
      justifyContent: 'space-between',
      borderBottom: `1px solid ${d.lineSoft}`,
      padding: '24px 0',
      fontSize: '14px',
    },
  ],
  cartNote: [
    Style.class('empty-cart'),
    { margin: '13px 0', fontSize: '13px', lineHeight: '1.7', color: d.soft },
  ],
  resultsHeading: [
    Style.class('results-heading'),
    {
      margin: '28px 0 12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '14px',
    },
    Style.media(NARROW, { margin: '24px 0 8px', gap: '8px' }),
  ],
  allResults: [
    Style.class('all-results'),
    {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: '6px',
      border: `1px solid ${d.lineFirm}`,
      background: d.panel,
      containerType: 'inline-size',
    },
  ],
  rowGroup: [
    Style.class('domain-row-group'),
    {
      margin: '0',
      display: 'grid',
      listStyle: 'none',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      padding: '0',
    },
    Style.container('(max-width: 944px)', { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }),
    Style.container('(max-width: 668px)', { gridTemplateColumns: 'minmax(0, 1fr)' }),
  ],
  preview: [
    Style.class('results-preview'),
    {
      margin: '0',
      display: 'grid',
      listStyle: 'none',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      padding: '0',
      pointerEvents: 'none',
      overflow: 'hidden',
      background: d.panel,
      position: 'absolute',
      inset: '0',
    },
    // The pending rows stand in for All Results only until its first rows are drawn.
    Style.nest('*:has(> [role="list"] [data-virtual-list-item-key]) > &', { display: 'none' }),
    Style.container('(max-width: 944px)', { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }),
    Style.container('(max-width: 668px)', { gridTemplateColumns: 'minmax(0, 1fr)' }),
  ],
  row: [
    Style.class('domain-row'),
    {
      '--domain-action-size': '30px',
      display: 'flex',
      minHeight: '57px',
      minWidth: '0',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      borderRight: `1px solid ${d.lineSoft}`,
      borderBottom: `1px solid ${d.lineSoft}`,
      padding: '10px 12px',
    },
    Style.media(NARROW, { '--domain-action-size': '44px', minHeight: '61px', padding: '8px 12px' }),
  ],
  domainName: [
    Style.class('domain-name'),
    { fontSize: '13px', overflowWrap: 'anywhere' },
    Style.nest('[data-unavailable] &', { color: d.soft }),
    Style.media(NARROW, { minWidth: '0', flex: '1', fontSize: '14px' }),
  ],
  rowAction: [
    Style.class('domain-action'),
    {
      '--domain-action-gap': '6px',
      '--domain-price-width': '8ch',
      display: 'grid',
      minWidth: '0',
      flexShrink: '0',
      alignItems: 'center',
      fontSize: '13px',
      lineHeight: '16px',
      gap: 'var(--domain-action-gap)',
      gridTemplateColumns: 'minmax(0, 1fr) var(--domain-action-size)',
      minHeight: 'max(32px, var(--domain-action-size))',
      width:
        'calc(var(--domain-price-width) + var(--domain-action-size) + var(--domain-action-gap))',
    },
    Style.media(NARROW, { fontSize: '14px' }),
  ],
  resultCount: [
    Style.class('result-count'),
    { margin: '20px 0 12px', fontSize: '12px', color: d.faint },
    Style.media(NARROW, { minHeight: '2lh' }),
  ],
  searchError: [
    Style.class('search-error'),
    {
      marginTop: '24px',
      borderRadius: '8px',
      border: `1px solid ${d.lineSoft}`,
      padding: '48px 24px',
      textAlign: 'center',
      color: d.muted,
    },
  ],
  searchErrorTitle: [
    {
      margin: '0 0 16px',
      fontSize: '22px',
      fontWeight: '550',
      letterSpacing: '-0.7px',
      color: d.text,
    },
  ],
  searchErrorText: [{ margin: '14px 0 24px', fontSize: '14px' }],
  footer: [
    Style.class('footer'),
    {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '24px',
      padding: '26px 24px',
      fontSize: '12px',
      color: d.soft,
    },
    Style.media(NARROW, { gap: '12px', fontSize: '11px' }),
    atMost('700px', '[data-search-layout="Search"][data-search="idle"] &', {
      display: 'none',
    }),
    whileTyping('[data-search="idle"]:has(input[type="search"]:focus) &', { display: 'none' }),
  ],
  footerLink: [
    {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      whiteSpace: 'nowrap',
      color: 'inherit',
      textDecoration: 'none',
    },
    Style.pseudo(':hover', { color: d.text }),
    focusRing,
  ],
  footerIcon: [{ display: 'block', width: '12px', height: '12px' }],
  notFound: [
    {
      margin: '0 auto',
      display: 'flex',
      minHeight: '100svh',
      maxWidth: '36rem',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: '24px',
      padding: '0 24px',
      background: d.page,
      color: d.text,
    },
  ],
  notFoundTitle: [{ margin: '0', fontSize: '36px', fontWeight: '600', letterSpacing: '-0.025em' }],
  notFoundText: [{ margin: '0', color: d.muted }],
  notFoundLink: [
    {
      width: 'fit-content',
      color: 'inherit',
      textDecoration: 'underline',
      textUnderlineOffset: '4px',
    },
    focusRing,
  ],
})

/** All Results' list: in the page's flow, scrolled by the page. */
export const ResultsListStyle = forSlots(WindowListSlots)(
  {
    root: [
      Style.class('results-viewport'),
      {
        margin: '0',
        listStyle: 'none',
        padding: '0',
        scrollMarginTop: 'calc(var(--header-height) + 1rem)',
      },
      Style.pseudo(':focus-visible', { outline: `2px solid ${d.text}`, outlineOffset: '-2px' }),
    ],
  },
  { name: 'ResultsListStyle' },
)

/** The dropdowns: a dark panel under the trigger, as upstream's. */
export const ListboxStyle = forSlots(ListboxSlots)(Recipes.Listbox(), { name: 'ListboxStyle' })

/**
 * Upstream's dropdown trigger and click-away carry its classes, which its
 * suites select. The trigger is upstream's greys, written in sRGB: the theme's
 * ink is an `oklch()`, which a contrast check reading `rgb()` cannot measure.
 * The click-away stands over the sticky header, as upstream's, so a press
 * anywhere outside the open panel closes it.
 */
export const ListboxLook = forSlots(ListboxSlots)(
  {
    button: [Style.class('filter-trigger'), { background: d.panel, color: d.text }],
    backdrop: [Style.class('filter-backdrop'), { zIndex: '40' }],
    items: { zIndex: '50' },
  },
  { name: 'ListboxLook' },
)

/** The phone's sheets, from the bottom. */
export const SheetStyle = forSlots(DialogSlots)(Recipes.Sheet(), { name: 'SheetStyle' })

/** The cart: a sheet at the window's right edge, upstream's 420px or the whole of a phone. */
export const CartSheetStyle = forSlots(DialogSlots)(
  Recipes.Sheet({ size: 'full', handle: 'none' }),
  {
    name: 'CartSheetStyle',
  },
)

/** The sheets in upstream's greys: its panel, its hairline, its headings and notes. */
export const SheetLook = forSlots(DialogSlots)(
  {
    backdrop: [Style.class('dialog-backdrop'), { background: d.scrim }],
    panel: { background: d.panel, color: d.text, borderColor: d.lineStrong },
    title: { margin: '0', fontSize: '22px', fontWeight: '550', letterSpacing: '-0.7px' },
    description: { margin: '13px 0', fontSize: '13px', lineHeight: '1.7', color: d.soft },
  },
  { name: 'SheetLook' },
)

/**
 * Upstream's cart stands open at once: no slide past the window's edge and
 * no fade, so its text is read at full contrast the moment it shows.
 */
export const CartSheetLook = forSlots(DialogSlots)(
  {
    backdrop: { transitionDuration: '0s' },
    panel: { maxInlineSize: '420px', transitionDuration: '0s' },
    description: Style.class('demo-note'),
  },
  { name: 'CartSheetLook' },
)

/**
 * Upstream's phone sheets slide for its own half second, not the theme's
 * motion scale, and not at all under reduced motion (the `travel` knob is 0
 * there); a drag still follows the finger with none.
 */
const slide = (duration: string): Piece =>
  Style.pseudo(':not([data-dragging])', {
    transitionDuration: `calc(${duration} * ${t.knob.travel})`,
  })

const phoneSheet = {
  backdrop: [Style.class('filters-backdrop'), slide(d.slide)],
  // Upstream's sheets name themselves to a screen reader alone.
  title: srOnly,
}

/** The phone's TLD sheet: its search above, the extensions scrolling below it. */
export const TldSheetLook = forSlots(DialogSlots)(
  {
    ...phoneSheet,
    panel: [
      Style.class('filters-panel'),
      Style.class('tld-panel'),
      {
        display: 'flex',
        height: 'min(360px, 80dvh)',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: '0 0 env(safe-area-inset-bottom)',
      },
      slide(d.slide),
    ],
  },
  { name: 'TldSheetLook' },
)

/** The phone's Filters and sort sheet: availability, then sort, as upstream's. */
export const FiltersSheetLook = forSlots(DialogSlots)(
  {
    ...phoneSheet,
    panel: [
      Style.class('filters-panel'),
      { maxHeight: '90dvh', padding: '6px 6px max(6px, env(safe-area-inset-bottom))' },
      slide(d.slide),
    ],
  },
  { name: 'FiltersSheetLook' },
)

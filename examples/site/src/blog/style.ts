/**
 * The blog's typography. A post is one reading column: its text a measure of
 * `--blog-measure`, about 69 characters of this face (a `ch` is the width of a
 * zero, wider than the average letter), its code, tables and images the
 * column's whole width, which is wider. The Markdown is drawn into a static region, so the
 * body is styled by element, as the guides' article is. These styles reach
 * the page through the server's markup and `Style.usedDrawn`, never the
 * browser's bundle: the page's script draws nothing of the blog.
 */
import { Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'

import { NARROW } from '../breakpoints.js'
import { slots, t } from '../style.js'

/** At and above this width the table of contents stands beside the column. */
const BESIDE = '(min-width: 80rem)'
const PHONE = '(max-width: 36rem)'
/** Below it the page's bar is sticky over the page, and a heading stops under it. */
const BAR = '4.75rem'

const rule = `${t.border.thin} solid ${t.outline.subtle}`
const mono = { fontFamily: t.font.mono, fontSize: '0.75rem', letterSpacing: '0.02em' }

const focus = Style.pseudo(':focus-visible', {
  outline: `2px solid ${t.accent.default}`,
  outlineOffset: '3px',
  borderRadius: '2px',
})

/** A link in prose: the text's colour, underlined quietly, darkening under the pointer. */
const underlined = Style.compose(
  Style.nest('a', {
    color: t.text.overt,
    textDecorationLine: 'underline',
    textDecorationThickness: '0.0625em',
    textUnderlineOffset: '0.2em',
    textDecorationColor: `color-mix(in oklab, currentColor 35%, transparent)`,
    overflowWrap: 'break-word',
  }),
  Style.nest('a:hover', { textDecorationColor: 'currentColor' }),
  Style.nest('a:focus-visible', {
    outline: `2px solid ${t.accent.default}`,
    outlineOffset: '3px',
    borderRadius: '2px',
  }),
)

/** The date, author and reading time, one quiet line. */
const metaLine = [
  {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: '0.625rem',
    rowGap: '0.125rem',
    margin: '0',
    fontSize: '0.875rem',
    lineHeight: '1.5',
    color: t.text.muted,
    fontVariantNumeric: 'tabular-nums',
  },
  Style.nest('> * + *::before', {
    content: '"·"',
    marginInlineEnd: '0.625rem',
    color: t.text.subtle,
  }),
] as const

export const BlogStyle = slots({
  // The column and, at width, the table of contents beside it.
  page: [
    {
      '--blog-measure': '54ch',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 46rem)',
      justifyContent: 'center',
      columnGap: '3rem',
      color: t.text.default,
    },
    Style.media(BESIDE, { gridTemplateColumns: 'minmax(0, 46rem) 12.5rem' }),
  ],
  article: { minInlineSize: '0' },

  // THE HEADER

  header: {
    marginBlockEnd: '2.5rem',
    paddingBlockEnd: '2rem',
    borderBlockEnd: rule,
  },
  crumb: [
    { ...mono, margin: `0 0 ${t.space.md}`, textTransform: 'uppercase', letterSpacing: '0.08em' },
    Style.nest('a', { color: t.text.muted, textDecoration: 'none' }),
    Style.nest('a:hover', { color: t.text.overt }),
    Style.nest('a:focus-visible', {
      outline: `2px solid ${t.accent.default}`,
      outlineOffset: '3px',
      borderRadius: '2px',
    }),
  ],
  title: {
    margin: '0',
    maxInlineSize: '18em',
    fontSize: Theme.fluidType({ min: '1.875rem', max: '3rem' }),
    lineHeight: '1.1',
    letterSpacing: '-0.03em',
    fontWeight: t.weight.semibold,
    color: t.text.overt,
    textWrap: 'balance',
    hyphens: 'manual',
    fontKerning: 'normal',
  },
  standfirst: [
    {
      margin: `${t.space.lg} 0 0`,
      maxInlineSize: '30em',
      fontSize: '1.3125rem',
      lineHeight: '1.45',
      letterSpacing: '-0.005em',
      color: t.text.muted,
      textWrap: 'pretty',
    },
    Style.media(PHONE, { fontSize: '1.125rem', marginBlockStart: t.space.md }),
  ],
  meta: [...metaLine, { marginBlockStart: t.space.lg }],
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
    margin: `${t.space.md} 0 0`,
    padding: '0',
    listStyle: 'none',
  },
  tag: {
    ...mono,
    padding: '0.125rem 0.5rem',
    border: rule,
    borderRadius: '999px',
    color: t.text.muted,
  },

  // THE TABLE OF CONTENTS: beside the column on a wide screen, folded above it elsewhere.

  contents: [
    {
      position: 'sticky',
      top: t.space.xl,
      alignSelf: 'start',
      maxBlockSize: `calc(100dvh - 2 * ${t.space.xl})`,
      overflowY: 'auto',
      fontSize: '0.8125rem',
      display: 'none',
    },
    Style.media(BESIDE, { display: 'block' }),
    Style.nest('h2', {
      ...mono,
      margin: `0 0 ${t.space.sm}`,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      fontWeight: t.weight.normal,
      color: t.text.subtle,
    }),
    Style.nest('ol', { listStyle: 'none', margin: '0', padding: '0' }),
    Style.nest('a', {
      display: 'block',
      padding: '0.3125rem 0 0.3125rem 0.75rem',
      borderInlineStart: rule,
      color: t.text.muted,
      textDecoration: 'none',
      lineHeight: '1.35',
    }),
    Style.nest('a:hover', { color: t.text.overt }),
    // The section the reader is in, marked by the scrollspy (`spy.ts`).
    Style.nest('a[aria-current="location"]', {
      color: t.text.overt,
      fontWeight: t.weight.medium,
      borderInlineStartColor: t.text.overt,
    }),
    Style.nest('a:focus-visible', {
      outline: `2px solid ${t.accent.default}`,
      outlineOffset: '2px',
    }),
  ],
  folded: [
    {
      marginBlockEnd: '2rem',
      border: rule,
      borderRadius: t.radius.md,
      fontSize: '0.9375rem',
    },
    Style.media(BESIDE, { display: 'none' }),
    Style.nest('summary', {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      minBlockSize: '2.75rem',
      padding: `0.25rem ${t.space.md}`,
      boxSizing: 'border-box',
      cursor: 'pointer',
      listStyle: 'none',
      fontWeight: t.weight.medium,
      color: t.text.overt,
    }),
    Style.nest('summary::-webkit-details-marker', { display: 'none' }),
    Style.nest('summary::after', {
      content: '"+"',
      ...mono,
      fontSize: '1rem',
      color: t.text.muted,
    }),
    Style.nest('&[open] summary::after', { content: '"−"' }),
    Style.nest('summary:focus-visible', {
      outline: `2px solid ${t.accent.default}`,
      outlineOffset: '2px',
      borderRadius: t.radius.md,
    }),
    Style.nest('ol', {
      listStyle: 'none',
      margin: '0',
      padding: `0 ${t.space.md} ${t.space.sm}`,
    }),
    Style.nest('a', {
      display: 'flex',
      alignItems: 'center',
      minBlockSize: '2.75rem',
      color: t.text.muted,
      textDecoration: 'none',
      lineHeight: '1.35',
      borderBlockStart: rule,
    }),
    Style.nest('li:first-child a', { borderBlockStart: '0' }),
    Style.nest('a[aria-current="location"]', { color: t.text.overt, fontWeight: t.weight.medium }),
    Style.nest('a:hover', { color: t.text.overt }),
  ],

  // THE TEXT

  body: [
    {
      fontSize: '1.125rem',
      lineHeight: '1.65',
      fontKerning: 'normal',
      fontOpticalSizing: 'auto',
      textRendering: 'optimizeLegibility',
      fontVariantLigatures: 'common-ligatures',
      overflowWrap: 'break-word',
    },
    Style.media(PHONE, { fontSize: '1.0625rem', lineHeight: '1.6' }),
    // Rhythm: a block follows the one before it by 1.25 lines of text, a heading by a good deal
    // more and its first block by a good deal less, so a heading sits with what it introduces.
    Style.nest('> *', { margin: '0' }),
    Style.nest('> * + *', { marginBlockStart: '1.25em' }),
    Style.nest('> :is(h2, h3, h4)', {
      color: t.text.overt,
      fontWeight: t.weight.semibold,
      textWrap: 'balance',
      hyphens: 'manual',
      scrollMarginBlockStart: '2rem',
    }),
    Style.nest('> h2', {
      marginBlockStart: '3rem',
      maxInlineSize: '24em',
      fontSize: '1.75rem',
      lineHeight: '1.2',
      letterSpacing: '-0.022em',
    }),
    Style.nest('> h3', {
      marginBlockStart: '2.25rem',
      maxInlineSize: '30em',
      fontSize: '1.3125rem',
      lineHeight: '1.3',
      letterSpacing: '-0.012em',
    }),
    Style.nest('> h4', {
      marginBlockStart: '1.75rem',
      fontSize: '1.125rem',
      lineHeight: '1.4',
      letterSpacing: '-0.005em',
    }),
    Style.nest('> :is(h2, h3, h4) + *', { marginBlockStart: '0.75rem' }),
    Style.at(
      `@media ${PHONE}`,
      Style.compose(
        Style.nest('> h2', { marginBlockStart: '2.5rem', fontSize: '1.5rem' }),
        Style.nest('> h3', { marginBlockStart: '2rem', fontSize: '1.1875rem' }),
      ),
    ),
    Style.at(`@media ${NARROW}`, Style.nest('> :is(h2, h3, h4)', { scrollMarginBlockStart: BAR })),
    // The measure: text lines are about 65 characters; code, tables and images are the column's.
    Style.nest('> :is(p, ul, ol, blockquote, dl)', {
      maxInlineSize: 'var(--blog-measure)',
      hyphens: 'auto',
      textWrap: 'pretty',
      hangingPunctuation: 'first',
    }),
    Style.nest(':is(li, dd)', { textWrap: 'pretty' }),
    underlined,
    Style.nest(':is(h2, h3, h4) .anchor', {
      marginInlineStart: '0.4em',
      color: t.text.subtle,
      textDecoration: 'none',
      opacity: '0',
      fontWeight: t.weight.normal,
    }),
    Style.nest(':is(h2, h3, h4):hover .anchor, :is(h2, h3, h4) .anchor:focus-visible', {
      opacity: '1',
    }),
    Style.nest('strong', { color: t.text.overt, fontWeight: t.weight.semibold }),
    Style.nest('em', { fontStyle: 'italic' }),
    Style.nest('del', { color: t.text.muted }),

    // Lists
    Style.nest(':is(ul, ol)', { paddingInlineStart: '1.5em' }),
    Style.nest('li', { paddingInlineStart: '0.25em' }),
    Style.nest('li + li', { marginBlockStart: '0.4em' }),
    Style.nest('li::marker', { color: t.text.subtle, fontVariantNumeric: 'tabular-nums' }),
    Style.nest('li :is(ul, ol)', { marginBlockStart: '0.4em' }),
    Style.nest('li > p + p', { marginBlockStart: '0.6em' }),

    // A quotation: set off by a rule, not by a box, and no longer than a paragraph.
    Style.nest('> blockquote', {
      paddingInlineStart: '1.25rem',
      borderInlineStart: `3px solid ${t.outline.overt}`,
      color: t.text.muted,
    }),
    Style.nest('blockquote > * + *', { marginBlockStart: '0.75em' }),
    Style.nest('> hr', {
      marginBlock: '2.5rem',
      border: '0',
      borderBlockStart: rule,
    }),

    // Code
    Style.nest(':not(pre) > code', {
      fontFamily: t.font.mono,
      fontSize: '0.875em',
      // The span never makes its line taller than the text around it.
      lineHeight: '1',
      padding: '0.125em 0.3em',
      borderRadius: t.radius.sm,
      background: t.surface.muted,
      color: t.text.overt,
      overflowWrap: 'anywhere',
      hyphens: 'none',
      fontVariantLigatures: 'none',
    }),
    Style.nest('a.code-link', {
      textDecorationColor: `color-mix(in oklab, currentColor 35%, transparent)`,
    }),
    Style.nest('> figure:not(.image)', { marginBlock: '1.75rem' }),
    Style.nest('> .diagram', { marginBlock: '1.75rem', overflowX: 'auto' }),

    // A table scrolls in its own box on a phone, and the page does not.
    Style.nest('> .table', {
      overflowX: 'auto',
      marginBlock: '1.75rem',
      border: rule,
      borderRadius: t.radius.md,
      scrollbarWidth: 'thin',
    }),
    Style.nest('table', {
      borderCollapse: 'collapse',
      // Cells wrap in the column; below 34rem the box scrolls instead of the words squeezing.
      inlineSize: '100%',
      minInlineSize: '34rem',
      fontSize: '0.9375rem',
      lineHeight: '1.5',
      fontVariantNumeric: 'tabular-nums',
    }),
    Style.nest(':is(th, td)', {
      padding: '0.625rem 0.875rem',
      textAlign: 'start',
      verticalAlign: 'top',
      borderBlockEnd: rule,
    }),
    Style.nest('tr:last-child :is(th, td)', { borderBlockEnd: '0' }),
    Style.nest('th', {
      fontWeight: t.weight.semibold,
      color: t.text.overt,
      background: t.surface.subtle,
    }),
    Style.nest(':is(th, td) code', { whiteSpace: 'nowrap', overflowWrap: 'normal' }),
    Style.nest('td:first-child', { color: t.text.overt }),

    // Images: a figure with its caption, the size in the markup so nothing moves as it loads.
    Style.nest('> figure.image', { marginBlock: '2rem' }),
    Style.nest('figure.image img', {
      display: 'block',
      maxInlineSize: '100%',
      blockSize: 'auto',
      borderRadius: t.radius.md,
      border: rule,
    }),
    Style.nest('figcaption', {
      maxInlineSize: 'var(--blog-measure)',
      marginBlockStart: '0.625rem',
      fontSize: '0.875rem',
      lineHeight: '1.5',
      color: t.text.muted,
      textWrap: 'pretty',
    }),
  ],

  // THE END OF A POST

  pager: [
    {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: t.space.sm,
      marginBlockStart: '4rem',
      paddingBlockStart: t.space.lg,
      borderBlockStart: rule,
    },
    Style.media(PHONE, { gridTemplateColumns: 'minmax(0, 1fr)' }),
    Style.nest('a', {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.25rem',
      minBlockSize: '2.75rem',
      padding: t.space.md,
      border: rule,
      borderRadius: t.radius.md,
      color: t.text.overt,
      lineHeight: '1.35',
      textDecoration: 'none',
      textWrap: 'balance',
    }),
    Style.nest('a:hover', { borderColor: t.text.muted }),
    Style.nest('a:focus-visible', {
      outline: `2px solid ${t.accent.default}`,
      outlineOffset: '2px',
    }),
    Style.nest('.next', { gridColumn: '2', textAlign: 'end' }),
    Style.at(`@media ${PHONE}`, Style.nest('.next', { gridColumn: '1', textAlign: 'start' })),
    Style.nest('small', { ...mono, color: t.text.subtle }),
  ],
  all: [
    { margin: `${t.space.lg} 0 0`, fontSize: '0.9375rem' },
    underlined,
    Style.nest('a', { display: 'inline-flex', alignItems: 'center', minBlockSize: '2.75rem' }),
  ],

  // THE INDEX

  feed: [
    { margin: `${t.space.md} 0 0`, fontSize: '0.875rem', color: t.text.muted },
    underlined,
    Style.nest('a', { color: t.text.muted }),
  ],
  posts: [
    { listStyle: 'none', margin: '0', padding: '0' },
    Style.nest('> li', { position: 'relative', paddingBlock: '2rem', borderBlockEnd: rule }),
    Style.nest('> li:first-child', { paddingBlockStart: '0' }),
    Style.nest('> li:last-child', { borderBlockEnd: '0' }),
  ],
  postMeta: metaLine,
  postTitle: [
    {
      margin: `${t.space.xs} 0 0`,
      maxInlineSize: '22em',
      fontSize: '1.625rem',
      lineHeight: '1.2',
      letterSpacing: '-0.022em',
      fontWeight: t.weight.semibold,
      textWrap: 'balance',
    },
    Style.media(PHONE, { fontSize: '1.4375rem' }),
    // The whole entry is the link's target.
    Style.nest('a', { color: t.text.overt, textDecoration: 'none' }),
    Style.nest('a::after', { content: '""', position: 'absolute', inset: '0' }),
    Style.nest('a:hover', { textDecoration: 'underline', textUnderlineOffset: '0.18em' }),
    Style.nest('a:focus-visible', {
      outline: `2px solid ${t.accent.default}`,
      outlineOffset: '4px',
      borderRadius: '2px',
    }),
  ],
  summary: {
    margin: `${t.space.sm} 0 0`,
    maxInlineSize: '38em',
    fontSize: '1.0625rem',
    lineHeight: '1.55',
    color: t.text.muted,
    textWrap: 'pretty',
  },
})

/**
 * The playground's appearance, as data. `Page` declares the page's own Slots with their pieces;
 * the editor's content is reached by nesting under the `writing` slot, since what the editor
 * draws inside its host is the editor's, not a view's. The package views the page places (the
 * slash menu, the link editor, the style buttons, the status line) are styled through the
 * contracts they publish.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Prose } from 'foldkit-mixins/prose'
import { Theme } from 'foldkit-mixins/theme'
import {
  BlockStyleMenuSlots,
  CodeToolbarSlots,
  EditorStatusSlots,
  FindReplaceSlots,
  FootnotePreviewSlots,
  TableOfContentsSlots,
  LinkEditorSlots,
  SlashMenuSlots,
  TableToolbarSlots,
} from 'foldkit-mixins-richtext'

export const A = AppStyle.make({
  palette: Theme.oklch({
    accent: { h: 285, c: 0.17, l: '52%', dark: { l: '72%', c: 0.14 } },
    surfaceSaturation: 0.006,
  }),
})
const { t } = A

const row = (gap: string): StyleValue =>
  Style.self({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap })

const control = Style.compose(
  Style.self({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    minInlineSize: '2rem',
    minBlockSize: '2rem',
    padding: `0 ${t.space.xs}`,
    whiteSpace: 'nowrap',
    border: '0',
    borderRadius: t.radius.md,
    background: 'transparent',
    color: t.text.default,
    font: 'inherit',
    fontSize: t.size.sm,
    cursor: 'pointer',
  }),
  Style.pseudo(':hover:not(:disabled)', { background: t.surface.muted }),
  Style.pseudo('[aria-pressed="true"]', { background: t.accent.subtle, color: t.accent.ink }),
  Style.pseudo(':disabled', { color: t.text.muted, cursor: 'default', opacity: '0.5' }),
  Style.pseudo(':focus-visible', { outline: `2px solid ${t.outline.focus}`, outlineOffset: '1px' }),
)

/**
 * How a popup arrives: it fades in as it rises a few pixels into place. The rise is travel, which
 * reduced motion zeroes, so for a reader who asked for stillness it only fades.
 */
const arrival = Style.global(
  `@layer app { @keyframes playground-arrive { from { opacity: 0; translate: 0 calc(-4px * ${t.knob.travel}); } } }`,
)

const popup = Style.self({
  animation: `playground-arrive ${t.motion.moderate} ${t.motion.settle}`,
  zIndex: '10',
  padding: t.space['2xs'],
  border: `1px solid ${t.outline.subtle}`,
  borderRadius: t.radius.lg,
  background: t.popup.surface,
  color: t.popup.ink,
  boxShadow: t.shadow.lg,
})

const field = Style.compose(
  Style.self({
    boxSizing: 'border-box',
    inlineSize: '100%',
    padding: `${t.space.xs} ${t.space.sm}`,
    border: `1px solid ${t.outline.default}`,
    borderRadius: t.radius.md,
    background: t.surface.base,
    color: t.text.default,
    font: 'inherit',
    fontSize: t.size.sm,
    resize: 'vertical',
  }),
  Style.pseudo(':focus-visible', { outline: `2px solid ${t.outline.focus}`, outlineOffset: '0' }),
)

/** The editor's content: what the vocabulary's rendering draws, inside the host. */
const writing = Style.compose(
  Prose.style({ measure: '46rem' }),
  Style.self({
    position: 'relative',
    maxInlineSize: '52rem',
    marginInline: 'auto',
    fontSize: '1.0625rem',
    lineHeight: '1.75',
  }),
  // The inline start leaves room for the block handle, inside the page rather than past it.
  Style.nest('[contenteditable="true"]', {
    minBlockSize: '24rem',
    padding: `${t.space.xl} ${t.space['2xl']} ${t.space['2xl']} 4rem`,
    outline: 'none',
    caretColor: t.accent.default,
  }),
  Style.nest('[contenteditable="true"] > * + *', { marginBlockStart: t.space.sm }),
  // An empty line is drawn with a `<br>` (foldkit-richtext-dom's filler), so it has a line of its
  // own; this keeps a heading or paragraph from collapsing if a browser drops it. Not a callout:
  // with its padding inside its size, a line's height would be all padding.
  Style.nest(':is(p, h1, h2, h3, h4, h5, h6)', { minBlockSize: '1lh' }),
  // The block a handle is dragging, dimmed until it is dropped (`foldkit-richtext-dom`'s drag).
  Style.nest('[data-richtext-dragging]', { opacity: '0.4' }),
  Style.nest('h1', {
    fontSize: 'clamp(1.9rem, 3.2vw, 2.6rem)',
    lineHeight: '1.2',
    letterSpacing: '-0.035em',
    margin: '0',
  }),
  Style.nest('h2', {
    fontSize: '1.6rem',
    letterSpacing: '-0.025em',
    lineHeight: '1.3',
    marginBlockStart: t.space.xl,
  }),
  Style.nest('h3', { fontSize: '1.25rem', marginBlockStart: t.space.lg }),
  Style.nest('[data-placeholder]::before', {
    content: 'attr(data-placeholder)',
    color: t.text.muted,
    pointerEvents: 'none',
    position: 'absolute',
  }),
  // The empty line the caret is on, only while the editor is being written in.
  Style.nest('[contenteditable]:focus [data-hint]::before', {
    content: 'attr(data-hint)',
    color: t.text.subtle,
    pointerEvents: 'none',
    position: 'absolute',
  }),
  Style.nest('a', { color: t.text.link, textUnderlineOffset: '3px' }),
  Style.nest('mark', {
    background: t.warning.subtle,
    color: 'inherit',
    borderRadius: '3px',
    padding: '0 2px',
  }),
  Style.nest('kbd', {
    padding: '1px 6px',
    border: `1px solid ${t.outline.default}`,
    borderBlockEndWidth: '2px',
    borderRadius: t.radius.sm,
    background: t.surface.muted,
    fontFamily: t.font.mono,
    fontSize: '0.85em',
  }),
  Style.nest('code', {
    padding: '1px 5px',
    borderRadius: t.radius.sm,
    background: t.surface.muted,
    fontFamily: t.font.mono,
    fontSize: '0.88em',
  }),
  Style.nest('[data-comment]', {
    background: `color-mix(in oklch, ${t.warning.default} 22%, transparent)`,
    borderBlockEnd: `2px solid color-mix(in oklch, ${t.warning.default} 70%, transparent)`,
    cursor: 'pointer',
  }),
  Style.nest('blockquote', {
    margin: `${t.space.lg} 0`,
    padding: `${t.space['2xs']} 0 ${t.space['2xs']} ${t.space.md}`,
    borderInlineStart: `3px solid ${t.accent.default}`,
    fontFamily: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
    fontSize: '1.12em',
    fontStyle: 'italic',
    color: t.text.subtle,
  }),
  Style.nest('[data-task]', {
    listStyle: 'none',
    display: 'flex',
    alignItems: 'baseline',
    gap: t.space.xs,
    marginInlineStart: `calc(-1 * ${t.space.lg})`,
  }),
  Style.nest('[data-task] > input', {
    accentColor: t.accent.default,
    inlineSize: '1rem',
    blockSize: '1rem',
    cursor: 'pointer',
    flex: 'none',
  }),
  Style.nest('[data-task="checked"] > p', { color: t.text.muted, textDecoration: 'line-through' }),
  Style.nest('[data-task] > p', { margin: '0', flex: '1' }),
  Style.nest('[data-callout]', {
    position: 'relative',
    padding: `${t.space.md} ${t.space.lg} ${t.space.md} calc(${t.space.lg} + 1.75rem)`,
    border: `1px solid color-mix(in oklch, ${t.accent.default} 20%, transparent)`,
    borderRadius: t.radius.xl,
    background: t.accent.subtle,
    whiteSpace: 'pre-wrap',
  }),
  // As in code, a break at the end has no line of its own until something follows it.
  Style.nest('[data-callout]::after', { content: '"\\200b"' }),
  Style.nest('[data-callout-icon]', {
    position: 'absolute',
    insetBlockStart: t.space.md,
    insetInlineStart: t.space.lg,
    userSelect: 'none',
  }),
  Style.nest('[data-toggle]', { position: 'relative', paddingInlineStart: t.space.xl }),
  Style.nest('[data-toggle-arrow]', {
    position: 'absolute',
    insetInlineStart: '0',
    insetBlockStart: '0.2em',
    inlineSize: '1.5rem',
    blockSize: '1.5rem',
    padding: '0',
    border: '0',
    borderRadius: t.radius.md,
    background: 'transparent',
    color: t.text.muted,
    fontSize: '0.9rem',
    cursor: 'pointer',
    transition: `transform ${t.motion.fast} ${t.motion.ease}`,
  }),
  Style.nest('[data-toggle="open"] > [data-toggle-arrow]', { transform: 'rotate(90deg)' }),
  Style.nest('[data-toggle] > p:first-of-type', { fontWeight: t.weight.semibold }),
  Style.nest('[data-toggle="closed"] > [data-block] ~ [data-block]', { display: 'none' }),
  Style.nest('[data-toggle] > [data-block] ~ [data-block]', { marginBlockStart: t.space.xs }),
  // Columns share the width evenly, and a long word wraps inside its cell instead of widening it.
  Style.nest('table', {
    inlineSize: '100%',
    tableLayout: 'fixed',
    borderCollapse: 'separate',
    borderSpacing: '0',
    border: `1px solid ${t.outline.default}`,
    borderRadius: t.radius.lg,
    overflow: 'hidden',
    fontSize: t.size.sm,
  }),
  Style.nest('td', {
    borderInlineEnd: `1px solid ${t.outline.subtle}`,
    borderBlockEnd: `1px solid ${t.outline.subtle}`,
    padding: `${t.space.xs} ${t.space.sm}`,
    verticalAlign: 'top',
    overflowWrap: 'anywhere',
  }),
  Style.nest('td:last-child', { borderInlineEnd: '0' }),
  Style.nest('tr:last-child > td', { borderBlockEnd: '0' }),
  Style.nest('td > p', { margin: '0', minBlockSize: '1.6em' }),
  Style.nest('td > p + p', { marginBlockStart: t.space['2xs'] }),
  Style.nest('tr[data-header] td', {
    background: t.surface.muted,
    fontWeight: t.weight.semibold,
    color: t.text.default,
  }),
  Style.nest('tr:not([data-header]):hover td', {
    background: `color-mix(in oklch, ${t.surface.muted} 45%, transparent)`,
  }),
  Style.nest('pre', {
    position: 'relative',
    padding: `calc(${t.space.lg} + ${t.space.xs}) ${t.space.md} ${t.space.md}`,
    border: `1px solid ${t.outline.subtle}`,
    borderRadius: t.radius.xl,
    background: t.surface.subtle,
    fontFamily: t.font.mono,
    fontSize: '0.84rem',
    lineHeight: '1.65',
    whiteSpace: 'pre-wrap',
    tabSize: '2',
  }),
  // A break at the end of the code has no line of its own until something follows it.
  Style.nest('pre::after', { content: '"\\200b"' }),
  Style.nest('[data-code-label]', {
    position: 'absolute',
    insetBlockStart: t.space.xs,
    insetInlineStart: t.space.md,
    color: t.text.muted,
    fontFamily: t.font.body,
    fontSize: t.size.xs,
    letterSpacing: '0.02em',
    userSelect: 'none',
  }),
  ...(
    [
      ['keyword', t.syntax.keyword],
      ['function', t.syntax.function],
      ['type', t.syntax.type],
      ['string', t.syntax.string],
      ['number', t.syntax.number],
      ['property', t.syntax.property],
      ['operator', t.syntax.operator],
      ['punctuation', t.syntax.punctuation],
      ['comment', t.syntax.comment],
    ] as const
  ).map(([kind, color]) => Style.nest(`[data-decoration~="syntax-${kind}"]`, { color })),
  Style.nest('figure[data-image]', {
    inlineSize: 'min(100%, var(--image-width, 100%))',
    margin: `${t.space.lg} 0`,
  }),
  Style.nest('figure[data-align="center"]', { marginInline: 'auto' }),
  Style.nest('figure[data-align="end"]', { marginInlineStart: 'auto' }),
  Style.nest('figure[data-image] > img', {
    display: 'block',
    inlineSize: '100%',
    borderRadius: t.radius.lg,
  }),
  // A block selected whole (an image, a divider) has no caret or highlight of its own.
  Style.nest('[data-selected]', {
    outline: `2px solid ${t.outline.focus}`,
    outlineOffset: '3px',
    borderRadius: t.radius.lg,
  }),
  // The browser's range around it would paint over it too.
  Style.nest('[data-selected]::selection, [data-selected] *::selection', {
    background: 'transparent',
  }),
  Style.nest('figure[data-image]', { cursor: 'default' }),
  Style.nest('figure[data-image] > figcaption', {
    marginBlockStart: t.space.xs,
    color: t.text.muted,
    fontSize: t.size.sm,
    textAlign: 'center',
  }),
  Style.nest('video', {
    display: 'block',
    maxInlineSize: '100%',
    margin: `${t.space.lg} 0`,
    borderRadius: t.radius.lg,
    background: t.surface.muted,
  }),
  Style.nest('audio', { display: 'block', inlineSize: '100%', margin: `${t.space.md} 0` }),
  Style.nest('[data-attachment]', {
    display: 'flex',
    alignItems: 'baseline',
    gap: t.space.sm,
    margin: `${t.space.md} 0`,
    padding: `${t.space.sm} ${t.space.md}`,
    border: `1px solid ${t.outline.subtle}`,
    borderRadius: t.radius.md,
    color: t.text.default,
    textDecoration: 'none',
  }),
  Style.nest('[data-attachment]::before', { content: '"📎"' }),
  Style.nest('[data-attachment-name]', { fontWeight: t.weight.semibold }),
  Style.nest('[data-attachment-size]', { color: t.text.muted, fontSize: t.size.sm }),
  Style.nest('hr', {
    border: '0',
    borderBlockStart: `1px solid ${t.outline.default}`,
    margin: `${t.space.xl} 0`,
  }),
  Style.nest('sup[data-footnote-ref]', {
    color: t.text.link,
    cursor: 'pointer',
    fontSize: '0.7em',
    paddingInline: '1px',
  }),
  Style.nest('[data-footnote]', {
    position: 'relative',
    paddingInlineStart: t.space.xl,
    paddingInlineEnd: t.space.xl,
    color: t.text.subtle,
    fontSize: t.size.sm,
    borderBlockStart: `1px solid ${t.outline.subtle}`,
    paddingBlockStart: t.space.sm,
  }),
  Style.nest('[data-footnote-label]', {
    position: 'absolute',
    insetInlineStart: '0',
    color: t.text.muted,
  }),
  Style.nest('[data-footnote] > button', {
    position: 'absolute',
    insetInlineEnd: '0',
    border: '0',
    background: 'none',
    padding: '0 2px',
    color: t.text.link,
    font: 'inherit',
    cursor: 'pointer',
  }),
  Style.nest('[data-footnote] > p', { margin: '0' }),
  Style.nest('[data-decoration~="search"]', { background: t.accent.subtle }),
  Style.nest('[data-decoration~="search-current"]', {
    background: t.accent.default,
    color: t.surface.base,
    borderRadius: '2px',
  }),
  Style.media('(max-width: 44rem)', { fontSize: '1rem' }),
  // A phone's width goes to the text, not the margins.
  Style.at(
    '@media (max-width: 44rem)',
    Style.nest('[contenteditable="true"]', {
      padding: `${t.space.lg} ${t.space.lg} ${t.space.xl} 2rem`,
    }),
  ),
)

export const Page = A.slots({
  page: Style.compose(
    arrival,
    // Where a dragged block would land: a line the drag puts on the page, outside every view.
    // While a drag is under way the page is marked, and the cursor is a closed hand everywhere,
    // over text too; `!important` because the text's caret cursor is a closer rule.
    Style.global(
      `@layer app { [data-richtext-drop] { block-size: 3px; margin-block-start: -1px; border-radius: 2px; background: ${t.accent.default}; pointer-events: none; z-index: 20; } [data-richtext-drag], [data-richtext-drag] * { cursor: grabbing !important; } }`,
    ),
    Style.self({
      boxSizing: 'border-box',
      maxInlineSize: '82rem',
      margin: '0 auto',
      padding: `${t.space.lg} ${t.space.md} ${t.space['2xl']}`,
    }),
  ),
  header: Style.compose(
    row(t.space.md),
    Style.self({
      flexWrap: 'nowrap',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBlockEnd: t.space.md,
    }),
  ),
  title: Style.self({ margin: '0', fontSize: t.size.lg, letterSpacing: '-0.02em' }),
  lede: Style.self({
    margin: `${t.space['2xs']} 0 0`,
    color: t.text.muted,
    fontSize: t.size.sm,
    maxInlineSize: '48rem',
  }),
  surface: Style.self({
    border: `1px solid ${t.outline.subtle}`,
    borderRadius: t.radius.xl,
    background: t.surface.base,
    boxShadow: t.shadow.sm,
    overflow: 'clip',
  }),
  // One row of tools that stays in reach while the document scrolls under it.
  bar: Style.compose(
    row(t.space['3xs']),
    Style.self({
      position: 'sticky',
      insetBlockStart: '0',
      zIndex: '8',
      padding: `${t.space.xs} ${t.space.sm}`,
      borderBlockEnd: `1px solid ${t.outline.subtle}`,
      background: t.surface.base,
    }),
    Style.media('(max-width: 40rem)', { flexWrap: 'nowrap', padding: `${t.space.xs}` }),
  ),
  // On a phone the toolbar keeps to one row: what the slash menu also offers steps aside, and a
  // labelled tool shows its icon alone.
  tool: Style.compose(
    control,
    Style.media('(max-width: 40rem)', { minInlineSize: '1.875rem', paddingInline: '0' }),
    Style.at(
      '@media (max-width: 40rem)',
      Style.pseudo('[data-priority="low"]', { display: 'none' }),
    ),
  ),
  toolLabel: Style.compose(
    Style.self({ fontSize: t.size.sm }),
    Style.media('(max-width: 40rem)', { display: 'none' }),
  ),
  spacer: Style.self({ flex: '1' }),
  dismiss: Style.self({ display: 'none' }),
  separator: Style.compose(
    Style.self({
      inlineSize: '1px',
      blockSize: '1.25rem',
      background: t.outline.subtle,
      marginInline: t.space['2xs'],
    }),
    Style.media('(max-width: 40rem)', { marginInline: '1px' }),
    Style.at(
      '@media (max-width: 40rem)',
      Style.pseudo('[data-priority="low"]', { display: 'none' }),
    ),
  ),
  anchor: Style.compose(
    Style.self({ position: 'relative' }),
    Style.at(
      '@media (max-width: 40rem)',
      Style.pseudo('[data-priority="low"]', { display: 'none' }),
    ),
  ),
  dropdown: Style.compose(
    popup,
    Style.self({
      position: 'absolute',
      insetBlockStart: 'calc(100% + 6px)',
      insetInlineStart: '0',
      zIndex: '20',
      minInlineSize: '16rem',
      display: 'grid',
      gap: '1px',
      padding: t.space['2xs'],
    }),
    Style.pseudo('[data-align="end"]', { insetInlineStart: 'auto', insetInlineEnd: '0' }),
    Style.pseudo('[role="dialog"]', {
      inlineSize: '18rem',
      gap: t.space.sm,
      padding: t.space.sm,
    }),
  ),
  // An entry: its icon, its label, and a line under the label saying what it does.
  menuItem: Style.compose(
    control,
    Style.self({
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      columnGap: t.space.sm,
      alignItems: 'center',
      justifyContent: 'stretch',
      inlineSize: '100%',
      minBlockSize: '2.75rem',
      padding: `${t.space['2xs']} ${t.space.sm}`,
      textAlign: 'start',
      whiteSpace: 'normal',
    }),
    Style.nest('& > svg', { gridRow: '1 / span 2', color: t.text.muted }),
  ),
  // A compact entry: an icon and a label on one line, as a block's menu lists them.
  action: Style.compose(
    control,
    Style.self({
      justifyContent: 'flex-start',
      gap: t.space.sm,
      inlineSize: '100%',
      minBlockSize: '2rem',
      padding: `0 ${t.space.sm}`,
    }),
    Style.nest('& > svg', { color: t.text.muted }),
    Style.pseudo('[data-danger="true"]', { color: t.error.ink }),
    Style.pseudo('[data-danger="true"]:hover', { background: t.error.subtle }),
    Style.nest('&[data-danger="true"] > svg', { color: 'currentColor' }),
  ),
  menuLabel: Style.self({ fontSize: t.size.sm, color: t.text.default }),
  menuDescription: Style.self({ fontSize: t.size.xs, color: t.text.muted }),
  confirmText: Style.self({ margin: '0', fontSize: t.size.sm, lineHeight: '1.5' }),
  danger: Style.compose(
    control,
    Style.self({ background: t.error.default, color: t.error['on-fill'] }),
    Style.pseudo(':hover:not(:disabled)', { background: t.error.ink }),
  ),
  menuHeading: Style.self({
    margin: '0',
    padding: `${t.space.xs} ${t.space.sm} ${t.space['3xs']}`,
    color: t.text.muted,
    fontSize: t.size.xs,
    fontWeight: t.weight.semibold,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  }),
  menuRow: row('0'),
  body: Style.compose(
    Style.self({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }),
    Style.media('(min-width: 64rem)', { gridTemplateColumns: 'minmax(0, 1fr) 20rem' }),
  ),
  canvas: Style.self({ position: 'relative', minInlineSize: '0' }),
  writing,
  floating: Style.compose(
    popup,
    row('0'),
    Style.self({ position: 'fixed', insetBlockStart: '-999px' }),
  ),
  // A block's toolbar, which `blockAnchor` fixes above the block the caret is in.
  blockTools: Style.compose(
    popup,
    Style.self({ position: 'fixed', insetBlockStart: '-999px', zIndex: '6' }),
  ),
  // A status floats at the foot of the window, where it is seen, and goes by itself.
  toasts: Style.self({
    position: 'fixed',
    insetBlockEnd: t.space.lg,
    insetInline: '0',
    zIndex: '30',
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
  }),
  toast: Style.compose(
    row(t.space.xs),
    Style.self({
      padding: `${t.space.xs} ${t.space.md}`,
      borderRadius: t.radius.full,
      background: t.popup.surface,
      color: t.popup.ink,
      boxShadow: t.shadow.lg,
      fontSize: t.size.sm,
      animation: `playground-arrive ${t.motion.moderate} ${t.motion.settle}`,
    }),
    Style.nest('& > svg', { color: t.success.default }),
    Style.nest('&[data-failed="true"] > svg', { color: t.error.default }),
  ),
  // A footnote's note, fixed beside the caret by `selectionAnchor`.
  notePreview: Style.compose(
    popup,
    Style.self({
      position: 'fixed',
      insetBlockStart: '-999px',
      inlineSize: 'min(20rem, calc(100vw - 2rem))',
      padding: t.space.sm,
    }),
  ),
  slash: Style.compose(
    popup,
    Style.self({
      position: 'fixed',
      insetBlockStart: '-999px',
      inlineSize: '18rem',
      maxBlockSize: '22rem',
      overflow: 'auto',
      overscrollBehavior: 'contain',
    }),
  ),
  // Fixed beside its block by `blockAnchor`, which writes `top` and `left`; the grip is centred
  // on the block's first line, whose height depends on the kind of block.
  handle: Style.compose(
    Style.self({
      position: 'fixed',
      zIndex: '5',
      insetBlockStart: '-999px',
      display: 'flex',
      alignItems: 'center',
      blockSize: 'calc(1.0625rem * 1.75)',
    }),
    Style.pseudo('[data-line="h1"]', { blockSize: 'calc(clamp(1.9rem, 3.2vw, 2.6rem) * 1.2)' }),
    Style.pseudo('[data-line="h2"]', { blockSize: 'calc(1.6rem * 1.3)' }),
    Style.pseudo('[data-line="h3"]', { blockSize: 'calc(1.25rem * 1.75)' }),
    Style.pseudo('[data-line="Callout"]', { paddingBlockStart: t.space.md, blockSize: 'auto' }),
    Style.pseudo('[data-line="CodeBlock"]', { paddingBlockStart: t.space.lg, blockSize: 'auto' }),
    Style.pseudo('[data-line="Table"]', { paddingBlockStart: t.space.xs, blockSize: 'auto' }),
    Style.pseudo('[data-line="Image"]', { blockSize: 'auto' }),
  ),
  grip: Style.compose(
    control,
    Style.self({
      position: 'relative',
      minInlineSize: '1.5rem',
      minBlockSize: '1.75rem',
      padding: '0',
      color: t.text.muted,
      cursor: 'grab',
      touchAction: 'none',
    }),
    Style.pseudo(':active', { cursor: 'grabbing' }),
  ),
  sidebar: Style.compose(
    Style.self({
      display: 'grid',
      alignContent: 'start',
      gap: t.space.lg,
      padding: t.space.md,
      borderBlockStart: `1px solid ${t.outline.subtle}`,
      background: t.surface.subtle,
    }),
    Style.media('(min-width: 64rem)', {
      borderBlockStart: '0',
      borderInlineStart: `1px solid ${t.outline.subtle}`,
    }),
  ),
  panel: Style.self({ display: 'grid', alignContent: 'start', gap: t.space.sm }),
  sidebarTitle: Style.self({ margin: '0', fontSize: t.size.sm, fontWeight: t.weight.semibold }),
  empty: Style.self({ margin: '0', color: t.text.muted, fontSize: t.size.sm }),
  card: Style.compose(
    Style.self({
      display: 'grid',
      gap: t.space.xs,
      padding: t.space.sm,
      border: `1px solid ${t.outline.subtle}`,
      borderRadius: t.radius.lg,
      background: t.surface.base,
      textAlign: 'start',
      font: 'inherit',
      color: 'inherit',
    }),
    Style.pseudo('[data-active="true"]', { borderColor: t.accent.default, boxShadow: t.shadow.md }),
    Style.pseudo('[data-active="false"]', { cursor: 'pointer' }),
  ),
  quote: Style.self({
    margin: '0',
    paddingInlineStart: t.space.xs,
    borderInlineStart: `3px solid ${t.warning.default}`,
    color: t.text.muted,
    fontSize: t.size.xs,
  }),
  // A remark: the speaker's initials beside their name, and what they said under the name.
  remark: Style.self({
    display: 'grid',
    gridTemplateColumns: '1.75rem 1fr',
    columnGap: t.space.xs,
    rowGap: '2px',
    alignItems: 'center',
    fontSize: t.size.sm,
  }),
  avatar: Style.self({
    gridRow: '1 / span 2',
    alignSelf: 'start',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    inlineSize: '1.75rem',
    blockSize: '1.75rem',
    borderRadius: '50%',
    background: t.accent.subtle,
    color: t.accent.ink,
    fontSize: t.size.xs,
    fontWeight: t.weight.semibold,
  }),
  author: Style.self({ fontWeight: t.weight.semibold, fontSize: t.size.xs }),
  remarkBody: Style.self({ gridColumn: '2', lineHeight: '1.5' }),
  field,
  actions: Style.compose(row(t.space['2xs']), Style.self({ justifyContent: 'flex-end' })),
  primary: Style.compose(
    control,
    Style.self({ background: t.accent.default, color: t.accent['on-fill'] }),
    Style.pseudo(':hover:not(:disabled)', { background: t.accent.hover }),
  ),
  footer: Style.compose(
    row(t.space.md),
    Style.self({
      justifyContent: 'space-between',
      padding: `${t.space.xs} ${t.space.md}`,
      borderBlockStart: `1px solid ${t.outline.subtle}`,
      color: t.text.muted,
      fontSize: t.size.xs,
    }),
  ),
  notice: Style.compose(
    row(t.space.xs),
    Style.self({
      padding: `${t.space.xs} ${t.space.md}`,
      background: t.error.subtle,
      color: t.error.ink,
      fontSize: t.size.sm,
    }),
  ),
  file: Style.self({
    position: 'absolute',
    inlineSize: '1px',
    blockSize: '1px',
    opacity: '0',
    overflow: 'hidden',
  }),
  note: Style.self({ margin: `${t.space.sm} 0 0`, color: t.text.muted, fontSize: t.size.xs }),
})

export const SlashMenuStyle = A.forSlots(SlashMenuSlots)({
  list: Style.self({ display: 'grid', gap: '1px' }),
  heading: Style.self({
    padding: `${t.space.xs} ${t.space.sm} ${t.space['3xs']}`,
    color: t.text.muted,
    fontSize: t.size.xs,
    fontWeight: t.weight.semibold,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  }),
  // An entry: its icon in a tile, then its label over the line that says what it makes.
  item: Style.compose(
    control,
    Style.self({
      display: 'grid',
      gridTemplateColumns: '2rem 1fr',
      columnGap: t.space.sm,
      alignItems: 'center',
      justifyContent: 'stretch',
      inlineSize: '100%',
      padding: `${t.space['2xs']} ${t.space.xs}`,
      textAlign: 'start',
      whiteSpace: 'normal',
    }),
    Style.pseudo('[aria-current="true"]', { background: t.accent.subtle }),
  ),
  icon: Style.self({
    gridRow: '1 / span 2',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    inlineSize: '2rem',
    blockSize: '2rem',
    border: `1px solid ${t.outline.subtle}`,
    borderRadius: t.radius.md,
    background: t.surface.base,
    color: t.text.default,
  }),
  label: Style.self({ fontSize: t.size.sm, color: t.text.default }),
  description: Style.self({ fontSize: t.size.xs, color: t.text.muted }),
  empty: Style.self({
    margin: '0',
    padding: `${t.space.xs} ${t.space.sm}`,
    color: t.text.muted,
    fontSize: t.size.sm,
  }),
})

export const LinkEditorStyle = A.forSlots(LinkEditorSlots)({
  root: row(t.space['2xs']),
  input: Style.compose(field, Style.self({ inlineSize: '16rem' })),
  apply: control,
  remove: control,
})

export const BlockStyleMenuStyle = A.forSlots(BlockStyleMenuSlots)({
  root: Style.self({ position: 'relative' }),
  trigger: Style.compose(
    control,
    Style.self({ minInlineSize: '9.5rem', justifyContent: 'space-between' }),
    Style.pseudo('[aria-expanded="true"]', { background: t.surface.muted }),
    // On a phone the icon says the style, and the trigger's name says it aloud.
    Style.media('(max-width: 40rem)', { minInlineSize: '0' }),
  ),
  menu: Style.compose(
    popup,
    Style.self({
      position: 'absolute',
      insetBlockStart: 'calc(100% + 6px)',
      insetInlineStart: '0',
      zIndex: '20',
      display: 'grid',
      minInlineSize: '12rem',
    }),
  ),
  item: Style.compose(
    control,
    Style.self({
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: t.space.sm,
      justifyContent: 'stretch',
      textAlign: 'start',
    }),
  ),
  icon: Style.self({ display: 'inline-flex', color: t.text.muted }),
  label: Style.compose(
    Style.self({ fontSize: t.size.sm }),
    // The trigger's label, not an item's: on a phone the icon says the style.
    Style.at(
      '@media (max-width: 40rem)',
      Style.nest(':where([aria-haspopup="menu"]) > &', { display: 'none' }),
    ),
  ),
  check: Style.self({ display: 'inline-flex', color: t.accent.default, minInlineSize: '16px' }),
})

export const StatusStyle = A.forSlots(EditorStatusSlots)({
  counts: Style.self({ margin: '0' }),
  problems: Style.self({ margin: '0', padding: '0', listStyle: 'none' }),
})

export const TableToolbarStyle = A.forSlots(TableToolbarSlots)({
  toolbar: row('0'),
  button: Style.compose(
    control,
    Style.self({ fontSize: t.size.xs, minBlockSize: '1.75rem', whiteSpace: 'nowrap' }),
    Style.pseudo('[data-table^="delete"]:hover:not(:disabled)', {
      color: t.error.ink,
      background: t.error.subtle,
    }),
  ),
})

export const CodeToolbarStyle = A.forSlots(CodeToolbarSlots)({
  root: row(t.space['2xs']),
  language: Style.compose(
    field,
    Style.self({ inlineSize: 'auto', paddingBlock: '2px', fontSize: t.size.xs, cursor: 'pointer' }),
  ),
  copy: Style.compose(control, Style.self({ fontSize: t.size.xs, minBlockSize: '1.75rem' })),
})

export const FindReplaceStyle = A.forSlots(FindReplaceSlots)({
  root: Style.compose(
    row(t.space['2xs']),
    Style.self({
      padding: `${t.space.xs} ${t.space.sm}`,
      borderBlockEnd: `1px solid ${t.outline.subtle}`,
    }),
  ),
  field: Style.compose(field, Style.self({ inlineSize: '12rem' })),
  count: Style.self({
    minInlineSize: '5.5rem',
    color: t.text.muted,
    fontSize: t.size.xs,
    fontVariantNumeric: 'tabular-nums',
  }),
  button: Style.compose(
    control,
    Style.self({ fontSize: t.size.xs, minBlockSize: '1.75rem', whiteSpace: 'nowrap' }),
  ),
})

export const TableOfContentsStyle = A.forSlots(TableOfContentsSlots)({
  list: Style.self({ display: 'grid', margin: '0', padding: '0', listStyle: 'none' }),
  entry: Style.compose(
    Style.self({
      display: 'block',
      inlineSize: '100%',
      padding: `${t.space['2xs']} ${t.space.xs}`,
      // Each level below the shallowest one used steps in.
      paddingInlineStart: `calc(${t.space.xs} + (var(--fk-toc-level, 1) - 1) * ${t.space.md})`,
      border: '0',
      borderInlineStart: '2px solid transparent',
      background: 'none',
      color: t.text.muted,
      font: 'inherit',
      fontSize: t.size.sm,
      textAlign: 'start',
      cursor: 'pointer',
    }),
    Style.pseudo(':hover', { color: t.text.default }),
    Style.pseudo('[aria-current="location"]', {
      color: t.accent.ink,
      borderInlineStartColor: t.accent.default,
      fontWeight: t.weight.semibold,
    }),
  ),
})

export const FootnotePreviewStyle = A.forSlots(FootnotePreviewSlots)({
  root: Style.self({
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    alignItems: 'center',
    gap: t.space.xs,
  }),
  label: Style.compose(field, Style.self({ inlineSize: '3.5rem', fontSize: t.size.xs })),
  text: Style.self({
    gridColumn: '1 / -1',
    gridRow: '2',
    margin: '0',
    color: t.text.default,
    fontSize: t.size.sm,
  }),
  button: Style.compose(
    control,
    Style.self({ justifySelf: 'end', fontSize: t.size.xs, minBlockSize: '1.75rem' }),
  ),
})

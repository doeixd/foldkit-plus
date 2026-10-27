/**
 * The page's look, on the demos' theme (`demoStyle`): a sidebar of pages beside the open one,
 * and the editor with its toolbar, handles and menus. The editor's content is reached by nesting
 * under the `writing` slot, since what the editor draws inside its host is the editor's, not a
 * view's; the package views placed around it are styled through the contracts they publish.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { Prose } from 'foldkit-mixins/prose'
import {
  BlockStyleMenuSlots,
  LinkEditorSlots,
  SlashMenuSlots,
  TableToolbarSlots,
} from 'foldkit-mixins-richtext'
import { demoStyle } from 'foldkit-example-site/demo-style'

const { t } = demoStyle

export const stylesheet = demoStyle.stylesheet

/** A phone: the pages above the page, and the toolbar on one row. */
const NARROW = '(max-width: 40rem)'

/** Someone else's caret and the name over it: the warning hue, which no other text uses. */
const peer = t.warning.default

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
  `@layer app { @keyframes pages-arrive { from { opacity: 0; translate: 0 calc(-4px * ${t.knob.travel}); } } }`,
)

const popup = Style.self({
  animation: `pages-arrive ${t.motion.moderate} ${t.motion.settle}`,
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
  }),
  Style.pseudo(':focus-visible', { outline: `2px solid ${t.outline.focus}`, outlineOffset: '0' }),
)

/** A person's initials in a circle: someone on the page, or you. */
const avatar = Style.self({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  inlineSize: '1.75rem',
  blockSize: '1.75rem',
  borderRadius: '50%',
  fontSize: t.size.xs,
  fontWeight: t.weight.semibold,
})

/** The editor's content: what the vocabulary's rendering draws, inside the host. */
const writing = Style.compose(
  Prose.style({ measure: '46rem' }),
  Style.self({ position: 'relative', fontSize: '1.0625rem', lineHeight: '1.75' }),
  // The inline start leaves room for the block handle, inside the page rather than past it.
  Style.nest('[contenteditable="true"]', {
    minBlockSize: '22rem',
    // Room above the first line for the toolbar over a selection in it.
    padding: `${t.space['2xl']} 0 ${t.space['2xl']} 3rem`,
    outline: 'none',
    caretColor: t.accent.default,
  }),
  Style.nest('[contenteditable="true"] > * + *', { marginBlockStart: t.space.sm }),
  // An empty line keeps a line of its own, which a browser dropping its filler would take away.
  // Not a callout: with its padding inside its size, a line's height would be all padding.
  Style.nest(':is(p, h1, h2, h3, h4, h5, h6)', { minBlockSize: '1lh' }),
  // The block a handle is dragging, dimmed until it is dropped (`foldkit-richtext-dom`'s drag).
  Style.nest('[data-richtext-dragging]', { opacity: '0.4' }),
  Style.nest('h1', { fontSize: '2rem', lineHeight: '1.2', letterSpacing: '-0.03em' }),
  Style.nest('h2', {
    fontSize: '1.5rem',
    lineHeight: '1.3',
    letterSpacing: '-0.02em',
    marginBlockStart: t.space.xl,
  }),
  Style.nest('h3', { fontSize: '1.2rem', marginBlockStart: t.space.lg }),
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
  Style.nest('code', {
    padding: '1px 5px',
    borderRadius: t.radius.sm,
    background: t.surface.muted,
    fontFamily: t.font.mono,
    fontSize: '0.88em',
  }),
  Style.nest('blockquote', {
    margin: `${t.space.md} 0`,
    padding: `${t.space['2xs']} 0 ${t.space['2xs']} ${t.space.md}`,
    borderInlineStart: `3px solid ${t.accent.default}`,
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
  // A break at the end has no line of its own until something follows it.
  Style.nest('[data-callout]::after', { content: '"\\200b"' }),
  Style.nest('[data-callout-icon]', {
    position: 'absolute',
    insetBlockStart: t.space.md,
    insetInlineStart: t.space.lg,
    userSelect: 'none',
  }),
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
  Style.nest('tr[data-header] td', { background: t.surface.muted, fontWeight: t.weight.semibold }),
  Style.nest('pre', {
    padding: t.space.md,
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
  Style.nest('hr', {
    border: '0',
    borderBlockStart: `1px solid ${t.outline.default}`,
    margin: `${t.space.xl} 0`,
  }),
  // A block selected whole (a divider) has no caret or highlight of its own.
  Style.nest('[data-selected]', {
    outline: `2px solid ${t.outline.focus}`,
    outlineOffset: '3px',
    borderRadius: t.radius.lg,
  }),
  // Someone else's caret: after the character drawn, or before it at a run's start.
  Style.nest('[data-decoration="peer"]', { boxShadow: `2px 0 0 ${peer}` }),
  Style.nest('[data-decoration="peer-before"]', { boxShadow: `-2px 0 0 ${peer}` }),
  Style.nest('[data-decoration^="peer"]', { position: 'relative' }),
  // Their name, from the decoration's data, over the caret.
  Style.nest('[data-decoration^="peer"]::after', {
    content: 'attr(data-decoration-name)',
    position: 'absolute',
    insetBlockEnd: '100%',
    insetInlineStart: '0',
    padding: '0 4px',
    borderRadius: '3px',
    background: peer,
    color: t.surface.base,
    fontFamily: t.font.body,
    fontSize: '11px',
    fontStyle: 'normal',
    fontWeight: t.weight.semibold,
    lineHeight: '1.5',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  }),
  Style.media(NARROW, { fontSize: '1rem' }),
  // A phone's width goes to the text, not the margins.
  Style.at(
    `@media ${NARROW}`,
    Style.nest('[contenteditable="true"]', { paddingInlineStart: '2rem' }),
  ),
)

export const Page = demoStyle.slots({
  shell: Style.compose(
    arrival,
    // Where a dragged block would land: a line the drag puts on the page, outside every view.
    // While a drag is under way the page is marked, and the cursor is a closed hand everywhere,
    // over text too; `!important` because the text's caret cursor is a closer rule.
    Style.global(
      `@layer app { [data-richtext-drop] { block-size: 3px; margin-block-start: -1px; border-radius: 2px; background: ${t.accent.default}; pointer-events: none; z-index: 20; } [data-richtext-drag], [data-richtext-drag] * { cursor: grabbing !important; } }`,
    ),
    Style.self({
      display: 'grid',
      gridTemplateColumns: '16rem minmax(0, 1fr)',
      minBlockSize: '100dvh',
      background: t.surface.base,
    }),
    Style.media(NARROW, { gridTemplateColumns: 'minmax(0, 1fr)', alignContent: 'start' }),
  ),
  sidebar: Style.compose(
    Style.self({
      position: 'sticky',
      insetBlockStart: '0',
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.md,
      blockSize: '100dvh',
      boxSizing: 'border-box',
      padding: `${t.space.md} ${t.space.sm}`,
      borderInlineEnd: `1px solid ${t.outline.subtle}`,
      background: t.surface.subtle,
      overflow: 'auto',
    }),
    Style.media(NARROW, {
      position: 'static',
      blockSize: 'auto',
      borderInlineEnd: '0',
      borderBlockEnd: `1px solid ${t.outline.subtle}`,
    }),
  ),
  brand: Style.compose(
    row(t.space.xs),
    Style.self({ paddingInline: t.space.xs, fontWeight: t.weight.semibold }),
  ),
  logo: Style.self({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    inlineSize: '1.5rem',
    blockSize: '1.5rem',
    borderRadius: t.radius.md,
    background: t.accent.default,
    color: t.accent['on-fill'],
    fontSize: t.size.xs,
  }),
  section: Style.self({ display: 'grid', gap: '1px' }),
  sectionTitle: Style.self({
    margin: '0',
    padding: `0 ${t.space.xs} ${t.space['2xs']}`,
    color: t.text.muted,
    fontSize: t.size.xs,
    fontWeight: t.weight.semibold,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  }),
  pageList: Style.self({
    display: 'grid',
    gap: '1px',
    margin: '0',
    padding: '0',
    listStyle: 'none',
  }),
  // A page in the list: its title, the current one marked as the toolbar marks a pressed tool.
  pageLink: Style.compose(
    control,
    Style.self({
      justifyContent: 'flex-start',
      inlineSize: '100%',
      paddingInline: t.space.xs,
      color: t.text.subtle,
      textAlign: 'start',
      overflow: 'hidden',
    }),
    Style.pseudo('[aria-current="page"]', {
      background: t.accent.subtle,
      color: t.accent.ink,
      fontWeight: t.weight.semibold,
    }),
  ),
  pageName: Style.self({ overflow: 'hidden', textOverflow: 'ellipsis' }),
  // How many others have the page open, at its end.
  pageCount: Style.self({
    marginInlineStart: 'auto',
    paddingInline: '6px',
    borderRadius: t.radius.full,
    background: `color-mix(in oklch, ${peer} 35%, transparent)`,
    color: t.text.default,
    fontSize: t.size.xs,
    fontWeight: t.weight.semibold,
  }),
  newPage: Style.compose(
    control,
    Style.self({ justifyContent: 'flex-start', inlineSize: '100%', color: t.text.muted }),
  ),
  trash: Style.compose(
    Style.self({ fontSize: t.size.sm, color: t.text.muted }),
    Style.nest('summary', { cursor: 'pointer', padding: `${t.space['2xs']} ${t.space.xs}` }),
  ),
  trashed: Style.compose(
    row(t.space.xs),
    Style.self({ justifyContent: 'space-between', paddingInlineStart: t.space.md }),
  ),
  restore: Style.compose(control, Style.self({ fontSize: t.size.xs, minBlockSize: '1.75rem' })),
  // Who else is here, at the foot of the sidebar.
  online: Style.compose(
    row(t.space.xs),
    Style.self({
      marginBlockStart: 'auto',
      paddingInline: t.space.xs,
      color: t.text.muted,
      fontSize: t.size.xs,
    }),
    Style.media(NARROW, { display: 'none' }),
  ),
  // Whether this tab's edits reached the server; shown at every width, unlike who is here.
  saved: Style.compose(
    Style.self({
      margin: '0',
      paddingInline: t.space.xs,
      color: t.text.muted,
      fontSize: t.size.xs,
    }),
    Style.states({ offline: { color: t.warning.ink } }),
  ),
  main: Style.self({ minInlineSize: '0' }),
  // Above the page: where it is, who else has it open, and deleting it.
  topbar: Style.compose(
    row(t.space.sm),
    Style.self({
      flexWrap: 'nowrap',
      justifyContent: 'space-between',
      padding: `${t.space.xs} ${t.space.md}`,
      color: t.text.muted,
      fontSize: t.size.sm,
    }),
  ),
  crumb: Style.self({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
  people: row(t.space['2xs']),
  peerAvatar: Style.compose(
    avatar,
    Style.self({
      background: `color-mix(in oklch, ${peer} 40%, ${t.surface.base})`,
      color: t.text.default,
      boxShadow: `0 0 0 2px ${t.surface.base}`,
    }),
  ),
  document: Style.compose(
    Style.self({
      boxSizing: 'border-box',
      maxInlineSize: '52rem',
      marginInline: 'auto',
      padding: `${t.space.lg} ${t.space.md} ${t.space['2xl']}`,
    }),
    Style.media(NARROW, { padding: `${t.space.sm} ${t.space.sm} ${t.space.xl}` }),
  ),
  title: Style.compose(
    Style.self({
      boxSizing: 'border-box',
      inlineSize: '100%',
      padding: `0 0 0 3rem`,
      border: '0',
      outline: '0',
      background: 'none',
      color: t.text.overt,
      font: 'inherit',
      fontSize: '2.5rem',
      fontWeight: t.weight.bold,
      lineHeight: '1.2',
      letterSpacing: '-0.035em',
    }),
    Style.pseudo('::placeholder', { color: t.text.subtle }),
    Style.media(NARROW, { paddingInlineStart: '2rem', fontSize: '1.9rem' }),
  ),
  // One row of tools that stays in reach while the page scrolls under it.
  bar: Style.compose(
    row(t.space['3xs']),
    Style.self({
      position: 'sticky',
      insetBlockStart: '0',
      zIndex: '8',
      margin: `${t.space.sm} 0 0`,
      padding: `${t.space['2xs']} ${t.space.xs}`,
      border: `1px solid ${t.outline.subtle}`,
      borderRadius: t.radius.lg,
      background: t.surface.base,
      boxShadow: t.shadow.sm,
    }),
    Style.media(NARROW, { flexWrap: 'nowrap', overflowX: 'auto' }),
  ),
  // On a phone the toolbar keeps to one row: what the slash menu also offers steps aside.
  tool: Style.compose(
    control,
    Style.media(NARROW, { minInlineSize: '1.875rem', paddingInline: '0' }),
    Style.at(`@media ${NARROW}`, Style.pseudo('[data-priority="low"]', { display: 'none' })),
  ),
  toolLabel: Style.compose(
    Style.self({ fontSize: t.size.sm }),
    Style.media(NARROW, { display: 'none' }),
  ),
  danger: Style.compose(
    control,
    Style.self({ color: t.text.muted }),
    Style.pseudo(':hover:not(:disabled)', { background: t.error.subtle, color: t.error.ink }),
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
    Style.at(`@media ${NARROW}`, Style.pseudo('[data-priority="low"]', { display: 'none' })),
  ),
  anchor: Style.compose(
    Style.self({ position: 'relative' }),
    Style.at(`@media ${NARROW}`, Style.pseudo('[data-priority="low"]', { display: 'none' })),
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
    }),
    Style.pseudo('[data-align="end"]', { insetInlineStart: 'auto', insetInlineEnd: '0' }),
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
  menuLabel: Style.self({ fontSize: t.size.sm, color: t.text.default }),
  menuDescription: Style.self({ fontSize: t.size.xs, color: t.text.muted }),
  // A compact entry: an icon and a label on one line, as a block's menu lists them.
  action: Style.compose(
    control,
    Style.self({
      justifyContent: 'flex-start',
      gap: t.space.sm,
      inlineSize: '100%',
      padding: `0 ${t.space.sm}`,
    }),
    Style.nest('& > svg', { color: t.text.muted }),
    Style.pseudo('[data-danger="true"]', { color: t.error.ink }),
    Style.pseudo('[data-danger="true"]:hover', { background: t.error.subtle }),
    Style.nest('&[data-danger="true"] > svg', { color: 'currentColor' }),
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
  canvas: Style.self({ position: 'relative', minInlineSize: '0' }),
  writing,
  floating: Style.compose(
    popup,
    row('0'),
    Style.self({ position: 'fixed', insetBlockStart: '-999px' }),
  ),
  // A table's toolbar, which `blockAnchor` fixes above the table the caret is in.
  blockTools: Style.compose(
    popup,
    Style.self({ position: 'fixed', insetBlockStart: '-999px', zIndex: '6' }),
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
    Style.pseudo('[data-line="h1"]', { blockSize: 'calc(2rem * 1.2)' }),
    Style.pseudo('[data-line="h2"]', { blockSize: 'calc(1.5rem * 1.3)' }),
    Style.pseudo('[data-line="h3"]', { blockSize: 'calc(1.2rem * 1.75)' }),
    Style.pseudo('[data-line="Callout"]', { paddingBlockStart: t.space.md, blockSize: 'auto' }),
    Style.pseudo('[data-line="CodeBlock"]', { paddingBlockStart: t.space.md, blockSize: 'auto' }),
    Style.pseudo('[data-line="Table"]', { paddingBlockStart: t.space.xs, blockSize: 'auto' }),
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
  // The page as Markdown, under it, closed until asked for.
  markdown: Style.compose(
    Style.self({
      marginBlockStart: t.space.xl,
      paddingInlineStart: '3rem',
      color: t.text.muted,
      fontSize: t.size.sm,
    }),
    Style.nest('summary', { cursor: 'pointer', inlineSize: 'fit-content' }),
    Style.nest('pre', {
      margin: `${t.space.sm} 0 0`,
      padding: t.space.md,
      borderRadius: t.radius.lg,
      background: t.surface.subtle,
      color: t.text.default,
      fontFamily: t.font.mono,
      fontSize: t.size.xs,
      whiteSpace: 'pre-wrap',
      overflowX: 'auto',
    }),
    Style.media(NARROW, { paddingInlineStart: '0' }),
  ),
  // Nothing open: a quiet prompt in the middle of the page.
  empty: Style.self({
    display: 'grid',
    justifyItems: 'center',
    alignContent: 'center',
    gap: t.space.xs,
    minBlockSize: '70dvh',
    padding: t.space.lg,
    textAlign: 'center',
  }),
  emptyTitle: Style.self({ margin: '0', fontWeight: t.weight.semibold, color: t.text.overt }),
  hint: Style.self({ margin: `0 0 ${t.space.sm}`, color: t.text.muted, fontSize: t.size.sm }),
  primary: Style.compose(
    control,
    Style.self({
      paddingInline: t.space.md,
      background: t.accent.default,
      color: t.accent['on-fill'],
    }),
    Style.pseudo(':hover:not(:disabled)', { background: t.accent.hover }),
  ),
})

export const SlashMenuStyle = demoStyle.forSlots(SlashMenuSlots)({
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

export const LinkEditorStyle = demoStyle.forSlots(LinkEditorSlots)({
  root: row(t.space['2xs']),
  input: Style.compose(field, Style.self({ inlineSize: '16rem' })),
  apply: control,
  remove: control,
})

export const BlockStyleMenuStyle = demoStyle.forSlots(BlockStyleMenuSlots)({
  root: Style.self({ position: 'relative' }),
  trigger: Style.compose(
    control,
    Style.self({ minInlineSize: '9.5rem', justifyContent: 'space-between' }),
    Style.pseudo('[aria-expanded="true"]', { background: t.surface.muted }),
    // On a phone the icon says the style, and the trigger's name says it aloud.
    Style.media(NARROW, { minInlineSize: '0' }),
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
      `@media ${NARROW}`,
      Style.nest(':where([aria-haspopup="menu"]) > &', { display: 'none' }),
    ),
  ),
  check: Style.self({ display: 'inline-flex', color: t.accent.default, minInlineSize: '16px' }),
})

export const TableToolbarStyle = demoStyle.forSlots(TableToolbarSlots)({
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

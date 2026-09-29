/**
 * The authoring shell's look: the studio's sidebar, sections, editor bar and
 * cards, as `AdminSlots` publishes them. What several owners share (the theme,
 * links, buttons, badges, disclosures) lives in `style.ts`.
 */
import { Slots, Style } from 'foldkit-mixins'
import { Layout } from 'foldkit-mixins/layout'
import {
  app,
  button,
  chevron,
  chevronOpen,
  control,
  field,
  L,
  navLink,
  part,
  phone,
  primaryButton,
  readOnly,
  stateBadge,
  t,
  touchTarget,
  touchTargets,
  waitShown,
} from './style.js'

// --- the authoring shell --------------------------------------------------------

export const AdminSlots = Slots.define({
  root: part,
  /** The studio's sidebar: the brand, the sections, and who is signed in. */
  sidebar: part,
  brand: part,
  brandMark: part,
  nav: part,
  navLink: control,
  account: part,
  accountLabel: part,
  whoLink: control,
  /** A chair's name and role, beside its avatar: on a phone, the avatar alone shows. */
  whoName: part,
  whoRole: part,
  avatar: part,
  /** What the demo is and what to try, above the posts: a disclosure, open at first. */
  intro: part,
  /** A page's History and More, folded under the editor's bar until asked for. */
  manage: part,
  manageSummary: control,
  /** What the fold holds, said beside its name while there is room. */
  manageHint: part,
  manageCards: part,
  introSummary: control,
  introSteps: part,
  main: part,
  /** A section's screen: its heading, its filters, then what it lists. */
  screen: part,
  screenHead: part,
  screenTitle: part,
  filters: part,
  /** Which of a list's views is shown, as buttons that say whether they are pressed. */
  tabs: part,
  tab: control,
  searchBox: part,
  /** The editor's screen: a bar across the top, then the page and its settings. */
  editorScreen: part,
  editorBar: part,
  barActions: part,
  editorBody: part,
  /** Where a page is built, across the whole width. */
  workbench: part,
  canvas: part,
  aside: part,
  /** One group of settings in the aside. */
  card: part,
  cardTitle: part,
  /** A button with no box until it is pointed at: the bar's back and preview. */
  ghost: control,
  /** A post as a reader will see it, in the canvas while previewing. */
  preview: part,
  /** The history's revisions, newest first, on a line down to the first. */
  timeline: part,
  /** One published revision: its mark on the line, its words, and a way back to it. */
  revision: part,
  revisionMark: part,
  revisionBody: part,
  revisionTitle: part,
  /** On the newest revision while it is what the site shows. */
  revisionLive: part,
  revisionMeta: part,
  revisionRestore: control,
  toolbar: part,
  button: control,
  primary: control,
  danger: control,
  status: part,
  muted: part,
  /** A list of things to open, and each one's button. */
  list: part,
  listButton: control,
  /** An entry's state, such as Published. */
  badge: part,
  search: control,
})

export const AdminStyle = Style.forSlots(AdminSlots)(
  {
    root: Style.compose(
      Style.self({
        background: t.surface.base,
        color: t.text.default,
        display: 'grid',
        fontFamily: t.font.body,
        gridTemplateColumns: '15.5rem minmax(0, 1fr)',
        minHeight: '100vh',
      }),
      // The bar as tall as it is, and the section the rest: a short page does not stretch the bar.
      Style.media(phone, {
        gridTemplateColumns: 'minmax(0, 1fr)',
        gridTemplateRows: 'auto minmax(0, 1fr)',
      }),
    ),
    sidebar: Style.compose(
      Style.self({
        background: t.surface.subtle,
        borderInlineEnd: `1px solid ${t.outline.subtle}`,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: t.space.lg,
        height: '100vh',
        padding: `${t.space.lg} ${t.space.sm}`,
        position: 'sticky',
        top: '0',
      }),
      // On a phone, a bar across the top: the brand and who is looking, then the
      // sections in a row of their own, scrolled sideways where they do not fit.
      Style.media(phone, {
        alignItems: 'center',
        borderBlockEnd: `1px solid ${t.outline.subtle}`,
        borderInlineEnd: '0',
        display: 'grid',
        gap: t.space.xs,
        gridTemplateAreas: '"brand account" "nav nav"',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        height: 'auto',
        padding: `${t.space.sm} ${t.space.md}`,
        position: 'static',
      }),
    ),
    brand: Style.compose(
      Style.media(phone, { gridArea: 'brand' }),
      touchTarget,
      Style.self({
        alignItems: 'center',
        color: t.text.overt,
        display: 'flex',
        fontSize: t.size.md,
        fontWeight: t.weight.bold,
        gap: t.space.xs,
        letterSpacing: '-0.01em',
        padding: `0 ${t.space['2xs']}`,
        textDecoration: 'none',
      }),
    ),
    brandMark: Style.self({
      alignItems: 'center',
      background: `linear-gradient(135deg, ${t.accent.default}, color-mix(in oklch, ${t.accent.default} 50%, ${t.tertiary.default}))`,
      borderRadius: t.radius.md,
      color: t.accent['on-fill'],
      display: 'inline-flex',
      fontSize: t.size.sm,
      height: '1.75rem',
      justifyContent: 'center',
      width: '1.75rem',
    }),
    nav: Style.compose(
      Style.self({ display: 'flex', flexDirection: 'column', gap: '2px' }),
      Style.media(phone, {
        flexDirection: 'row',
        gridArea: 'nav',
        marginInline: `calc(-1 * ${t.space.md})`,
        overflowX: 'auto',
        paddingInline: t.space.md,
        scrollbarWidth: 'none',
      }),
    ),
    navLink,
    account: Style.compose(
      Style.self({
        borderBlockStart: `1px solid ${t.outline.subtle}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        marginBlockStart: 'auto',
        paddingBlockStart: t.space.sm,
      }),
      Style.media(phone, {
        border: '0',
        flexDirection: 'row',
        gridArea: 'account',
        justifySelf: 'end',
        marginBlockStart: '0',
        paddingBlockStart: '0',
      }),
    ),
    accountLabel: Style.compose(
      Style.media(phone, { display: 'none' }),
      Style.self({
        color: t.text.muted,
        fontSize: t.size.xs,
        fontWeight: t.weight.semibold,
        letterSpacing: '0.05em',
        margin: `0 0 ${t.space['3xs']}`,
        padding: `0 ${t.space['2xs']}`,
        textTransform: 'uppercase',
      }),
    ),
    whoLink: Style.compose(
      navLink,
      Style.self({ padding: '0.35rem 0.5rem' }),
      Style.media(phone, { justifyContent: 'center', padding: '0.3rem' }),
    ),
    // Read on a phone, not shown: the avatar stands for the chair.
    whoName: Style.media(phone, readOnly),
    whoRole: Style.compose(
      Style.self({
        color: t.text.muted,
        display: 'inline-flex',
        fontSize: t.size.xs,
        fontWeight: t.weight.normal,
        marginInlineStart: 'auto',
      }),
      Style.media(phone, readOnly),
    ),
    avatar: Style.compose(
      Style.self({
        alignItems: 'center',
        background: t.surface.muted,
        borderRadius: t.radius.full,
        boxShadow: `inset 0 0 0 1px ${t.outline.default}`,
        color: t.text.default,
        display: 'inline-flex',
        fontSize: t.size.xs,
        fontWeight: t.weight.bold,
        height: '1.5rem',
        justifyContent: 'center',
        width: '1.5rem',
      }),
      Style.nest('&[data-chair="wren"]', {
        background: t.accent.default,
        boxShadow: 'none',
        color: t.accent['on-fill'],
      }),
      Style.nest('&[data-chair="edda"]', {
        background: t.tertiary.default,
        boxShadow: 'none',
        color: t.tertiary['on-fill'],
      }),
    ),
    main: Style.compose(Style.self({ minWidth: '0' }), touchTargets),
    // A card whose header is its summary: one even row closed, and open, the
    // row over a divider and the words below it.
    intro: Style.compose(
      Style.self({
        background: `color-mix(in oklch, ${t.accent.default} 6%, ${t.surface.base})`,
        border: `1px solid color-mix(in oklch, ${t.accent.default} 22%, ${t.surface.base})`,
        borderRadius: t.radius.lg,
        color: t.text.default,
        fontSize: t.size.sm,
        lineHeight: '1.6',
        overflow: 'hidden',
      }),
      chevronOpen,
      Style.nest('&[open] > summary', {
        borderBlockEnd: `1px solid color-mix(in oklch, ${t.accent.default} 18%, ${t.surface.base})`,
      }),
      Style.nest('& > :not(summary)', { margin: '0', paddingInline: t.space.lg }),
      // The steps' numbers sit in the indent, so the list is set in by their width too.
      Style.nest('& > ol', { paddingInlineStart: `calc(${t.space.lg} + 1.25rem)` }),
      Style.nest('& > summary + *', { paddingBlockStart: t.space.md }),
      Style.nest('& > :not(summary) + :not(summary)', { marginBlockStart: t.space.sm }),
      Style.nest('& > :last-child:not(summary)', { paddingBlockEnd: t.space.md }),
      Style.nest('& a', { color: t.accent.ink, fontWeight: t.weight.medium }),
      Style.at(
        `@media ${phone}`,
        Style.compose(
          Style.nest('& > :not(summary)', { paddingInline: t.space.md }),
          Style.nest('& > ol', { paddingInlineStart: `calc(${t.space.md} + 1.25rem)` }),
        ),
      ),
    ),
    introSummary: Style.compose(
      chevron,
      Style.self({
        color: t.text.overt,
        fontSize: t.size.md,
        fontWeight: t.weight.semibold,
        gap: t.space.xs,
        padding: `${t.space.sm} ${t.space.lg}`,
      }),
      Style.nest('&::before', { color: t.accent.ink }),
      Style.pseudo(':hover', {
        background: `color-mix(in oklch, ${t.accent.default} 10%, ${t.surface.base})`,
      }),
      Style.pseudo(':focus-visible', {
        outline: `2px solid ${t.accent.default}`,
        outlineOffset: '-2px',
      }),
      Style.media(phone, { paddingInline: t.space.md }),
      touchTarget,
    ),
    manage: Style.compose(
      Style.self({ borderBlockEnd: `1px solid ${t.outline.subtle}`, fontSize: t.size.sm }),
      chevronOpen,
      Style.nest('&[open]', { background: t.surface.subtle }),
      Style.nest('&[open] > summary', { color: t.text.overt }),
    ),
    // The whole row is the control: a hover and a focus ring across it.
    manageSummary: Style.compose(
      chevron,
      Style.self({
        color: t.text.default,
        fontWeight: t.weight.semibold,
        gap: t.space.xs,
        minHeight: '2.5rem',
        padding: `0 ${t.space.lg}`,
      }),
      Style.nest('&::before', { color: t.text.muted }),
      Style.pseudo(':hover', { background: t.surface.muted, color: t.text.overt }),
      Style.pseudo(':focus-visible', {
        outline: `2px solid ${t.accent.default}`,
        outlineOffset: '-2px',
      }),
      Style.media(phone, { paddingInline: t.space.md }),
      touchTarget,
    ),
    manageHint: Style.compose(
      Style.self({ color: t.text.muted, fontWeight: t.weight.normal }),
      Style.media(phone, { display: 'none' }),
    ),
    manageCards: Style.compose(
      Style.self({
        display: 'grid',
        gap: t.space.md,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))',
        padding: `${t.space.xs} ${t.space.lg} ${t.space.md}`,
      }),
      Style.media(phone, { paddingInline: t.space.md }),
    ),
    // Numbered steps, the numbers in the accent; the intro sets the list in.
    introSteps: Style.compose(
      Style.self({ display: 'grid', gap: t.space['2xs'] }),
      Style.nest('& > li::marker', { color: t.accent.ink, fontWeight: t.weight.semibold }),
    ),
    screen: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.lg })),
      Style.self({
        boxSizing: 'border-box',
        margin: '0 auto',
        maxWidth: '64rem',
        padding: `${t.space['2xl']} ${t.space.xl}`,
      }),
      Style.media(phone, { padding: `${t.space.lg} ${t.space.md}` }),
      // A lone link or button in the column is as wide as its words, not the column.
      Style.nest('> a', { alignSelf: 'flex-start' }),
    ),
    screenHead: L.in(
      'layouts',
      Layout.cluster({ gap: t.space.md, justify: 'space-between', align: 'end' }),
    ),
    screenTitle: Style.self({
      color: t.text.overt,
      fontSize: t.size['3xl'],
      fontWeight: t.weight.bold,
      letterSpacing: '-0.025em',
      margin: '0',
    }),
    filters: Style.compose(
      L.in(
        'layouts',
        Layout.cluster({ gap: t.space.sm, justify: 'space-between', align: 'center' }),
      ),
      Style.self({
        borderBlockEnd: `1px solid ${t.outline.subtle}`,
        paddingBlockEnd: t.space.sm,
      }),
    ),
    tabs: Style.self({ display: 'flex', gap: t.space['3xs'] }),
    tab: Style.compose(
      Style.self({
        background: 'transparent',
        border: '0',
        borderRadius: t.radius.md,
        color: t.text.muted,
        cursor: 'pointer',
        font: 'inherit',
        fontSize: t.size.sm,
        fontWeight: t.weight.medium,
        padding: '0.4rem 0.75rem',
      }),
      Style.pseudo(':hover', { color: t.text.overt }),
      Style.nest('&[aria-pressed="true"]', {
        background: t.surface.muted,
        color: t.text.overt,
        cursor: 'default',
        fontWeight: t.weight.semibold,
      }),
    ),
    searchBox: Style.compose(
      Style.self({
        alignItems: 'center',
        color: t.text.muted,
        display: 'flex',
        gap: t.space['2xs'],
        minWidth: '14rem',
        position: 'relative',
      }),
      Style.media(phone, { flex: '1 1 100%', minWidth: '0' }),
      Style.nest('> svg', { insetInlineStart: '0.7rem', position: 'absolute' }),
    ),
    editorScreen: Style.self({ display: 'flex', flexDirection: 'column', minHeight: '100vh' }),
    editorBar: Style.compose(
      Style.self({
        alignItems: 'center',
        background: `color-mix(in oklch, ${t.surface.base} 88%, transparent)`,
        backdropFilter: 'blur(8px)',
        borderBlockEnd: `1px solid ${t.outline.subtle}`,
        display: 'flex',
        gap: t.space.sm,
        padding: `${t.space.sm} ${t.space.lg}`,
        position: 'sticky',
        top: '0',
        zIndex: '5',
      }),
      // Its actions go under the status where the bar is too narrow for both.
      Style.media(phone, {
        flexWrap: 'wrap',
        gap: t.space.xs,
        padding: `${t.space.xs} ${t.space.md}`,
      }),
      Style.nest('& a, & button', { whiteSpace: 'nowrap' }),
    ),
    barActions: Style.self({
      alignItems: 'center',
      display: 'flex',
      gap: t.space.xs,
      marginInlineStart: 'auto',
    }),
    editorBody: Style.compose(
      Style.self({
        alignItems: 'start',
        display: 'grid',
        flex: '1',
        gridTemplateColumns: 'minmax(0, 1fr) 20rem',
      }),
      Style.media('(max-width: 64rem)', { gridTemplateColumns: 'minmax(0, 1fr)' }),
    ),
    workbench: Style.compose(
      Style.self({ padding: t.space.lg }),
      Style.media(phone, { padding: t.space.sm }),
    ),
    canvas: Style.self({
      boxSizing: 'border-box',
      margin: '0 auto',
      maxWidth: '46rem',
      padding: `${t.space['2xl']} ${t.space.xl} ${t.space['3xl']}`,
      width: '100%',
    }),
    aside: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.md })),
      Style.self({
        alignSelf: 'stretch',
        background: t.surface.subtle,
        borderInlineStart: `1px solid ${t.outline.subtle}`,
        boxSizing: 'border-box',
        padding: t.space.lg,
      }),
    ),
    card: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.xs })),
      Style.self({
        background: t.surface.base,
        border: `1px solid ${t.outline.subtle}`,
        borderRadius: t.radius.lg,
        padding: t.space.md,
      }),
    ),
    cardTitle: Style.self({
      color: t.text.muted,
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      letterSpacing: '0.05em',
      margin: '0',
      textTransform: 'uppercase',
    }),
    ghost: Style.compose(
      Style.self({
        alignItems: 'center',
        background: 'transparent',
        border: '0',
        borderRadius: t.radius.md,
        color: t.text.default,
        cursor: 'pointer',
        display: 'inline-flex',
        font: 'inherit',
        fontSize: t.size.sm,
        fontWeight: t.weight.medium,
        gap: t.space['2xs'],
        padding: '0.45rem 0.65rem',
        textDecoration: 'none',
      }),
      Style.pseudo(':hover', { background: t.surface.muted, color: t.text.overt }),
      Style.nest('&[aria-pressed="true"]', { background: t.surface.muted, color: t.text.overt }),
    ),
    timeline: Style.self({ display: 'grid', listStyle: 'none', margin: '0', padding: '0' }),
    revision: Style.compose(
      Style.self({
        alignItems: 'start',
        columnGap: t.space.sm,
        display: 'grid',
        gridTemplateColumns: '0.75rem minmax(0, 1fr) auto',
        paddingBlock: t.space.xs,
        position: 'relative',
      }),
      // The line from each mark down to the next; the oldest ends it.
      Style.nest('&::before', {
        background: t.outline.subtle,
        bottom: `calc(-1 * ${t.space.xs})`,
        content: '""',
        insetInlineStart: 'calc(0.375rem - 1px)',
        position: 'absolute',
        top: `calc(${t.space.xs} + 1.1rem)`,
        width: '2px',
      }),
      Style.nest('&:last-child::before', { display: 'none' }),
      Style.nest('&[data-live] > :first-child', {
        background: t.success.default,
        borderColor: t.success.default,
        boxShadow: `0 0 0 3px color-mix(in oklch, ${t.success.default} 22%, transparent)`,
      }),
    ),
    revisionMark: Style.self({
      background: t.surface.base,
      border: `2px solid ${t.outline.default}`,
      borderRadius: t.radius.full,
      boxSizing: 'border-box',
      height: '0.75rem',
      marginBlockStart: '0.3rem',
      position: 'relative',
      width: '0.75rem',
    }),
    revisionBody: Style.self({ display: 'grid', gap: '0.1rem', minWidth: '0' }),
    revisionTitle: Style.self({
      alignItems: 'center',
      color: t.text.overt,
      display: 'flex',
      fontSize: t.size.sm,
      fontWeight: t.weight.semibold,
      gap: t.space['2xs'],
      margin: '0',
    }),
    revisionLive: Style.self({
      background: `color-mix(in oklch, ${t.success.default} 14%, ${t.surface.base})`,
      borderRadius: t.radius.full,
      color: t.success.ink,
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      padding: '0 0.45rem',
    }),
    revisionMeta: Style.self({
      color: t.text.muted,
      fontSize: t.size.xs,
      margin: '0',
    }),
    revisionRestore: Style.compose(
      Style.self({
        background: 'transparent',
        border: `1px solid ${t.outline.subtle}`,
        borderRadius: t.radius.md,
        color: t.text.default,
        cursor: 'pointer',
        font: 'inherit',
        fontSize: t.size.xs,
        fontWeight: t.weight.medium,
        padding: '0.25rem 0.6rem',
      }),
      Style.pseudo(':hover', {
        background: t.surface.muted,
        borderColor: t.outline.default,
        color: t.text.overt,
      }),
      Style.pseudo(':focus-visible', {
        outline: `2px solid ${t.accent.default}`,
        outlineOffset: '2px',
      }),
      touchTarget,
    ),
    preview: Style.self({ paddingBlockEnd: t.space['2xl'] }),
    toolbar: L.in('layouts', Layout.cluster({ gap: t.space.xs, align: 'center' })),
    button: button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
    primary: primaryButton,
    danger: button({ tone: 'danger', variant: 'outline', size: 'sm' }),
    status: Style.compose(
      Style.self({
        color: t.text.muted,
        fontSize: t.size.sm,
        margin: '0',
        minWidth: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }),
      Style.nest('&[data-tone="error"]', { color: t.error.ink }),
      waitShown,
    ),
    muted: Style.compose(Style.self({ color: t.text.muted, margin: '0' }), waitShown),
    list: Style.compose(
      Style.self({
        border: `1px solid ${t.outline.subtle}`,
        borderRadius: t.radius.lg,
        listStyle: 'none',
        margin: '0',
        overflow: 'hidden',
        padding: '0',
      }),
      Style.nest('> li + li', { borderBlockStart: `1px solid ${t.outline.subtle}` }),
    ),
    listButton: Style.compose(
      Style.self({
        alignItems: 'center',
        background: t.surface.base,
        border: '0',
        color: t.text.overt,
        cursor: 'pointer',
        display: 'flex',
        font: 'inherit',
        fontSize: t.size.md,
        fontWeight: t.weight.semibold,
        gap: t.space.sm,
        padding: `${t.space.md} ${t.space.lg}`,
        textAlign: 'start',
        width: '100%',
      }),
      Style.nest('> svg', { color: t.text.muted }),
      // The state sits at the row's end.
      Style.nest('> :last-child', { marginInlineStart: 'auto' }),
      Style.pseudo(':hover', { background: t.surface.subtle }),
    ),
    badge: stateBadge('data-state'),
    search: Style.compose(field, Style.self({ paddingInlineStart: '2.1rem' })),
  },
  { name: 'AdminStyle', layer: app },
)

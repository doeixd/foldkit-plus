/**
 * The page Builder's look: its panels, tiles, inspector and viewport switch.
 */
import { Style } from 'foldkit-mixins'
import { BuilderSlots } from 'foldkit-mixins-builder'
import { FieldSlots, FormSlots } from 'foldkit-mixins-form'
import { Icons, Recipes } from 'foldkit-mixins-ui'
import { Layout } from 'foldkit-mixins/layout'
import { iconUrl, type IconName } from '../views/icons.js'
import { app, button, control, field, L, t, visuallyHidden } from './style.js'

/** A panel of the Builder's: a white card on the editor's grey, scrolling on its own. */
const builderPanel = Style.self({
  background: t.surface.base,
  border: `1px solid ${t.outline.subtle}`,
  borderRadius: t.radius.lg,
  boxSizing: 'border-box',
  minHeight: '0',
  overflow: 'auto',
  padding: t.space.sm,
})

/** A panel's name above it: its `aria-label` says the same to assistive technology. */
const panelName = (name: string) =>
  Style.nest('&::before', {
    color: t.text.muted,
    content: `"${name}"`,
    display: 'block',
    fontSize: t.size.xs,
    fontWeight: t.weight.semibold,
    gridColumn: '1 / -1',
    letterSpacing: '0.05em',
    marginBlockEnd: t.space.xs,
    textTransform: 'uppercase',
  })

/** A small heading inside a panel. */
const smallCaps = Style.self({
  color: t.text.muted,
  fontSize: '0.68rem',
  fontWeight: t.weight.semibold,
  letterSpacing: '0.06em',
  margin: '0',
  textTransform: 'uppercase',
})

/** Sets `--icon` by an attribute's value, resolving each name to its drawing. */
const iconsBy = (attribute: string, names: Readonly<Record<string, IconName>>) =>
  Icons.byAttribute(
    attribute,
    Object.fromEntries(Object.entries(names).map(([value, name]) => [value, iconUrl(name)])),
  )

const blockIcons = iconsBy('data-block', {
  Hero: 'hero',
  Section: 'section',
  Columns: 'columns',
  Divider: 'divider',
  Heading: 'heading',
  Text: 'text',
  Quote: 'quote',
  Callout: 'callout',
  Image: 'image',
  Button: 'button',
  PostList: 'list',
  FeaturedPost: 'star',
  LatestPages: 'files',
})

/** A square button showing only its icon, backed by the recipe. */
const iconButton = Style.compose(
  button({ tone: 'neutral', variant: 'icon', size: null }),
  Icons.glyph('1rem'),
)

/** Where the selection is marked on the page: a blue that shows on the site's colors. */
const selection = 'oklch(62% 0.19 255)'

/**
 * The Builder, as a page builder's three columns filling the screen: the
 * blocks to add over the page's layers on the left; the page in the middle,
 * under a bar with undo, where the selection is, and the viewport; the
 * selected block's settings on the right. Each column scrolls on its own. The
 * Builder draws its parts in one order, so each is placed on the grid by its
 * Slot. The canvas marks the selection, the hovered node and where a drop
 * would land on the element inside each node's wrapper, since a wrapper is
 * `display: contents` and draws nothing.
 */
// The inspector's fields, whether the Builder draws them (a look, a condition) or a
// Block's settings form does (a prop): a label over its control, both small.
const inspectorField = L.in('layouts', Layout.stack({ gap: '0.3rem' }))
const inspectorLabel = Style.self({
  color: t.text.default,
  fontSize: t.size.xs,
  fontWeight: t.weight.medium,
})
const inspectorControl = Style.compose(
  field,
  Style.self({ fontSize: t.size.sm, padding: '0.4rem 0.55rem' }),
)

/** A Block's props in the inspector, drawn by its settings form: as the inspector's own fields. */
export const InspectorFieldStyle = Style.forSlots(FieldSlots)(
  {
    root: inspectorField,
    label: inspectorLabel,
    description: Style.self({ color: t.text.muted, fontSize: t.size.xs, margin: '0' }),
    error: Style.self({ color: t.error.ink, fontSize: t.size.xs, margin: '0' }),
    text: inspectorControl,
    multiline: inspectorControl,
    number: inspectorControl,
    select: inspectorControl,
  },
  { name: 'InspectorFieldStyle', layer: app },
)

/** The settings form around those fields: spaced as the inspector's sections are. */
export const InspectorFormStyle = Style.forSlots(FormSlots)(
  { root: L.in('layouts', Layout.stack({ gap: t.space.sm })) },
  { name: 'InspectorFormStyle', layer: app },
)

/**
 * The Builder's own width below which it stacks and shows one panel at a time,
 * chosen by tabs (`BuilderView.narrow`). One width for both: stacked without
 * the tabs, every panel stood above the page and pushed it out of view.
 */
export const narrowWidth = '64rem'
const narrowBuilder = `builder (max-width: ${narrowWidth})`

export const BuilderStyle = Style.forSlots(BuilderSlots)(
  {
    // Laid out by the editor's own width (`builder`), so a narrow editor stacks in a wide window.
    regions: Style.compose(
      Style.self({
        columnGap: t.space.md,
        display: 'grid',
        // The palette and the layers, the page under its bar, then the inspector.
        gridTemplateAreas: '"start bar end" "start stage end"',
        gridTemplateColumns: '15.5rem minmax(0, 1fr) 19rem',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        height: 'calc(100vh - 12.75rem)',
        minHeight: '34rem',
        position: 'relative',
      }),
      Style.container(narrowBuilder, {
        gridTemplateAreas: 'none',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gridTemplateRows: 'none',
        height: 'auto',
        rowGap: t.space.sm,
      }),
    ),
    start: Style.compose(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        gap: t.space.sm,
        gridArea: 'start',
        minHeight: '0',
      }),
      // Narrow, the panel a tab shows sits under the tabs, before the page: the
      // inspector too, which is drawn after the page.
      Style.container(narrowBuilder, { gridArea: 'auto', order: '1' }),
    ),
    bar: Style.compose(
      Style.self({ alignItems: 'center', display: 'flex', gap: t.space.md, gridArea: 'bar' }),
      Style.container(narrowBuilder, {
        flexWrap: 'wrap',
        gridArea: 'auto',
        order: '3',
      }),
    ),
    // The alert lies over the top of the page, in the same cell.
    stage: Style.compose(
      Style.self({ display: 'grid', gridArea: 'stage', minHeight: '0' }),
      Style.container(narrowBuilder, { gridArea: 'auto', order: '4' }),
    ),
    end: Style.compose(
      Style.self({ display: 'flex', flexDirection: 'column', gridArea: 'end', minHeight: '0' }),
      Style.container(narrowBuilder, { gridArea: 'auto', order: '2' }),
    ),
    palette: Style.compose(
      builderPanel,
      panelName('Add a block'),
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      Style.self({ flexShrink: '0', maxHeight: '26rem' }),
      // On a phone the page comes into view under it; the tiles scroll within.
      Style.container(narrowBuilder, { maxHeight: '40vh' }),
    ),
    paletteGroup: Style.self({
      display: 'grid',
      gap: '0.3rem',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    }),
    paletteHeading: Style.compose(smallCaps, Style.self({ gridColumn: '1 / -1' })),
    paletteItem: Style.compose(
      blockIcons,
      // A pattern's tile: any pattern, since the Catalog may hold more than one.
      Style.nest('&[data-pattern]', { '--icon': iconUrl('pattern') }),
      Style.self({
        alignItems: 'center',
        background: t.surface.subtle,
        border: `1px solid ${t.outline.subtle}`,
        borderRadius: t.radius.md,
        color: t.text.default,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        font: 'inherit',
        gap: '0.35rem',
        padding: '0.6rem 0.2rem 0.5rem',
        transition: 'background 120ms ease, border-color 120ms ease',
      }),
      Icons.glyph('1.15rem'),
      Style.pseudo(':hover:not(:disabled, [aria-disabled="true"])', {
        background: t.accent.subtle,
        borderColor: t.accent.default,
        color: t.accent.ink,
      }),
      Style.pseudo(':is(:disabled, [aria-disabled="true"])', {
        cursor: 'not-allowed',
        opacity: '0.4',
      }),
    ),
    paletteLabel: Style.self({
      fontSize: '0.7rem',
      fontWeight: t.weight.medium,
      lineHeight: '1.2',
      textAlign: 'center',
    }),
    // The tile has room for a name; what it is for is its title's to say, and is read.
    paletteHint: visuallyHidden,
    layers: Style.compose(
      builderPanel,
      panelName('Layers'),
      Style.self({ flex: '1', minHeight: '0' }),
      Style.container(narrowBuilder, { maxHeight: '40vh' }),
    ),
    tree: Style.self({ listStyle: 'none', margin: '0', padding: '0' }),
    row: Style.compose(
      blockIcons,
      Style.self({
        alignItems: 'center',
        borderRadius: t.radius.sm,
        cursor: 'pointer',
        // A drag begun on a row moves the row, not a selection of every row's text.
        userSelect: 'none',
        display: 'flex',
        fontSize: t.size.sm,
        gap: '0.35rem',
        padding: '0.3rem 0.4rem',
        // TreeNavigation writes each row's depth, 1 at the top.
        paddingInlineStart: 'calc(0.4rem + (var(--fk-tree-level) - 1) * 1rem)',
      }),
      // A row with nothing to open is set in by the width of the toggle it lacks.
      Style.nest('&:not([aria-expanded])', {
        paddingInlineStart: 'calc(1.5rem + (var(--fk-tree-level) - 1) * 1rem)',
      }),
      Style.pseudo(':hover', { background: t.surface.muted }),
      Style.pseudo(':focus-visible', { outline: `2px solid ${t.accent.default}` }),
      Style.nest('&[aria-selected="true"]', { background: t.accent.subtle, color: t.accent.ink }),
      Style.nest('&[data-builder-dragging]', { opacity: '0.5' }),
      Style.nest('&[data-builder-drop="inside"]', {
        boxShadow: `inset 0 0 0 2px ${t.accent.default}`,
      }),
      Style.nest('&[data-builder-drop="before"]', {
        boxShadow: `inset 0 2px 0 ${t.accent.default}`,
      }),
      Style.nest('&[data-builder-drop="after"]', {
        boxShadow: `inset 0 -2px 0 ${t.accent.default}`,
      }),
    ),
    rowToggle: Style.compose(
      Style.self({
        '--icon': iconUrl('chevron'),
        alignItems: 'center',
        color: t.text.muted,
        display: 'inline-flex',
        height: '1rem',
        justifyContent: 'center',
        width: '1rem',
      }),
      Icons.glyph('0.8rem'),
      Style.nest('&::before', { transition: 'transform 120ms ease' }),
      Style.nest('[aria-expanded="true"] > &::before', { transform: 'rotate(90deg)' }),
    ),
    rowLabel: Style.compose(
      Style.self({
        alignItems: 'center',
        display: 'inline-flex',
        flexShrink: '0',
        fontWeight: t.weight.medium,
        gap: '0.4rem',
      }),
      Icons.glyph('0.9rem'),
    ),
    rowSummary: Style.self({
      color: t.text.muted,
      fontSize: t.size.xs,
      minWidth: '0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
    inspector: Style.compose(
      builderPanel,
      L.in('layouts', Layout.stack({ gap: t.space.md })),
      Style.self({ flex: '1', minHeight: '0', padding: t.space.md }),
      Style.container(narrowBuilder, { maxHeight: '50vh' }),
    ),
    inspectorHead: L.in('layouts', Layout.stack({ gap: '0.3rem' })),
    inspectorTitle: Style.self({
      color: t.text.overt,
      fontSize: t.size.md,
      fontWeight: t.weight.semibold,
      margin: '0',
    }),
    inspectorHint: Style.self({ color: t.text.muted, fontSize: t.size.sm, margin: '0' }),
    actions: Style.compose(
      Style.self({
        borderBlock: `1px solid ${t.outline.subtle}`,
        display: 'flex',
        gap: '2px',
        justifyContent: 'space-between',
        marginBlockStart: t.space.xs,
        paddingBlock: '0.25rem',
      }),
    ),
    action: Style.compose(
      iconButton,
      iconsBy('data-action', {
        'move-up': 'up',
        'move-down': 'down',
        'move-out': 'outdent',
        'move-in': 'indent',
        duplicate: 'copy',
        copy: 'clipboard',
        cut: 'scissors',
        delete: 'trash',
      }),
      Style.nest('&[data-action="delete"]:hover:not(:disabled, [aria-disabled="true"])', {
        background: t.error.subtle,
        color: t.error.ink,
      }),
    ),
    inspectorSection: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      Style.nest('& + &', {
        borderBlockStart: `1px solid ${t.outline.subtle}`,
        paddingBlockStart: t.space.md,
      }),
    ),
    inspectorSectionTitle: smallCaps,
    field: inspectorField,
    label: inspectorLabel,
    control: inspectorControl,
    option: Style.self({
      alignItems: 'center',
      display: 'flex',
      fontSize: t.size.sm,
      gap: t.space['2xs'],
    }),
    choices: Style.compose(
      Recipes.Segmented({ tray: 'tray' }).group ?? Style.empty,
      Style.self({ display: 'flex' }),
    ),
    choice: Style.compose(
      Recipes.Segmented({ size: 'xs' }).option ?? Style.empty,
      Style.self({ flex: '1' }),
    ),
    shortcuts: Style.self({
      alignItems: 'baseline',
      columnGap: t.space.sm,
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      margin: '0',
      rowGap: '0.45rem',
    }),
    shortcutKeys: Style.self({
      background: t.surface.subtle,
      border: `1px solid ${t.outline.default}`,
      borderBottomWidth: '2px',
      borderRadius: t.radius.sm,
      fontFamily: t.font.mono,
      fontSize: '0.68rem',
      justifySelf: 'start',
      padding: '0.05rem 0.35rem',
      whiteSpace: 'nowrap',
    }),
    shortcutWhat: Style.self({ color: t.text.muted, fontSize: t.size.xs, margin: '0' }),
    toolbar: Style.self({ display: 'flex', gap: '2px' }),
    toolbarAction: Style.compose(
      iconButton,
      iconsBy('data-action', { undo: 'undo', redo: 'redo', paste: 'paste' }),
    ),
    // Each crumb whole, never squeezed into its neighbour: a trail longer than the
    // bar scrolls sideways, and a narrow editor gives it a row of its own.
    crumbs: Style.compose(
      Style.self({
        alignItems: 'center',
        display: 'flex',
        flex: '1',
        minWidth: '0',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }),
      Style.container('builder (max-width: 40rem)', { flexBasis: '100%', order: '1' }),
    ),
    // Bespoke: a breadcrumb segment with "/" separators, not a standalone action.
    crumb: Style.compose(
      Style.self({
        background: 'transparent',
        border: '0',
        borderRadius: t.radius.sm,
        color: t.text.muted,
        cursor: 'pointer',
        font: 'inherit',
        flexShrink: '0',
        fontSize: t.size.sm,
        minHeight: '2rem',
        padding: '0.25rem 0.4rem',
        whiteSpace: 'nowrap',
      }),
      // A finger is wider than a pointer: a target it can hit.
      // Not Touch.target: that also sets a min-width, which would stretch short crumbs.
      Style.media('(pointer: coarse)', { minHeight: '2.75rem' }),
      Style.pseudo(':hover', { background: t.surface.muted, color: t.text.overt }),
      Style.nest('& + &::before', {
        color: t.text.subtle,
        content: '"/"',
        marginInlineEnd: '0.5rem',
      }),
      Style.nest('&[aria-current]', { color: t.text.overt, fontWeight: t.weight.semibold }),
    ),
    viewports: Style.compose(
      Recipes.Segmented({ tray: 'tray' }).group ?? Style.empty,
      Style.self({ display: 'flex' }),
    ),
    // The narrow editor's tabs, a segmented control like the viewports. Their `display`
    // is the Builder's: hidden while the editor is wide.
    panelTabs: Recipes.Segmented({ tray: 'tray' }).group ?? Style.empty,
    panelTab: Style.compose(
      Recipes.Segmented({ size: 'sm' }).option ?? Style.empty,
      Style.self({ flex: '1' }),
    ),
    viewport: Style.compose(
      iconButton,
      iconsBy('data-viewport', { wide: 'monitor', medium: 'tablet', narrow: 'phone' }),
      Style.self({ height: '1.75rem', width: '2.25rem' }),
    ),
    alert: Style.compose(
      Style.self({
        background: t.error.subtle,
        borderRadius: t.radius.md,
        color: t.error.ink,
        fontSize: t.size.sm,
        // Over the top of the page, as a notice: it comes and goes without moving the page.
        alignSelf: 'start',
        boxShadow: '0 4px 12px rgb(0 0 0 / 12%)',
        gridArea: '1 / 1',
        margin: `${t.space.md} ${t.space.lg} 0`,
        padding: `${t.space.xs} ${t.space.sm}`,
        zIndex: '1',
      }),
    ),
    canvas: Style.compose(
      Style.self({
        background: `radial-gradient(${t.outline.default} 1px, transparent 1px) 0 0 / 16px 16px, ${t.surface.subtle}`,
        border: `1px solid ${t.outline.subtle}`,
        borderRadius: t.radius.lg,
        boxSizing: 'border-box',
        gridArea: '1 / 1',
        marginBlockStart: t.space.sm,
        minHeight: '0',
        overflow: 'auto',
        padding: t.space.lg,
      }),
      Style.pseudo(':focus-visible', { outline: `2px solid ${t.accent.default}` }),
      Style.container(narrowBuilder, { minHeight: '30rem' }),
      Style.container('builder (max-width: 30rem)', { padding: t.space.xs }),
      Style.nest('[data-composition-drop="before"] > *', { boxShadow: `0 -3px 0 ${selection}` }),
      Style.nest('[data-composition-drop="after"] > *', { boxShadow: `0 3px 0 ${selection}` }),
      Style.nest('[data-composition-drop="inside"] > *', {
        outline: `2px dashed ${selection}`,
      }),
    ),
    // Drawn over the page by the Builder, where the selected and hovered nodes are.
    selectionBox: Style.self({
      outline: `2px solid ${selection}`,
      // Clear of the block's own edge, so its text never touches the line.
      outlineOffset: '4px',
      borderRadius: t.radius.sm,
    }),
    selectionLabel: Style.self({
      background: selection,
      borderRadius: `${t.radius.sm} ${t.radius.sm} 0 0`,
      color: 'white',
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      lineHeight: '1.6',
      marginBlockEnd: '3px',
      marginInlineStart: '-3px',
      paddingInline: '0.45rem',
      whiteSpace: 'nowrap',
    }),
    hoverBox: Style.self({ outline: `1px dashed ${selection}`, outlineOffset: '4px' }),
    frame: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.lg })),
      Style.self({
        background: t.surface.base,
        borderRadius: t.radius.md,
        boxShadow: '0 1px 2px rgb(0 0 0 / 6%), 0 12px 32px rgb(0 0 0 / 8%)',
        margin: '0 auto',
        minHeight: '100%',
        padding: t.space.md,
        transition: 'max-width 200ms ease',
      }),
      Style.container('builder (max-width: 30rem)', { padding: t.space.xs }),
    ),
    empty: Style.self({
      border: `2px dashed ${t.outline.default}`,
      borderRadius: t.radius.lg,
      color: t.text.muted,
      margin: '0',
      padding: `${t.space['2xl']} ${t.space.lg}`,
      textAlign: 'center',
    }),
    // The live region is read, not seen; hidden absolutely, it takes no cell of the grid.
    live: visuallyHidden,
  },
  { name: 'BuilderStyle', layer: app },
)

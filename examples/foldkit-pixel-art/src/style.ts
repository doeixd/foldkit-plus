/**
 * The editor's appearance, as `foldkit-mixins` data. The views publish the
 * Slots and draw the markup; everything it looks like lives here.
 *
 * Every slot style is compiled into the `app` layer, the last of
 * `Layers.standard`, so it overrides the recipes and the `Layout` pieces it
 * composes by layer order rather than by specificity.
 */
import {
  Capability,
  Layers,
  Slot,
  Slots,
  Style,
  type Declarations,
  type StyleValue,
} from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, DialogSlots, RadioGroupSlots, Recipes, SwitchSlots } from 'foldkit-mixins-ui'

import { THUMBNAIL_CELL_SIZE } from './constant.js'

const L = Layers.standard
const app = L.layer('app')

// THEME

/**
 * The recipes' palette, indigo as upstream's accent, read in its dark scheme;
 * and the page's own colors, the Tailwind shades upstream names, as `forge`
 * tokens on a `gray-900` page.
 */
const palette = Theme.compose(
  Theme.oklch({ accent: { h: 277, c: 0.262, l: '51.1%' }, surfaceSaturation: 0.03 }),
  Theme.define({
    forge: {
      page: 'oklch(21% 0.034 264.665)',
      raised: 'oklch(27.8% 0.033 256.848)',
      hover: 'oklch(37.3% 0.034 259.733)',
      text: 'oklch(96.7% 0.003 264.542)',
      soft: 'oklch(92.8% 0.006 264.531)',
      dim: 'oklch(87.2% 0.01 258.338)',
      muted: 'oklch(70.7% 0.022 261.325)',
      faint: 'oklch(55.1% 0.027 264.364)',
      accent: 'oklch(51.1% 0.262 276.966)',
      'on-accent': 'oklch(100% 0 0)',
      danger: 'oklch(57.7% 0.245 27.325)',
      'danger-hover': 'oklch(63.7% 0.237 25.331)',
      'danger-ink': 'oklch(70.4% 0.191 22.216)',
      backdrop: 'oklch(0% 0 0 / 60%)',
    },
  }),
)

const theme = Theme.compose(Theme.tokens, palette)

const t = Theme.ref(theme)

/** Upstream's `md:` breakpoint. */
const WIDE = '(min-width: 48rem)'

/** Upstream's `min-[480px]:` breakpoint. */
const TWO_COLUMNS = '(min-width: 30rem)'

const container = Slot.make({ capability: Capability.Container })

/** Tailwind's `text-sm` line height, which upstream's controls take. */
const TEXT_SM_LEADING = '1.25rem'

/** Upstream's `text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2`. */
const sectionLabel: StyleValue = Style.self({
  marginBottom: t.space.xs,
  fontSize: '10px',
  fontWeight: t.weight.semibold,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: t.forge.muted,
})

/** Upstream's `sr-only`: read aloud, not seen. */
const visuallyHidden: StyleValue = Style.self({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: '0',
})

/** A hover that skips a disabled control, as upstream's `hover:` sits beside `cursor-not-allowed`. */
const hover = (declarations: Declarations): StyleValue =>
  Style.pseudo(':hover:not([aria-disabled="true"], :disabled)', declarations)

/** Upstream's pressed-looking control: indigo when selected, `gray-800` otherwise. */
const choice = (selected: string): StyleValue =>
  Style.compose(
    Style.self({
      paddingBlock: '0.375rem',
      paddingInline: t.space.sm,
      border: '0',
      borderRadius: t.radius.sm,
      font: 'inherit',
      fontSize: t.size.sm,
      lineHeight: TEXT_SM_LEADING,
      background: t.forge.raised,
      color: t.forge.muted,
      cursor: 'pointer',
      transition: `background-color ${t.motion.fast}, color ${t.motion.fast}`,
    }),
    Style.pseudo(`:not(${selected}):hover`, { background: t.forge.hover, color: t.forge.soft }),
    Style.pseudo(selected, { background: t.forge.accent, color: t.forge['on-accent'] }),
  )

const icon: StyleValue = Style.self({ width: '1rem', height: '1rem', flexShrink: '0' })

// BUTTON

/**
 * Upstream's secondary button: `gray-200` text on `gray-800`, `gray-700`
 * under the pointer, faded when disabled. The recipe brings the focus ring
 * and the disabled treatment.
 */
const Secondary = Recipes.Button.extend({
  base: {
    button: Style.compose(
      Style.self({
        justifyContent: 'flex-start',
        gap: t.space.xs,
        paddingBlock: '0.375rem',
        paddingInline: t.space.sm,
        border: '0',
        borderRadius: t.radius.sm,
        fontSize: t.size.sm,
        fontWeight: t.weight.normal,
        lineHeight: TEXT_SM_LEADING,
        background: t.forge.raised,
        color: t.forge.soft,
      }),
      Style.pseudo(':is([aria-disabled="true"], :disabled)', { opacity: '0.4' }),
      hover({ background: t.forge.hover }),
    ),
  },
})

export const SecondaryButtonStyle = Style.forSlots(ButtonSlots)(Secondary({ tone: 'neutral' }), {
  name: 'SecondaryButtonStyle',
  layer: app,
})

/** Upstream's `w-full` secondary button: Clear Canvas. */
export const FullWidthButtonStyle = Style.forSlots(ButtonSlots)(
  Secondary.extend({ base: { button: Style.self({ width: '100%' }) } })({ tone: 'neutral' }),
  { name: 'FullWidthButtonStyle', layer: app },
)

/** Undo and Redo: full width, the shortcut pushed to the end. */
export const ShortcutButtonStyle = Style.forSlots(ButtonSlots)(
  Secondary.extend({
    base: { button: Style.self({ width: '100%', justifyContent: 'space-between' }) },
  })({ tone: 'neutral' }),
  { name: 'ShortcutButtonStyle', layer: app },
)

/** Upstream's `bg-red-600` "Clear and Resize". */
export const DangerButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: Style.compose(
        Style.self({
          flex: '1',
          paddingBlock: t.space.xs,
          paddingInline: t.space.md,
          border: '0',
          borderRadius: t.radius.sm,
          fontSize: t.size.sm,
          fontWeight: t.weight.normal,
          lineHeight: TEXT_SM_LEADING,
          background: t.forge.danger,
          color: t.forge['on-accent'],
        }),
        hover({ background: t.forge['danger-hover'] }),
      ),
    },
  })({ tone: 'danger' }),
  { name: 'DangerButtonStyle', layer: app },
)

// PAGE

export const PageSlots = Slots.define({
  page: container,
  header: container,
  brand: container,
  title: container,
  byline: container,
  link: container,
  separator: container,
  actions: container,
  icon: container,
  iconPath: container,
  buttonText: container,
  content: container,
})

export const PageStyle = Style.forSlots(PageSlots)(
  {
    page: Style.compose(
      L.in('layouts', Layout.stack({ gap: '0' })),
      Style.self({ minHeight: '100vh', background: t.forge.page, color: t.forge.text }),
    ),
    header: Style.self({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBlock: t.space.sm,
      paddingInline: t.space.md,
      borderBottom: `${t.border.thin} solid ${t.forge.raised}`,
    }),
    brand: Style.self({ display: 'flex', flexDirection: 'column' }),
    title: Style.self({
      margin: `0 0 ${t.space['2xs']}`,
      fontSize: t.size.lg,
      fontWeight: t.weight.bold,
      letterSpacing: '-0.025em',
      lineHeight: '1',
      color: t.forge.text,
    }),
    byline: Style.self({
      display: 'flex',
      alignItems: 'center',
      gap: t.space['2xs'],
      fontSize: t.size.xs,
      lineHeight: '1',
      color: t.forge.muted,
    }),
    link: Style.compose(
      Style.self({
        color: 'inherit',
        textDecoration: 'none',
        transition: `color ${t.motion.fast}`,
      }),
      Style.pseudo(':hover', { color: t.forge.soft }),
    ),
    actions: Style.self({ display: 'flex', alignItems: 'center', gap: t.space.md }),
    icon,
    // One column, two from 30rem with the canvas across both, and from 48rem
    // the tools, the canvas and the history side by side.
    content: Style.compose(
      Style.self({
        boxSizing: 'border-box',
        display: 'grid',
        flex: '1',
        gridTemplateColumns: '1fr',
        gap: t.space.lg,
        width: '100%',
        maxWidth: '64rem',
        marginInline: 'auto',
        padding: t.space.md,
      }),
      Style.media(TWO_COLUMNS, { gridTemplateColumns: 'repeat(2, 1fr)' }),
      Style.media(WIDE, {
        gridTemplateColumns: 'auto 1fr auto',
        justifyContent: 'center',
        alignItems: 'start',
        padding: t.space.lg,
      }),
    ),
  },
  { name: 'PageStyle', layer: app },
)

// TOOLBAR

export const ToolbarSlots = Slots.define({
  panel: container,
  section: container,
  label: container,
  toolGroup: container,
  shortcut: container,
  mirrorGroup: container,
  mirrorSwitch: container,
  sizeGroup: container,
  hex: container,
  paletteGroup: container,
  themePicker: container,
  themeButton: container,
  themeButtonContent: container,
  themeName: container,
  chevron: container,
  themeItems: container,
  themeOption: container,
  themeCheck: container,
  themeBackdrop: container,
  icon: container,
  iconPath: container,
  buttonText: container,
})

/** Upstream's `w-full md:w-44`. */
const sidePanel: StyleValue = Style.compose(
  Style.self({ display: 'flex', flexDirection: 'column', width: '100%', flexShrink: '0' }),
  Style.media(WIDE, { width: '11rem' }),
)

export const ToolbarStyle = Style.forSlots(ToolbarSlots)(
  {
    panel: Style.compose(sidePanel, Style.self({ gap: t.space.lg })),
    label: sectionLabel,
    toolGroup: L.in('layouts', Layout.stack({ gap: '0.375rem' })),
    shortcut: Style.self({ fontSize: t.size.xs, color: t.forge.muted }),
    mirrorGroup: Style.self({ display: 'flex', gap: t.space.xs }),
    mirrorSwitch: Style.self({ flex: '1' }),
    sizeGroup: Style.self({ display: 'flex', gap: t.space['2xs'] }),
    hex: Style.self({
      paddingBottom: t.space.sm,
      fontFamily: t.font.mono,
      fontSize: t.size.xs,
      color: t.forge.muted,
    }),
    paletteGroup: Style.self({
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '0.625rem',
    }),
    themePicker: Style.self({ position: 'relative', width: '100%', marginTop: t.space.sm }),
    themeButton: Style.compose(
      Style.self({
        width: '100%',
        paddingBlock: '0.375rem',
        paddingInline: t.space.sm,
        border: '0',
        borderRadius: t.radius.sm,
        font: 'inherit',
        fontSize: t.size.sm,
        background: t.forge.raised,
        color: t.forge.soft,
        cursor: 'pointer',
        transition: `background-color ${t.motion.fast}`,
      }),
      Style.pseudo(':hover', { background: t.forge.hover }),
    ),
    themeButtonContent: Style.self({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
    }),
    chevron: Style.compose(icon, Style.self({ color: t.forge.muted })),
    // `@foldkit/ui` Listbox takes only a class name per option, so the
    // options are styled from their container, by the role and the
    // `data-selected` and `data-active` the component writes.
    themeItems: Style.compose(
      Style.self({
        width: 'var(--button-width)',
        overflow: 'hidden',
        zIndex: '10',
        border: `${t.border.thin} solid ${t.forge.hover}`,
        borderRadius: t.radius.lg,
        background: t.forge.raised,
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)',
        outline: 'none',
      }),
      Style.nest('[role="option"]', {
        paddingBlock: t.space.xs,
        paddingInline: t.space.sm,
        fontSize: t.size.sm,
        color: t.forge.dim,
        cursor: 'pointer',
      }),
      Style.nest('[role="option"][data-active]', { background: t.forge.hover }),
      Style.nest('[role="option"][data-selected]', {
        background: t.forge.accent,
        color: t.forge['on-accent'],
      }),
    ),
    themeOption: Style.self({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }),
    themeCheck: Style.self({ fontSize: t.size.xs }),
    themeBackdrop: Style.self({ position: 'fixed', inset: '0', zIndex: '0' }),
    icon,
  },
  { name: 'ToolbarStyle', layer: app },
)

const checked = '[aria-checked="true"]'

/** A tool: its name and shortcut across a full-width button. */
export const ToolOptionStyle = Style.forSlots(RadioGroupSlots)(
  {
    option: Style.compose(
      choice(checked),
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
      }),
    ),
  },
  { name: 'ToolOptionStyle', layer: app },
)

/** A grid size: one of four equal buttons. */
export const SizeOptionStyle = Style.forSlots(RadioGroupSlots)(
  {
    option: Style.compose(
      choice(checked),
      Style.self({ flex: '1', paddingInline: t.space.xs }),
      Style.pseudo(`:not(${checked}):hover`, { background: t.forge.raised }),
    ),
  },
  { name: 'SizeOptionStyle', layer: app },
)

/** A swatch: a square of its color (`--swatch-color`), ringed in white when chosen. */
export const SwatchStyle = Style.forSlots(RadioGroupSlots)(
  {
    option: Style.compose(
      Style.self({
        aspectRatio: '1',
        padding: '0',
        border: '0',
        borderRadius: t.radius.xs,
        background: 'var(--swatch-color)',
        cursor: 'pointer',
        transition: `scale ${t.motion.fast}`,
      }),
      Style.pseudo(`:not(${checked}):hover`, { scale: '1.05' }),
      Style.pseudo(checked, {
        boxShadow: `0 0 0 2px ${t.forge.page}, 0 0 0 4px ${t.forge['on-accent']}`,
      }),
      Style.media('(prefers-reduced-motion: reduce)', { scale: '1' }),
    ),
    label: visuallyHidden,
  },
  { name: 'SwatchStyle', layer: app },
)

/** Upstream draws the mirror switches as toggle buttons, H and V, not as tracks. */
export const MirrorSwitchStyle = Style.forSlots(SwitchSlots)(
  {
    button: Style.compose(choice(checked), Style.self({ width: '100%' })),
    label: visuallyHidden,
  },
  { name: 'MirrorSwitchStyle', layer: app },
)

// CANVAS

export const CanvasSlots = Slots.define({
  column: container,
  frame: container,
  canvas: container,
  row: container,
  cell: container,
})

export const CanvasStyle = Style.forSlots(CanvasSlots)(
  {
    // First on a narrow page, across every column until they sit side by side.
    column: Style.compose(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: t.space.md,
        minWidth: '0',
        alignSelf: 'start',
        gridColumn: '1 / -1',
        order: '-1',
      }),
      Style.media(WIDE, { gridColumn: 'auto', order: '0' }),
    ),
    frame: Style.self({ width: '100%', maxWidth: '32rem' }),
    canvas: Style.self({
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      aspectRatio: '1',
      cursor: 'crosshair',
      userSelect: 'none',
    }),
    row: Style.self({ display: 'flex', flex: '1' }),
    // The color is the cell's own, so it is a custom property the rule reads.
    cell: Style.self({ flex: '1', background: 'var(--pixel-color)' }),
  },
  { name: 'CanvasStyle', layer: app },
)

// HISTORY

export const HistorySlots = Slots.define({
  panel: container,
  label: container,
  controls: container,
  buttonText: container,
  shortcut: container,
  entries: container,
  entry: container,
  thumbnail: container,
  pixel: container,
  entryLabel: container,
  more: container,
})

export const HistoryStyle = Style.forSlots(HistorySlots)(
  {
    panel: sidePanel,
    label: sectionLabel,
    controls: L.in('layouts', Layout.stack({ gap: '0.375rem' })),
    shortcut: Style.self({ color: t.forge.muted }),
    entries: Style.compose(
      L.in('layouts', Layout.stack({ gap: '0.375rem' })),
      Style.self({ maxHeight: '420px', marginTop: t.space.sm, overflowY: 'auto' }),
    ),
    // `data-entry` is `Current` for the grid on screen, else `Step`.
    entry: Style.compose(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: t.space.xs,
        paddingBlock: '0.375rem',
        paddingInline: t.space.xs,
        borderRadius: t.radius.sm,
      }),
      Style.states(
        {
          Current: { background: t.forge.accent, color: t.forge['on-accent'] },
          Step: { background: t.forge.raised, color: t.forge.muted, cursor: 'pointer' },
        },
        'data-entry',
      ),
      Style.pseudo('[data-entry="Step"]:hover', { background: t.forge.hover }),
    ),
    // `--grid-size` columns of `THUMBNAIL_CELL_SIZE` pixels.
    thumbnail: Style.self({
      display: 'grid',
      flexShrink: '0',
      gridTemplateColumns: `repeat(var(--grid-size), ${THUMBNAIL_CELL_SIZE}px)`,
    }),
    pixel: Style.self({
      width: `${THUMBNAIL_CELL_SIZE}px`,
      height: `${THUMBNAIL_CELL_SIZE}px`,
      background: 'var(--pixel-color)',
    }),
    entryLabel: Style.self({
      overflow: 'hidden',
      fontSize: '10px',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
    more: Style.self({
      paddingBlock: t.space['2xs'],
      fontSize: '10px',
      textAlign: 'center',
      color: t.forge.faint,
    }),
  },
  { name: 'HistoryStyle', layer: app },
)

// DIALOG

/**
 * The recipe's dialog on upstream's panel: `gray-900` with a `gray-700`
 * edge over a darker backdrop. Its close control is a full button, as
 * upstream's Dismiss and Cancel are, not the recipe's corner cross. A title
 * with `data-tone="error"` is red, as upstream's "Export Failed" is.
 */
export const DialogStyle = Style.forSlots(DialogSlots)(
  Recipes.Dialog.extend({
    base: {
      // Upstream's `open:flex items-center justify-center`: the panel in the middle of the window.
      dialog: Style.pseudo('[open]', {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
      }),
      backdrop: Style.self({ background: t.forge.backdrop }),
      panel: Style.self({
        maxWidth: '24rem',
        padding: t.space.lg,
        border: `${t.border.thin} solid ${t.forge.hover}`,
        background: t.forge.page,
        color: t.forge.text,
        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 10%), 0 8px 10px -6px rgb(0 0 0 / 10%)',
      }),
      title: Style.compose(
        Style.self({ fontSize: t.size.lg, color: t.forge.text }),
        Style.states({ error: { color: t.forge['danger-ink'] } }, 'data-tone'),
      ),
      description: Style.self({ fontSize: t.size.sm, color: t.forge.muted }),
      closeButton: Style.compose(
        Style.self({
          position: 'static',
          flex: '1',
          paddingBlock: t.space.xs,
          paddingInline: t.space.md,
          borderRadius: t.radius.sm,
          font: 'inherit',
          fontSize: t.size.sm,
          lineHeight: TEXT_SM_LEADING,
          background: t.forge.raised,
          color: t.forge.soft,
        }),
        Style.pseudo(':hover', { background: t.forge.hover, color: t.forge.soft }),
      ),
    },
  })({ size: 'sm' }),
  { name: 'DialogStyle', layer: app },
)

export const DialogContentSlots = Slots.define({
  actions: container,
})

export const DialogContentStyle = Style.forSlots(DialogContentSlots)(
  { actions: Style.self({ display: 'flex', gap: t.space.sm }) },
  { name: 'DialogContentStyle', layer: app },
)

// STYLESHEET

/**
 * What a slot cannot carry: the layer order, the tokens the styles read, and
 * the body defaults. The slot styles' own classes are injected when a Slot
 * first draws them, so they are not repeated here. `colorScheme: 'dark'`
 * reads the palette's dark scheme, since upstream's page is `gray-900` in any
 * browser.
 */
export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens, { colorScheme: 'dark' })),
  L.in('theme', Theme.root(palette, { omit: Theme.tokens, colorScheme: 'dark' })),
  L.in('defaults', Defaults.body),
)

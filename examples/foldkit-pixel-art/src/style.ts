/**
 * The editor's appearance, as `foldkit-mixins` data. The views draw the
 * markup through the Slots declared here; everything it looks like lives here.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so it overrides the recipes and the `Layout` pieces it
 * composes by layer order rather than by specificity.
 */
import { Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ButtonSlots, DialogSlots, RadioGroupSlots, Recipes, SwitchSlots } from 'foldkit-mixins-ui'

import { THUMBNAIL_CELL_SIZE } from './constant.js'

/**
 * The recipes' palette, indigo as upstream's accent, read in its dark scheme;
 * and the page's own colors, the Tailwind shades upstream names, as `forge`
 * tokens on a `gray-900` page. `colorScheme: 'dark'` reads the dark scheme in
 * any browser, since upstream's page is `gray-900` everywhere.
 */
const { t, L, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.compose(
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
  ),
  colorScheme: 'dark',
})

export { stylesheet }

/** Upstream's `md:` breakpoint. */
const WIDE = '(min-width: 48rem)'

/** Upstream's `min-[480px]:` breakpoint. */
const TWO_COLUMNS = '(min-width: 30rem)'

/** Tailwind's `text-sm` line height, which upstream's controls take. */
const TEXT_SM_LEADING = '1.25rem'

/** Upstream's `text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2`. */
const sectionLabel = [
  U.text('xs'),
  U.font('semibold'),
  U.uppercase,
  {
    marginBottom: t.space.xs,
    fontSize: '10px',
    letterSpacing: '0.1em',
    color: t.forge.muted,
  },
]

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
const choice = (selected: string) => [
  U.text('sm'),
  {
    paddingBlock: '0.375rem',
    paddingInline: t.space.sm,
    border: '0',
    borderRadius: t.radius.sm,
    font: 'inherit',
    lineHeight: TEXT_SM_LEADING,
    background: t.forge.raised,
    color: t.forge.muted,
    cursor: 'pointer',
    transition: `background-color ${t.motion.fast}, color ${t.motion.fast}`,
  },
  Style.pseudo(`:not(${selected}):hover`, { background: t.forge.hover, color: t.forge.soft }),
  Style.pseudo(selected, { background: t.forge.accent, color: t.forge['on-accent'] }),
]

const icon = { width: '1rem', height: '1rem', flexShrink: '0' }

/** Upstream's `w-full md:w-44`. */
const sidePanel = [
  U.column,
  { width: '100%', flexShrink: '0' },
  Style.media(WIDE, { width: '11rem' }),
]

// BUTTON

/**
 * Upstream's secondary button: `gray-200` text on `gray-800`, `gray-700`
 * under the pointer, faded when disabled. The recipe brings the focus ring
 * and the disabled treatment.
 */
const Secondary = Recipes.Button.extend({
  base: {
    button: [
      U.text('sm'),
      U.font('normal'),
      {
        justifyContent: 'flex-start',
        gap: t.space.xs,
        paddingBlock: '0.375rem',
        paddingInline: t.space.sm,
        border: '0',
        borderRadius: t.radius.sm,
        lineHeight: TEXT_SM_LEADING,
        background: t.forge.raised,
        color: t.forge.soft,
      },
      Style.pseudo(':is([aria-disabled="true"], :disabled)', { opacity: '0.4' }),
      hover({ background: t.forge.hover }),
    ],
  },
})

export const SecondaryButtonStyle = forSlots(ButtonSlots)(Secondary({ tone: 'neutral' }), {
  name: 'SecondaryButtonStyle',
})

/** Upstream's `w-full` secondary button: Clear Canvas. */
export const FullWidthButtonStyle = forSlots(ButtonSlots)(
  Secondary.extend({ base: { button: { width: '100%' } } })({ tone: 'neutral' }),
  { name: 'FullWidthButtonStyle' },
)

/** Undo and Redo: full width, the shortcut pushed to the end. */
export const ShortcutButtonStyle = forSlots(ButtonSlots)(
  Secondary.extend({
    base: { button: { width: '100%', justifyContent: 'space-between' } },
  })({ tone: 'neutral' }),
  { name: 'ShortcutButtonStyle' },
)

/** Upstream's `bg-red-600` "Clear and Resize". */
export const DangerButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: [
        U.text('sm'),
        U.font('normal'),
        {
          flex: '1',
          paddingBlock: t.space.xs,
          paddingInline: t.space.md,
          border: '0',
          borderRadius: t.radius.sm,
          lineHeight: TEXT_SM_LEADING,
          background: t.forge.danger,
          color: t.forge['on-accent'],
        },
        hover({ background: t.forge['danger-hover'] }),
      ],
    },
  })({ tone: 'danger' }),
  { name: 'DangerButtonStyle' },
)

// PAGE

export const PixelPage = slots(
  {
    page: [
      L.in('layouts', Layout.stack({ gap: '0' })),
      { minHeight: '100vh', background: t.forge.page, color: t.forge.text },
    ],
    header: [
      U.flex,
      U.items('center'),
      U.justify('between'),
      U.py('sm'),
      U.px('md'),
      { borderBottom: `${t.border.thin} solid ${t.forge.raised}` },
    ],
    brand: U.column,
    title: [
      U.text('lg'),
      U.font('bold'),
      {
        margin: `0 0 ${t.space['2xs']}`,
        letterSpacing: '-0.025em',
        lineHeight: '1',
        color: t.forge.text,
      },
    ],
    byline: [
      U.flex,
      U.items('center'),
      U.gap('2xs'),
      U.text('xs'),
      { lineHeight: '1', color: t.forge.muted },
    ],
    link: [
      { color: 'inherit', textDecoration: 'none', transition: `color ${t.motion.fast}` },
      Style.pseudo(':hover', { color: t.forge.soft }),
    ],
    actions: [U.flex, U.items('center'), U.gap('md')],
    icon,
    iconPath: {},
    separator: {},
    buttonText: {},
    // One column, two from 30rem with the canvas across both, and from 48rem
    // the tools, the canvas and the history side by side.
    content: [
      U.p('md'),
      {
        boxSizing: 'border-box',
        display: 'grid',
        flex: '1',
        gridTemplateColumns: '1fr',
        gap: t.space.lg,
        width: '100%',
        maxWidth: '64rem',
        marginInline: 'auto',
      },
      Style.media(TWO_COLUMNS, { gridTemplateColumns: 'repeat(2, 1fr)' }),
      Style.media(WIDE, {
        gridTemplateColumns: 'auto 1fr auto',
        justifyContent: 'center',
        alignItems: 'start',
        padding: t.space.lg,
      }),
    ],
  },
  { name: 'PageStyle' },
)

// TOOLBAR

export const ToolbarPart = slots(
  {
    panel: [sidePanel, U.gap('lg')],
    section: {},
    label: sectionLabel,
    toolGroup: L.in('layouts', Layout.stack({ gap: '0.375rem' })),
    shortcut: [U.text('xs'), { color: t.forge.muted }],
    mirrorGroup: [U.flex, U.gap('xs')],
    mirrorSwitch: { flex: '1' },
    sizeGroup: [U.flex, U.gap('2xs')],
    hex: [
      U.text('xs'),
      { paddingBottom: t.space.sm, fontFamily: t.font.mono, color: t.forge.muted },
    ],
    paletteGroup: [U.grid, { gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.625rem' }],
    themePicker: [{ position: 'relative', width: '100%', marginTop: t.space.sm }],
    themeButton: [
      U.text('sm'),
      {
        width: '100%',
        paddingBlock: '0.375rem',
        paddingInline: t.space.sm,
        border: '0',
        borderRadius: t.radius.sm,
        font: 'inherit',
        background: t.forge.raised,
        color: t.forge.soft,
        cursor: 'pointer',
        transition: `background-color ${t.motion.fast}`,
      },
      Style.pseudo(':hover', { background: t.forge.hover }),
    ],
    themeButtonContent: [U.flex, U.items('center'), U.justify('between'), { width: '100%' }],
    themeName: {},
    chevron: [icon, { color: t.forge.muted }],
    // `@foldkit/ui` Listbox takes only a class name per option, so the
    // options are styled from their container, by the role and the
    // `data-selected` and `data-active` the component writes.
    themeItems: [
      {
        width: 'var(--button-width)',
        overflow: 'hidden',
        zIndex: '10',
        border: `${t.border.thin} solid ${t.forge.hover}`,
        borderRadius: t.radius.lg,
        background: t.forge.raised,
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)',
        outline: 'none',
      },
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
    ],
    themeOption: [U.flex, U.items('center'), U.justify('between')],
    themeCheck: U.text('xs'),
    themeBackdrop: { position: 'fixed', inset: '0', zIndex: '0' },
    icon,
    iconPath: {},
    buttonText: {},
  },
  { name: 'ToolbarStyle' },
)

const checked = '[aria-checked="true"]'

/** A tool: its name and shortcut across a full-width button. */
export const ToolOptionStyle = forSlots(RadioGroupSlots)(
  {
    option: [choice(checked), U.flex, U.items('center'), U.justify('between'), { width: '100%' }],
  },
  { name: 'ToolOptionStyle' },
)

/** A grid size: one of four equal buttons. */
export const SizeOptionStyle = forSlots(RadioGroupSlots)(
  {
    option: [
      choice(checked),
      U.px('xs'),
      { flex: '1' },
      Style.pseudo(`:not(${checked}):hover`, { background: t.forge.raised }),
    ],
  },
  { name: 'SizeOptionStyle' },
)

/** A swatch: a square of its color (`--swatch-color`), ringed in white when chosen. */
export const SwatchStyle = forSlots(RadioGroupSlots)(
  {
    option: [
      U.rounded('xs'),
      U.pointer,
      {
        aspectRatio: '1',
        padding: '0',
        border: '0',
        background: 'var(--swatch-color)',
        transition: `scale ${t.motion.fast}`,
      },
      Style.pseudo(`:not(${checked}):hover`, { scale: '1.05' }),
      Style.pseudo(checked, {
        boxShadow: `0 0 0 2px ${t.forge.page}, 0 0 0 4px ${t.forge['on-accent']}`,
      }),
      Style.media('(prefers-reduced-motion: reduce)', { scale: '1' }),
    ],
    label: visuallyHidden,
  },
  { name: 'SwatchStyle' },
)

/** Upstream draws the mirror switches as toggle buttons, H and V, not as tracks. */
export const MirrorSwitchStyle = forSlots(SwitchSlots)(
  {
    button: [choice(checked), { width: '100%' }],
    label: visuallyHidden,
  },
  { name: 'MirrorSwitchStyle' },
)

// CANVAS

export const CanvasPart = slots(
  {
    // First on a narrow page, across every column until they sit side by side.
    column: [
      U.column,
      U.items('center'),
      U.gap('md'),
      {
        minWidth: '0',
        alignSelf: 'start',
        gridColumn: '1 / -1',
        order: '-1',
      },
      Style.media(WIDE, { gridColumn: 'auto', order: '0' }),
    ],
    frame: { width: '100%', maxWidth: '32rem' },
    canvas: [U.column, U.selectNone, { width: '100%', aspectRatio: '1', cursor: 'crosshair' }],
    row: [U.flex, { flex: '1' }],
    // The color is the cell's own, so it is a custom property the rule reads.
    cell: [{ flex: '1', background: 'var(--pixel-color)' }],
  },
  { name: 'CanvasStyle' },
)

// HISTORY

export const HistoryPart = slots(
  {
    panel: sidePanel,
    label: sectionLabel,
    controls: L.in('layouts', Layout.stack({ gap: '0.375rem' })),
    buttonText: {},
    shortcut: { color: t.forge.muted },
    entries: [
      L.in('layouts', Layout.stack({ gap: '0.375rem' })),
      { maxHeight: '420px', marginTop: t.space.sm, overflowY: 'auto' },
    ],
    // `data-entry` is `Current` for the grid on screen, else `Step`.
    entry: [
      U.flex,
      U.items('center'),
      U.gap('xs'),
      U.rounded('sm'),
      {
        paddingBlock: '0.375rem',
        paddingInline: t.space.xs,
      },
      Style.states(
        {
          Current: { background: t.forge.accent, color: t.forge['on-accent'] },
          Step: { background: t.forge.raised, color: t.forge.muted, cursor: 'pointer' },
        },
        'data-entry',
      ),
      Style.pseudo('[data-entry="Step"]:hover', { background: t.forge.hover }),
    ],
    // `--grid-size` columns of `THUMBNAIL_CELL_SIZE` pixels.
    thumbnail: [
      U.grid,
      {
        flexShrink: '0',
        gridTemplateColumns: `repeat(var(--grid-size), ${THUMBNAIL_CELL_SIZE}px)`,
      },
    ],
    pixel: [
      {
        width: `${THUMBNAIL_CELL_SIZE}px`,
        height: `${THUMBNAIL_CELL_SIZE}px`,
        background: 'var(--pixel-color)',
      },
    ],
    entryLabel: [
      {
        overflow: 'hidden',
        fontSize: '10px',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
    ],
    more: [U.textCenter, U.py('2xs'), { fontSize: '10px', color: t.forge.faint }],
  },
  { name: 'HistoryStyle' },
)

// DIALOG

/**
 * The recipe's dialog on upstream's panel: `gray-900` with a `gray-700`
 * edge over a darker backdrop. Its close control is a full button, as
 * upstream's Dismiss and Cancel are, not the recipe's corner cross. A title
 * with `data-tone="error"` is red, as upstream's "Export Failed" is.
 */
export const DialogStyle = forSlots(DialogSlots)(
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
      backdrop: { background: t.forge.backdrop },
      panel: [
        U.p('lg'),
        {
          maxWidth: '24rem',
          border: `${t.border.thin} solid ${t.forge.hover}`,
          background: t.forge.page,
          color: t.forge.text,
          boxShadow: '0 20px 25px -5px rgb(0 0 0 / 10%), 0 8px 10px -6px rgb(0 0 0 / 10%)',
        },
      ],
      title: [
        U.text('lg'),
        { color: t.forge.text },
        Style.states({ error: { color: t.forge['danger-ink'] } }, 'data-tone'),
      ],
      description: [U.text('sm'), { color: t.forge.muted }],
      closeButton: [
        U.text('sm'),
        {
          position: 'static',
          flex: '1',
          paddingBlock: t.space.xs,
          paddingInline: t.space.md,
          borderRadius: t.radius.sm,
          font: 'inherit',
          lineHeight: TEXT_SM_LEADING,
          background: t.forge.raised,
          color: t.forge.soft,
        },
        Style.pseudo(':hover', { background: t.forge.hover, color: t.forge.soft }),
      ],
    },
  })({ size: 'sm' }),
  { name: 'DialogStyle' },
)

export const DialogContentPart = slots(
  { actions: [U.flex, U.gap('sm')] },
  { name: 'DialogContentStyle' },
)

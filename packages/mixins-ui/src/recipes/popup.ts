/**
 * What the popup components share: Menu, Listbox, and ComboBox all open the
 * same bordered panel of rows under their trigger. One definition here keeps
 * the three dropdowns speaking one language; each recipe adds its own
 * trigger and density. Internal to the recipes, not a published contract.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { nested, raise, raisedSurface, role } from 'foldkit-mixins/theme'
import { component, disabled, glide, presence, ref, rowOnLadder } from './design.js'

/** A line in the panel's own ink, so it reads on an inverted panel too. */
const line = `color-mix(in oklab, ${ref.popup.ink} 14%, transparent)`

/**
 * The floating panel: a bordered card over later content, under the nav, in
 * the palette's `popup` look (a theme's menu accent and color).
 */
export const panel: StyleValue = component(
  Style.self({
    marginBlockStart: ref.space['2xs'],
    minInlineSize: '14rem',
    padding: ref.space['2xs'],
    border: `${ref.border.thin} solid ${line}`,
    borderRadius: ref.radius.xl,
    // The menu's look over the panel's level: the other scheme's base where it
    // is inverted, made see-through where it is translucent.
    background: `color-mix(in oklab, color-mix(in oklab, ${ref.popup.inverted} calc(${ref.knob['popup-invert']} * 100%), ${raisedSurface()}) calc(${ref.knob['popup-alpha']} * 100%), transparent)`,
    color: ref.popup.ink,
    backdropFilter: `blur(${ref.popup.blur})`,
    boxShadow: ref.shadow.lg,
    zIndex: '20',
  }),
  // The panel holds focus while the keys move the active row, which shows
  // where they are; a ring around the whole panel says nothing more.
  Style.pseudo(':focus-visible', { outline: 'none' }),
  raise(2),
  // It grows out of its trigger, from the side the anchor placed it on.
  Style.self({ transformOrigin: 'top' }),
  presence('fast', { scale: '1 0.96', translate: '0 -4px' }),
  Style.pseudo('[data-placement="top"]', { transformOrigin: 'bottom' }),
  Style.pseudo('[data-placement="top"][data-closed]', { translate: '0 4px' }),
)

/** The click-away behind an open panel. */
export const backdrop: StyleValue = component(Style.self({ position: 'fixed', inset: '0' }))

/** A lit row: the theme's tint of the panel's ink, or its accent fill when the menu accent is bold. */
const lighted = { background: ref.popup.highlight, color: ref.popup['highlight-ink'] }

/** A row outside any panel a fluid highlight runs in. */
export const unlit = '&:not([data-fluid-hover] *)'

/**
 * Chosen rows next to each other read as one block, as Fluid
 * Functionalism's merged selections do: the corners between two chosen rows
 * square off, so a run is one rounded fill rather than a stack of pills.
 */
export const mergedChoice: StyleValue = Style.compose(
  Style.nest(`${unlit}[aria-selected="true"]:has(+ [aria-selected="true"])`, {
    borderEndStartRadius: '0',
    borderEndEndRadius: '0',
  }),
  Style.nest(`[aria-selected="true"] + ${unlit}[aria-selected="true"]`, {
    borderStartStartRadius: '0',
    borderStartEndRadius: '0',
  }),
)
const lit = ':where([data-fluid-hover]) > &'

/** One row of the panel. */
export const item: StyleValue = component(
  Style.self({
    display: 'flex',
    alignItems: 'center',
    inlineSize: '100%',
    boxSizing: 'border-box',
    ...rowOnLadder,
    border: '0',
    // Concentric with the panel's corner, inside its padding and border.
    borderRadius: nested(ref.radius.xl, ref.space['2xs'], ref.border.thin),
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'start',
    cursor: 'pointer',
  }),
  // The row the keys or the pointer are on (upstream marks it `data-active`),
  // until a fluid highlight runs in the panel and lights it instead.
  Style.nest(`${unlit}:hover:not([aria-disabled="true"], :disabled)`, lighted),
  Style.nest(`${unlit}[data-active]`, lighted),
  // Under a fluid highlight the highlight is the fill; the row keeps its ink.
  Style.nest(`:where([data-fluid-hover]) &[data-active]`, { color: ref.popup['highlight-ink'] }),
  disabled,
)

/** The rows' box: a positioned one for the highlight and indicator, under the rows. */
export const rows: StyleValue = component(
  Style.self({ position: 'relative', isolation: 'isolate' }),
)

/** A position under a panel's `fluid`: the custom properties its Mounts write. */
const at = (name: 'hover' | 'chosen', part: 'x' | 'y' | 'w' | 'h') =>
  `var(--fk-popup-${name}-${part})`

const overlay = (name: 'hover' | 'chosen') => ({
  position: 'absolute',
  // Physical: the Mounts measure from the left, in either direction.
  top: '0',
  left: '0',
  zIndex: '-1',
  inlineSize: at(name, 'w'),
  blockSize: at(name, 'h'),
  translate: `${at(name, 'x')} ${at(name, 'y')}`,
  borderRadius: ref.radius.md,
  pointerEvents: 'none',
})

/** The one hover of a panel under `fluid`, which the keys move too. */
export const highlight: StyleValue = component(
  Style.self({
    ...overlay('hover'),
    display: 'none',
    opacity: 'var(--fk-popup-hover-shown)',
    background: ref.popup.highlight,
    ...glide('fast', 'var(--fk-popup-hover-moving)'),
  }),
  Style.nest(lit, { display: 'block' }),
)

/** The chosen row's marker under `fluid`, which glides to a new choice. */
export const indicator: StyleValue = component(
  Style.self({
    ...overlay('chosen'),
    display: 'none',
    background: ref.accent.subtle,
    ...glide('moderate', '1'),
  }),
  Style.nest(lit, { display: 'var(--fk-popup-chosen-display, none)' }),
)

/** A group heading inside the panel. */
export const heading: StyleValue = component(
  Style.self({
    margin: '0',
    paddingBlock: ref.space['2xs'],
    paddingInline: ref.space.sm,
    // The panel's ink, quieter: the page's muted text would not read on an inverted panel.
    color: `color-mix(in oklab, ${ref.popup.ink} 62%, transparent)`,
    ...role('caption'),
    fontWeight: ref.weight.semibold,
    textTransform: 'uppercase',
  }),
)

/** The hairline between groups. */
export const separator: StyleValue = component(
  Style.self({
    marginBlock: ref.space['2xs'],
    borderBlockStart: `${ref.border.thin} solid ${line}`,
  }),
)

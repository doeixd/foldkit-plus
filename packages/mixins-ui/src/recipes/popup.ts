/**
 * What the popup components share: Menu, Listbox, and ComboBox all open the
 * same bordered panel of rows under their trigger. One definition here keeps
 * the three dropdowns speaking one language; each recipe adds its own
 * trigger and density. Internal to the recipes, not a published contract.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { component, disabled, hover, ref, variant } from './design.js'

/** The floating panel: a bordered card over later content, under the nav. */
export const panel: StyleValue = component(
  Style.self({
    marginBlockStart: ref.space['2xs'],
    minInlineSize: '14rem',
    padding: ref.space['2xs'],
    border: `${ref.border.thin} solid ${ref.outline.subtle}`,
    borderRadius: ref.radius.lg,
    background: ref.surface.base,
    boxShadow: ref.shadow.lg,
    zIndex: '20',
  }),
  // The panel holds focus while the keys move the active row, which shows
  // where they are; a ring around the whole panel says nothing more.
  Style.pseudo(':focus-visible', { outline: 'none' }),
)

/** The click-away behind an open panel. */
export const backdrop: StyleValue = component(Style.self({ position: 'fixed', inset: '0' }))

/** A row outside any panel a fluid highlight runs in. */
export const unlit = '&:not([data-fluid-hover] *)'
const lit = ':where([data-fluid-hover]) > &'

/** One row of the panel. */
export const item: StyleValue = component(
  Style.self({
    display: 'block',
    inlineSize: '100%',
    boxSizing: 'border-box',
    paddingBlock: ref.space['2xs'],
    paddingInline: ref.space.sm,
    border: '0',
    borderRadius: ref.radius.md,
    background: 'transparent',
    color: ref.text.default,
    font: 'inherit',
    fontSize: ref.size.sm,
    textAlign: 'start',
    cursor: 'pointer',
  }),
  // The row the keys or the pointer are on (upstream marks it `data-active`),
  // until a fluid highlight runs in the panel and lights it instead.
  Style.nest(`${unlit}:hover:not([aria-disabled="true"], :disabled)`, {
    background: ref.surface.muted,
  }),
  Style.nest(`${unlit}[data-active]`, { background: ref.surface.muted }),
  disabled,
)

/** The rows' box: a positioned one for the highlight and indicator, under the rows. */
export const rows: StyleValue = component(
  Style.self({ position: 'relative', isolation: 'isolate' }),
)

/** A position under a panel's `fluid`: the custom properties its Mounts write. */
const at = (name: 'hover' | 'chosen', part: 'x' | 'y' | 'w' | 'h') =>
  `var(--fk-popup-${name}-${part})`

const glide = (moving: string) => {
  const duration = `calc(${ref.motion.normal} * ${moving})`
  return {
    transitionProperty: 'translate, inline-size, block-size, opacity',
    transitionDuration: `${duration}, ${duration}, ${duration}, ${ref.motion.fast}`,
    transitionTimingFunction: `${ref.motion.spring}, ${ref.motion.spring}, ${ref.motion.spring}, ${ref.motion.ease}`,
  }
}

const overlay = (name: 'hover' | 'chosen') => ({
  position: 'absolute',
  insetBlockStart: '0',
  insetInlineStart: '0',
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
    background: ref.surface.muted,
    ...glide('var(--fk-popup-hover-moving)'),
  }),
  Style.nest(lit, { display: 'block' }),
)

/** The chosen row's marker under `fluid`, which glides to a new choice. */
export const indicator: StyleValue = component(
  Style.self({
    ...overlay('chosen'),
    display: 'none',
    background: ref.accent.subtle,
    ...glide('1'),
  }),
  Style.nest(lit, { display: 'var(--fk-popup-chosen-display, none)' }),
)

/** A group heading inside the panel. */
export const heading: StyleValue = component(
  Style.self({
    margin: '0',
    paddingBlock: ref.space['2xs'],
    paddingInline: ref.space.sm,
    color: ref.text.muted,
    fontSize: ref.size.xs,
    fontWeight: ref.weight.semibold,
    textTransform: 'uppercase',
  }),
)

/** The hairline between groups. */
export const separator: StyleValue = component(
  Style.self({
    marginBlock: ref.space['2xs'],
    borderBlockStart: `${ref.border.thin} solid ${ref.outline.subtle}`,
  }),
)

/** Row density: block/inline padding and type size. */
export const density = (block: string, inline: string, font: string): StyleValue =>
  variant(Style.self({ paddingBlock: block, paddingInline: inline, fontSize: font }))

/**
 * What the popup components share: Menu, Listbox, and ComboBox all open the
 * same bordered panel of rows under their trigger. One definition here keeps
 * the three dropdowns speaking one language; each recipe adds its own
 * trigger and density. Internal to the recipes, not a published contract.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { component, disabled, ref, variant } from './design.js'

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
)

/** The click-away behind an open panel. */
export const backdrop: StyleValue = component(Style.self({ position: 'fixed', inset: '0' }))

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
  Style.pseudo(':hover:not([aria-disabled="true"], :disabled)', { background: ref.surface.muted }),
  disabled,
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

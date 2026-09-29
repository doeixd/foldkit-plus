/**
 * The example's shared look, as `foldkit-mixins` Style: one theme, derived
 * from an accent color, and the pieces several owners dress their Slots with
 * (links, buttons, badges, disclosures, touch targets). Each owner's Slots
 * live beside their Style: `adminStyle.ts` for the authoring shell,
 * `formStyles.ts` for the mixins' form and list Slots, `builderStyle.ts` for
 * the page Builder, `siteStyle.ts` for the public site. A view attaches a
 * Style, and its rules arrive when the view draws; the page's own stylesheet
 * (`sheet.ts`) holds only the foundations.
 */
import { Capability, Layers, Slot, Style } from 'foldkit-mixins'
import { Recipes } from 'foldkit-mixins-ui'
import { Theme } from 'foldkit-mixins/theme'

export const theme = Theme.compose(
  Theme.tokens,
  Theme.oklch({
    accent: { h: 265, c: 0.16, l: '52%', dark: { l: '72%', c: 0.13 } },
    surfaceSaturation: 0.008,
  }),
)
/** Every token as a typed `var(--fk-…)` reference: the admin's and the site's styles read these. */
export const t = Theme.ref(theme)

/** A serif for reading and writing long text: the post's body, here and on the site. */
export const serif = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"

export const L = Layers.standard
/** Every slot style is born in `app`, the last layer, so it wins over the foundations and the looks. */
export const app = L.layer('app')

export const part = Slot.make({ capability: Capability.Container })
export const control = Slot.make({ capability: Capability.Interactive })

/** Where the studio lays itself out for a phone rather than beside a sidebar. */
export const phone = '(max-width: 52rem)'
/**
 * On a touch screen, a control a finger can hit: 44px, as the platforms advise.
 * Only where the pointer is coarse, so a desktop keeps its density.
 */
export const touchTarget = Style.media('(pointer: coarse)', {
  minHeight: '2.75rem',
  minWidth: '2.75rem',
})

/**
 * The same, for every control a region draws: a link or button laid out as a
 * box. A link inside a sentence is inline, where `min-height` does nothing, so
 * prose keeps its lines.
 */
export const touchTargets = Style.at(
  '@media (pointer: coarse)',
  Style.nest(':is(a, button, summary, select)', { minHeight: '2.75rem' }),
)

/**
 * A disclosure's summary: a drawn chevron in place of the browser's marker,
 * pointing along the line while closed and turned down while open (the turn
 * is `chevronOpen`, on the `details`).
 *
 * Not the Disclosure contract: that is a JS-driven button[aria-expanded] plus
 * panel, while this is the browser's own details/summary with CSS keyed on
 * details[open]. Adopting it would replace the element model, not restyle it.
 */
export const chevron = Style.compose(
  Style.nest('&::-webkit-details-marker', { display: 'none' }),
  Style.nest('&::before', {
    borderBlockEnd: '2px solid currentColor',
    borderInlineEnd: '2px solid currentColor',
    boxSizing: 'border-box',
    content: '""',
    flexShrink: '0',
    height: '0.5em',
    marginInline: '0.1em 0.2em',
    transform: 'rotate(-45deg)',
    transition: 'transform 150ms ease',
    width: '0.5em',
  }),
  Style.self({ alignItems: 'center', cursor: 'pointer', display: 'flex', listStyle: 'none' }),
)
export const chevronOpen = Style.nest('&[open] > summary::before', { transform: 'rotate(45deg)' })

/** Read by assistive technology, not shown. */
export const readOnly = {
  clipPath: 'inset(50%)',
  height: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const

/** A button as the mixins-ui recipe draws it, for a slot of our own. */
export const button = (selection: Parameters<typeof Recipes.Button>[0]) =>
  Recipes.Button(selection).button ?? Style.empty

/**
 * What a text box looks like, in a form and in the Builder's inspector.
 *
 * Not Recipes.Input restyled: the views draw raw h.input on control slots and
 * the forms go through FieldSlots, so adopting it means rewiring to InputSlots.
 */
export const field = Style.compose(
  Style.self({
    background: t.surface.base,
    border: `1px solid ${t.outline.default}`,
    borderRadius: t.radius.md,
    boxSizing: 'border-box',
    color: t.text.default,
    font: 'inherit',
    padding: '0.5rem 0.7rem',
    width: '100%',
  }),
  Style.pseudo(':focus-visible', {
    borderColor: t.accent.default,
    outline: `2px solid ${t.accent.default}`,
    outlineOffset: '1px',
  }),
  // The browser's own grey is the same in both themes, and too faint on either.
  Style.pseudo('::placeholder', { color: t.text.muted, opacity: '1' }),
  Style.nest('&[aria-invalid="true"]', { borderColor: t.error.default }),
)

/** Out of sight and still read: a label a field's placeholder stands in for. */
export const visuallyHidden = Style.self({
  clipPath: 'inset(50%)',
  height: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
})

export const navLink = Style.compose(
  Style.self({
    alignItems: 'center',
    borderRadius: t.radius.md,
    color: t.text.default,
    display: 'flex',
    fontSize: t.size.sm,
    fontWeight: t.weight.medium,
    gap: t.space.xs,
    padding: '0.45rem 0.65rem',
    textDecoration: 'none',
  }),
  // In a phone's row of sections: whole, side by side.
  Style.media(phone, { flexShrink: '0', whiteSpace: 'nowrap' }),
  touchTarget,
  Style.pseudo(':hover', { background: t.surface.muted, color: t.text.overt }),
  Style.nest('&[aria-current="page"]', {
    background: t.surface.default,
    color: t.text.overt,
    fontWeight: t.weight.semibold,
  }),
)

/** The studio's main action, dark as the page's ink, in the manner of an editor's publish. */
export const primaryButton = Style.compose(
  Style.self({
    alignItems: 'center',
    background: t.text.overt,
    border: '0',
    borderRadius: t.radius.md,
    color: t.surface.base,
    cursor: 'pointer',
    display: 'inline-flex',
    font: 'inherit',
    fontSize: t.size.sm,
    fontWeight: t.weight.semibold,
    gap: t.space['2xs'],
    padding: '0.5rem 0.9rem',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  }),
  touchTarget,
  Style.pseudo(':hover:not(:disabled, [aria-disabled="true"])', {
    background: `color-mix(in oklch, ${t.text.overt} 85%, ${t.surface.base})`,
  }),
  Style.pseudo(':is(:disabled, [aria-disabled="true"])', {
    cursor: 'not-allowed',
    opacity: '0.45',
  }),
  Style.pseudo(':focus-visible', {
    outline: `2px solid ${t.accent.default}`,
    outlineOffset: '2px',
  }),
)

/** An entry's state as a pill, colored by its tag: which tone each state takes. */
export const stateTones: Record<string, Recipes.BadgeTone> = {
  Published: 'success',
  Changed: 'warning',
  New: 'info',
  Unpublished: 'warning',
  Archived: 'error',
}

/** An entry's state as a pill: the recipe with the entry's tones. */
export const stateBadge = (attribute: string) =>
  Recipes.Badge({ attribute, tones: stateTones }).badge

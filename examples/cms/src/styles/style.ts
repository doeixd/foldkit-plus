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
import { Recipes, Touch } from 'foldkit-mixins-ui'
import type { StateTag } from 'foldkit-cms'
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

/**
 * Out of sight and still read, as plain declarations: `Style.media` takes
 * declarations, not a `Style`, so the media positions read this while the
 * compose positions read `visuallyHidden` below. One value, two forms.
 */
export const hiddenDeclarations = {
  clipPath: 'inset(50%)',
  height: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const

/** Out of sight and still read: a label a field's placeholder stands in for. */
export const visuallyHidden = Style.self(hiddenDeclarations)

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
  Touch.target,
  Style.pseudo(':hover', { background: t.surface.muted, color: t.text.overt }),
  Style.nest('&[aria-current="page"]', {
    background: t.surface.default,
    color: t.text.overt,
    fontWeight: t.weight.semibold,
  }),
)

/** An entry's state as a pill, colored by its tag: which tone each state takes. */
export const stateTones: Record<StateTag, Recipes.BadgeTone> = {
  Published: 'success',
  Changed: 'warning',
  New: 'info',
  Unpublished: 'warning',
  Archived: 'error',
}

/** An entry's state as a pill: the recipe with the entry's tones. */
export const stateBadge = (attribute: string) =>
  Recipes.Badge({ attribute, tones: stateTones }).badge

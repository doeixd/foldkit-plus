/**
 * The page's look. Tokens come from the shipped theme (`AppStyle.make`), and
 * each section's slots take a recipe: a default selection and the selections an
 * application overrides it with. State visuals read the ARIA the behaviors
 * already write, so no view changes to show them.
 */
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'

const app = AppStyle.make({})

/** Reset, token layer, palette and body defaults. `entry.ts` installs it. */
export const pageStylesheet = app.stylesheet

export const t = app.t
const ink = t.text.overt
export const muted = t.text.muted
const line = t.outline.default
const wash = t.surface.muted
const paper = t.surface.base

export const focus = Style.pseudo(':focus-visible', {
  outline: `${t.border.thick} solid ${t.outline.focus}`,
  outlineOffset: '2px',
})

/** A bordered control: the field, the buttons and the rows draw from it. */
export const control = Style.self({
  font: 'inherit',
  color: ink,
  background: paper,
  border: `${t.border.thin} solid ${line}`,
  borderRadius: t.radius.lg,
  paddingBlock: t.space.xs,
  paddingInline: t.space.sm,
  cursor: 'pointer',
})

export const active = Style.compose(
  Style.pseudo('[data-active]', { background: wash }),
  Style.states({ true: { background: wash } }, 'aria-selected'),
)

export const dimmed = Style.states(
  { true: { opacity: '0.45', cursor: 'not-allowed' } },
  'aria-disabled',
)

export const panel = Style.self({
  background: paper,
  border: `${t.border.thin} solid ${line}`,
  borderRadius: t.radius.lg,
  overflow: 'hidden',
})

export const heldRow = Style.states(
  { held: { outline: `2px dashed ${t.outline.focus}` } },
  'data-reorder',
)

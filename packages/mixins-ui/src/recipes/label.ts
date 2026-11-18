/**
 * A form label: semibold at the small size, pointing at its control. A
 * marker says the field is required (the error ink) or optional (muted), a
 * disabled label is dimmed, an invalid one reads in the error ink, and a
 * `trailing` drawing stands beside it in a row of its own. Nothing here
 * varies; the recipe is the look, chosen once.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { LabelSlots } from '../label.js'
import { component, ref } from './design.js'

export const Label = Style.recipeFor(LabelSlots)({
  base: {
    label: component(
      Style.self({
        display: 'block',
        marginBlockEnd: ref.space['3xs'],
        ...role('body'),
        fontWeight: ref.weight.semibold,
        color: ref.text.overt,
      }),
      Style.pseudo('[data-invalid]', { color: ref.error.ink }),
      Style.pseudo('[data-disabled]', {
        cursor: 'not-allowed',
        opacity: ref.knob['state-disabled'],
      }),
    ),
    marker: component(
      Style.self({ fontWeight: ref.weight.normal, marginInlineStart: ref.space['3xs'] }),
      Style.pseudo('[data-kind="required"]', { color: ref.error.ink }),
      Style.pseudo('[data-kind="optional"]', { color: ref.text.muted }),
    ),
    // The label and what stands beside it, on one line; the label's own room below moves to the row.
    root: component(
      Style.self({
        alignItems: 'center',
        display: 'flex',
        gap: ref.space['2xs'],
        marginBlockEnd: ref.space['3xs'],
      }),
      Style.nest('& > label', { marginBlockEnd: '0' }),
    ),
    trailing: component(
      Style.self({ alignItems: 'center', color: ref.text.muted, display: 'inline-flex' }),
    ),
  },
})

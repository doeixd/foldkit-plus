/**
 * A form label: semibold at the small size, pointing at its control.
 * Nothing here varies; the recipe is the look, chosen once.
 */
import { Style } from 'foldkit-mixins'
import { LabelSlots } from '../label.js'
import { component, ref } from './design.js'

export const Label = Style.recipeFor(LabelSlots)({
  base: {
    label: component(
      Style.self({
        display: 'block',
        marginBlockEnd: ref.space['3xs'],
        fontSize: ref.size.sm,
        fontWeight: ref.weight.semibold,
        color: ref.text.overt,
      }),
    ),
  },
})

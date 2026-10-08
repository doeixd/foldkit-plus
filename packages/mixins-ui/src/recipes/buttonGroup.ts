/**
 * A button group: one joined row, borders overlapping by exactly the border
 * width, inner corners squared and outer corners left to the buttons. Only
 * the joining sides are ever zeroed, so any button radius still reads; a
 * lone button is untouched.
 */
import { Style } from 'foldkit-mixins'
import { ButtonGroupSlots } from '../buttonGroup.js'
import { component, ref } from './design.js'

const overlap = `calc(-1 * ${ref.border.thin})`

export const ButtonGroup = Style.recipeFor(ButtonGroupSlots)({
  base: {
    root: component(
      Style.self({ display: 'inline-flex', alignItems: 'stretch' }),
      Style.nest('& > * + *', { marginInlineStart: overlap }),
      Style.nest('& > :first-child:not(:only-child)', {
        borderStartEndRadius: '0',
        borderEndEndRadius: '0',
      }),
      Style.nest('& > * + *:not(:last-child)', {
        borderRadius: '0',
      }),
      Style.nest('& > :last-child:not(:only-child)', {
        borderStartStartRadius: '0',
        borderEndStartRadius: '0',
      }),
    ),
  },
})

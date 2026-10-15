/**
 * A checkbox group: a legend over rows, each a checkbox beside its words, on
 * the size ladder. The checkbox and its label are the Checkbox recipe's own
 * pieces. `variant` leaves the rows `plain`, or draws them as a `list` whose
 * checked rows fill, and merge into one block where they stand together, as
 * Fluid Functionalism's checkbox group does.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { CheckboxGroupSlots } from '../checkboxGroup.js'
import { component, ref, variant } from './design.js'
import { Checkbox } from './toggle.js'

const checked = '[data-checked="true"]'
const box = Checkbox({})

export const CheckboxGroup = Style.recipeFor(CheckboxGroupSlots)({
  base: {
    root: component(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        margin: '0',
        padding: '0',
        border: '0',
      }),
    ),
    legend: component(
      Style.self({
        padding: '0',
        marginBlockEnd: ladder('gap'),
        color: ref.text.overt,
        ...role('body'),
        fontWeight: ref.weight.semibold,
      }),
    ),
    option: component(
      Style.self({
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        alignItems: 'center',
        columnGap: ladder('gap'),
        minBlockSize: ladder('height'),
        borderRadius: ref.radius.md,
      }),
    ),
    checkbox: box.checkbox ?? Style.empty,
    label: box.label ?? Style.empty,
    description: component(
      Style.self({ gridColumn: '2', margin: '0', color: ref.text.muted, ...role('caption') }),
    ),
  },
  variants: {
    variant: {
      plain: { option: variant(Style.self({})) },
      list: {
        option: variant(
          Style.self({ paddingInline: ladder('row-pad') }),
          Style.pseudo(checked, { background: ref.accent.subtle }),
          // Checked rows together read as one block: the corners between them square off.
          Style.pseudo(`${checked}:has(+ ${checked})`, {
            borderEndStartRadius: '0',
            borderEndEndRadius: '0',
          }),
          Style.nest(`${checked} + &${checked}`, {
            borderStartStartRadius: '0',
            borderStartEndRadius: '0',
          }),
        ),
      },
    },
  },
  defaults: { variant: 'plain' },
})

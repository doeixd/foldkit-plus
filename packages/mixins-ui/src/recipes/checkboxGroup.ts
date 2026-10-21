/**
 * A checkbox group: a legend over rows, each a checkbox beside its words, on
 * the size ladder. The checkbox and its label are the Checkbox recipe's own
 * pieces. `variant` leaves the rows `plain`, or draws them as a `list` whose
 * checked rows fill, and merge into one block where they stand together, as
 * Fluid Functionalism's checkbox group does. `orientation` lays the rows in
 * a column or a wrapping row. The rows sit in their own box, so the legend
 * and an error stay stacked while the rows sit beside each other.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { CheckboxGroupSlots } from '../checkboxGroup.js'
import { component, ref, variant } from './design.js'
import { Checkbox } from './toggle.js'

const checked = '[data-checked="true"]'
const dimmed = ':where(:has(> [aria-disabled="true"])) > &'
const box = Checkbox({})

/** Checked rows together read as one block: the corners between them square off. */
const merged = variant(
  Style.pseudo(`${checked}:has(+ ${checked})`, {
    borderEndStartRadius: '0',
    borderEndEndRadius: '0',
  }),
  Style.nest(`${checked} + &${checked}`, {
    borderStartStartRadius: '0',
    borderStartEndRadius: '0',
  }),
)

export const CheckboxGroup = Style.recipeFor(CheckboxGroupSlots)({
  base: {
    root: component(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        gap: ladder('gap'),
        margin: '0',
        padding: '0',
        border: '0',
        minInlineSize: '0',
      }),
    ),
    // A rendered legend is no flex item, so the root's gap misses it: its own margin, the same.
    legend: component(
      Style.self({
        padding: '0',
        marginBlockEnd: ladder('gap'),
        color: ref.text.overt,
        ...role('body'),
        fontWeight: ref.weight.semibold,
      }),
      Style.nest(':is([aria-invalid="true"]) > &', { color: ref.error.ink }),
    ),
    options: component(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        gap: ladder('gap'),
        margin: '0',
        padding: '0',
      }),
    ),
    option: component(
      Style.self({
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        alignContent: 'start',
        columnGap: ladder('gap'),
        rowGap: ladder('inset'),
        // No height of its own: a row is as tall as its words, so a plain row
        // and one with a description stand the same gap from the next.
        borderRadius: ref.radius.md,
      }),
      // Under a select-all row, the options stand in from its box by one box and its gap.
      Style.nest(':where([data-all]) ~ &', {
        marginInlineStart: `calc(${ladder('icon')} + ${ladder('gap')})`,
      }),
    ),
    // In the label's row only, so a description under it does not pull the box down.
    checkbox: Style.compose(
      box.checkbox ?? Style.empty,
      component(Style.self({ gridRow: '1', alignSelf: 'center' })),
    ),
    // A disabled option's words dim with its box.
    label: Style.compose(
      box.label ?? Style.empty,
      component(Style.nest(dimmed, { opacity: ref.knob['state-disabled'] })),
    ),
    description: component(
      Style.self({ gridColumn: '2', margin: '0', color: ref.text.muted, ...role('caption') }),
      Style.nest(dimmed, { opacity: ref.knob['state-disabled'] }),
    ),
    error: component(Style.self({ margin: '0', color: ref.error.ink, ...role('caption') })),
  },
  variants: {
    variant: {
      plain: { option: variant(Style.self({})) },
      list: {
        option: variant(
          Style.self({
            paddingInline: ladder('row-pad'),
            paddingBlock: ladder('inset'),
          }),
          Style.pseudo(checked, { background: ref.accent.subtle }),
        ),
      },
    },
    orientation: {
      vertical: { options: variant(Style.self({})) },
      horizontal: {
        options: variant(
          Style.self({
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
          }),
        ),
        option: variant(Style.self({ inlineSize: 'max-content' })),
      },
    },
  },
  defaults: { variant: 'plain', orientation: 'vertical' },
  compound: [
    {
      // A gap would split the block the squared corners are pretending to be.
      when: { variant: 'list', orientation: 'vertical' },
      style: { options: variant(Style.self({ gap: '0' })), option: merged },
    },
  ],
})

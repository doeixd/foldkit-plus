import * as UiCheckbox from '@foldkit/ui/checkbox'
import type { NamedStyle } from 'foldkit-mixins'
import * as Checkbox from '../checkbox.js'
import type { TableSelectionControl } from '../table.js'

/**
 * The selection box of a row, drawn by Checkbox. Pass it as `selection.control`;
 * `style` is a style of `CheckboxSlots` for the boxes' look. A table that
 * selects nothing, or draws its own control, never imports Checkbox.
 */
export const checkboxes = (
  style?: NamedStyle<typeof Checkbox.CheckboxSlots>,
): TableSelectionControl => ({
  draw: (input, h) =>
    UiCheckbox.view(
      {
        id: input.id,
        isChecked: input.checked,
        isIndeterminate: input.indeterminate,
        onToggle: input.onToggle,
        toView: Checkbox.toView(style === undefined ? [] : [style.mixin], { h }, resolved =>
          (input.cell === 'th' ? h.th : h.td)(input.cellAttributes(), [
            h.button(resolved.checkbox, []),
            h.span(input.labelAttributes(resolved.label), [input.label]),
          ]),
        ),
      },
      h,
    ),
})

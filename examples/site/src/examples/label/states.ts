import { Input, Label, LabelSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

const Field = Recipes.Input.style({})

// `disabled` and `invalid` only mark the label (`data-disabled`, `data-invalid`):
// the control carries its own state, so pass both the same value.
export default example({
  title: 'Disabled and invalid',
  slots: LabelSlots,
  recipe: Recipes.Label,
  view: ({ style, h }) =>
    stack(h, [
      Label.view({ for: 'label-locked', text: 'Account id', disabled: true, style }, h),
      Input.view(
        {
          id: 'label-locked',
          disabled: true,
          style: Field,
          draw: (resolved, h) => h.input(resolved.input),
        },
        h,
      ),
      Label.view({ for: 'label-bad', text: 'Email address', invalid: true, style }, h),
      Input.view(
        {
          id: 'label-bad',
          invalid: true,
          style: Field,
          draw: (resolved, h) => h.input(resolved.input),
        },
        h,
      ),
    ]),
})

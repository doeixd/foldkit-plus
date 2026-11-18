import { Fieldset, FieldsetSlots, Input, InputSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

const Control = forSlots(InputSlots)(Recipes.Input({}))

// `view` draws the native fieldset: a legend that names the group, an optional
// description, and the content you drew. `disabled` turns off every control inside.
export default example({
  title: 'Enabled and disabled',
  slots: FieldsetSlots,
  recipe: Recipes.Fieldset,
  pins: { variant: 'bordered' },
  view: ({ style, h }) =>
    stack(
      h,
      [false, true].map(disabled => {
        const id = disabled ? 'billing' : 'shipping'
        return Fieldset.view(
          {
            id,
            legend: disabled ? 'Billing address (locked)' : 'Shipping address',
            description: 'Where the order is sent. We never share it.',
            disabled,
            content: [Input.view({ id: `${id}-street`, label: 'Street', style: Control }, h)],
            style,
          },
          h,
        )
      }),
    ),
})

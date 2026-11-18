import { Input, InputSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

// What a form reads: the `name` a value submits under, `required`, and a
// `readOnly` value, which can be selected and is submitted with the rest.
// `invalid` and `disabled` mark the field as a whole, adornments included.
export default example({
  title: 'In a form, and its states',
  slots: InputSlots,
  recipe: Recipes.Input,
  view: ({ style, h }) =>
    stack(
      h,
      [
        Input.view(
          {
            id: 'phone',
            name: 'phone',
            label: 'Phone',
            type: 'tel',
            inputMode: 'tel',
            required: true,
            placeholder: '+1 555 0100',
            style,
          },
          h,
        ),
        Input.view(
          { id: 'order', name: 'order', label: 'Order', value: 'ORD-2041', readOnly: true, style },
          h,
        ),
        Input.view(
          {
            id: 'code',
            label: 'Promo code',
            description: 'That code has expired.',
            value: 'SPRING',
            invalid: true,
            style,
          },
          h,
        ),
        Input.view(
          {
            id: 'region',
            label: 'Region',
            value: 'eu-west',
            disabled: true,
            start: h.span([], ['region:']),
            style,
          },
          h,
        ),
      ],
      [h.Style({ alignItems: 'stretch', inlineSize: 'min(20rem, 100%)' })],
    ),
})

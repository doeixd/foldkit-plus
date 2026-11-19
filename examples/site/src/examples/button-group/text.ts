import { Button, ButtonGroup, ButtonGroupSlots, Input, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

const Square = Recipes.Button.style({ tone: 'neutral', variant: 'outline', shape: 'square' })
const Field = Recipes.Input.style({})

// Words are an item too, drawn in the group's `text` box: here a field's
// fixed prefix.
export default example({
  title: 'Text',
  slots: ButtonGroupSlots,
  recipe: Recipes.ButtonGroup,
  pins: { width: 'fill' },
  view: ({ style, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(100%, 24rem)' })],
      [
        ButtonGroup.view(
          {
            label: 'Site address',
            items: [
              'https://',
              Input.view(
                {
                  id: 'group-site',
                  placeholder: 'example.com',
                  style: Field,
                  draw: (resolved, h) => h.input([...resolved.input, h.AriaLabel('Site address')]),
                },
                h,
              ),
              Button.view(
                {
                  label: 'Copy address',
                  icon: outline(h, 'M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3'),
                  style: Square,
                },
                h,
              ),
            ],
            style,
          },
          h,
        ),
      ],
    ),
})

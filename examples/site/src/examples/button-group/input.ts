import { Button, ButtonGroup, ButtonGroupSlots, Input, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

const Face = Recipes.Button.style({ tone: 'neutral', variant: 'outline' })
const Field = Recipes.Input.style({})

// A field joins the buttons like any other item, and takes the room they leave:
// the group spans its container.
export default example({
  title: 'Input',
  slots: ButtonGroupSlots,
  recipe: Recipes.ButtonGroup,
  pins: { width: 'fill' },
  view: ({ style, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(100%, 24rem)' })],
      [
        ButtonGroup.view(
          {
            label: 'Search',
            items: [
              Input.view(
                {
                  id: 'group-search',
                  type: 'search',
                  placeholder: 'Search issues',
                  style: Field,
                  draw: (resolved, h) => h.input([...resolved.input, h.AriaLabel('Search issues')]),
                },
                h,
              ),
              Button.view(
                {
                  label: 'Search',
                  icon: outline(
                    h,
                    'M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM14.5 14.5l-3.6-3.6',
                  ),
                  style: Face,
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

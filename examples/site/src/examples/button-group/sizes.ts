import { Button, ButtonGroup, ButtonGroupSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { stack } from '../../snippets/layout.js'

const Face = Recipes.Button.style({ tone: 'neutral', variant: 'outline' })
const Square = Recipes.Button.style({ tone: 'neutral', variant: 'outline', shape: 'square' })
const Sizes = (['sm', 'md', 'lg'] as const).map(size => Recipes.ButtonGroup.style({ size }))

const alignments = [
  { label: 'Align left', icon: 'M2 3.5h12M2 6.5h8M2 9.5h12M2 12.5h8' },
  { label: 'Align center', icon: 'M2 3.5h12M4 6.5h8M2 9.5h12M4 12.5h8' },
  { label: 'Align right', icon: 'M2 3.5h12M6 6.5h8M2 9.5h12M6 12.5h8' },
]

// The group's `size` steps every item that has no size of its own.
export default example({
  title: 'Sizes',
  slots: ButtonGroupSlots,
  recipe: Recipes.ButtonGroup,
  pins: { size: 'md' },
  view: ({ h }) =>
    stack(
      h,
      Sizes.map(style =>
        ButtonGroup.view(
          {
            label: 'Text alignment',
            items: [
              ...alignments.map(({ label, icon }) =>
                Button.view({ label, icon: outline(h, icon), style: Square }, h),
              ),
              Button.view({ label: 'More', style: Face }, h),
            ],
            style,
          },
          h,
        ),
      ),
    ),
})

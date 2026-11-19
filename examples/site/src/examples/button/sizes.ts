import { Button, ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// `size` is one ladder of names, `xs` to `lg`, so each step is a style of
// its own and the same call draws all four.
const steps = (['xs', 'sm', 'md', 'lg'] as const).map(size => Recipes.Button.style({ size }))

export default example({
  title: 'Sizes',
  slots: ButtonSlots,
  recipe: Recipes.Button,
  pins: { size: 'md' },
  view: ({ h }) =>
    row(
      h,
      steps.map((style, index) =>
        Button.view({ label: ['Extra small', 'Small', 'Medium', 'Large'][index]!, style }, h),
      ),
    ),
})

import { Icon, IconSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'
import { icons } from '../../view/iconData.js'

const Sizes = (['xs', 'sm', 'md', 'lg', 'xl'] as const).map(size => Recipes.Icon.style({ size }))

// With no size an icon stands on the size ladder, so it steps with the control
// it sits in; a size fixes it to the type scale, `xs` to `xl`.
export default example({
  title: 'Sizes',
  slots: IconSlots,
  recipe: Recipes.Icon,
  pins: { size: 'md' },
  view: ({ h }) =>
    row(
      h,
      Sizes.map((style, index) => Icon.view({ icon: icons.check, key: `size-${index}`, style }, h)),
    ),
})

import { Recipes, Steps, StepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

// A step's `icon` stands in its marker for the number, until the step is done.
export default example({
  title: 'Icons',
  slots: StepsSlots,
  recipe: Recipes.Steps,
  view: ({ style, h }) =>
    Steps.view(
      {
        label: 'Shipping',
        steps: [
          { title: 'Ordered', icon: outline(h, 'M3 4h10l-1 8H4zM6 4a2 2 0 0 1 4 0') },
          { title: 'Packed', icon: outline(h, 'M2 5l6-3 6 3v6l-6 3-6-3zM2 5l6 3 6-3M8 8v6') },
          { title: 'Shipped', icon: outline(h, 'M1 4h8v7H1zM9 7h3l3 3v1H9M4 13h1M11 13h1') },
          { title: 'Delivered', icon: outline(h, 'M2 7l6-5 6 5v7H2zM6 14v-4h4v4') },
        ],
        current: 2,
        style,
      },
      h,
    ),
})

import { Breadcrumb, BreadcrumbSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The current page is text, marked `aria-current`; every other step is a link.
export default example({
  title: 'Basic',
  slots: BreadcrumbSlots,
  recipe: Recipes.Breadcrumb,
  view: ({ style, h }) =>
    Breadcrumb.view(
      {
        steps: [
          { label: 'Home', href: '#' },
          { label: 'Components', href: '#' },
          { label: 'Breadcrumb', current: true },
        ],
        style,
      },
      h,
    ),
})

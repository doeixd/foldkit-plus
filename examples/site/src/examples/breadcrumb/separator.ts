import { Breadcrumb, BreadcrumbSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A separator of the view's own stands in for the recipe's.
export default example({
  title: 'A separator of your own',
  slots: BreadcrumbSlots,
  recipe: Recipes.Breadcrumb,
  view: ({ style, h }) =>
    Breadcrumb.view(
      {
        steps: [
          { label: 'Settings', href: '#' },
          { label: 'Billing', href: '#' },
          { label: 'Invoices', current: true },
        ],
        separator: h.span([], ['→']),
        style,
      },
      h,
    ),
})

import { Breadcrumb, BreadcrumbSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A fold of the application's own: `collapse` takes any value with a `max` and
// a `draw`, here an ellipsis that is a link to a page of the whole trail.
export default example({
  title: 'A fold of your own',
  slots: BreadcrumbSlots,
  recipe: Recipes.Breadcrumb,
  view: ({ style, h }) =>
    Breadcrumb.view(
      {
        steps: [
          { label: 'Home', href: '#' },
          { label: 'Docs', href: '#' },
          { label: 'Packages', href: '#' },
          { label: 'Mixins', href: '#' },
          { label: 'Breadcrumb', current: true },
        ],
        collapse: {
          max: 3,
          draw: ({ label, ellipsis, builders }, builder) =>
            builder.a(builders.ellipsis.attrs([builder.Href('#all'), builder.AriaLabel(label)]), [
              ellipsis,
            ]),
        },
        style,
      },
      h,
    ),
})

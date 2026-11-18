import { Breadcrumb, BreadcrumbSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

// `labelHidden` draws the icon alone and keeps the label as the step's name;
// `trailing` draws a count or a badge after the words.
export default example({
  title: 'Icon only, and a count',
  slots: BreadcrumbSlots,
  recipe: Recipes.Breadcrumb,
  view: ({ style, h }) =>
    Breadcrumb.view(
      {
        steps: [
          {
            label: 'Home',
            href: '#',
            icon: outline(h, 'M2 7l6-5 6 5v7H2zM6 14v-4h4v4'),
            labelHidden: true,
          },
          { label: 'Inbox', href: '#', trailing: h.span([], ['12']) },
          { label: 'Invoices', current: true, trailing: h.span([], ['3']) },
        ],
        style,
      },
      h,
    ),
})

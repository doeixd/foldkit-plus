import { Breadcrumb, BreadcrumbSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

// An icon before a step's words, hidden from assistive technology.
export default example({
  title: 'Icons',
  slots: BreadcrumbSlots,
  recipe: Recipes.Breadcrumb,
  view: ({ style, h }) =>
    Breadcrumb.view(
      {
        steps: [
          { label: 'Home', href: '#', icon: outline(h, 'M2 7l6-5 6 5v7H2zM6 14v-4h4v4') },
          { label: 'Projects', href: '#', icon: outline(h, 'M1 3h5l2 2h7v8H1z') },
          { label: 'Roadmap.md', current: true, icon: outline(h, 'M3 1h7l3 3v11H3zM10 1v3h3') },
        ],
        style,
      },
      h,
    ),
})

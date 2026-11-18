import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Breadcrumb, BreadcrumbSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Message = defineMessageUnion({ Expanded: {} })

const steps = [
  { label: 'Home', href: '#' },
  { label: 'Docs', href: '#' },
  { label: 'Packages', href: '#' },
  { label: 'Mixins', href: '#' },
  { label: 'Recipes', href: '#' },
  { label: 'Breadcrumb', current: true },
]

// A long trail folds its middle into an ellipsis. A press sends `onExpand`;
// whether the trail is folded is the application's own state, so it answers
// by drawing the trail without `collapse`.
export default example({
  title: 'Collapsed',
  slots: BreadcrumbSlots,
  recipe: Recipes.Breadcrumb,
  state: {
    Model: Schema.Boolean,
    Message,
    init: () => ({ model: false }),
    update: () => ({ model: true }),
  },
  view: ({ style, model: expanded, onMessage, h }) =>
    Breadcrumb.view(
      {
        steps,
        ...(expanded ? {} : { collapse: { max: 3, onExpand: onMessage(Message.Expanded()) } }),
        style,
      },
      h,
    ),
})

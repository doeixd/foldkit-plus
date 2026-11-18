import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Breadcrumb, BreadcrumbSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Message = defineMessageUnion({ Expanded: {} })

const steps = [
  { label: 'Accueil', href: '#' },
  { label: 'Guides', href: '#' },
  { label: 'Composants', href: '#' },
  { label: 'Recettes', href: '#' },
  { label: 'Fil d’Ariane', current: true },
]

// The landmark's name, the ellipsis's name (`{count}` fills the steps it
// hides) and its mark are words: text with blanks, in the reader's language.
export default example({
  title: 'In another language',
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
        words: { label: 'Fil d’Ariane', more: 'Afficher {count} de plus', ellipsis: '···' },
        steps,
        ...(expanded ? {} : { collapse: { max: 3, onExpand: onMessage(Message.Expanded()) } }),
        style,
      },
      h,
    ),
})

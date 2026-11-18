import { Bundles, CascadeSelect, CascadeSelectSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

interface Category {
  readonly id: string
  readonly label: string
  readonly parent?: string
}

// Rows with a parent pointer, as a database holds them.
const categories: ReadonlyArray<Category> = [
  { id: 'tools', label: 'Tools' },
  { id: 'hand', label: 'Hand tools', parent: 'tools' },
  { id: 'saw', label: 'Saws', parent: 'hand' },
  { id: 'power', label: 'Power tools', parent: 'tools' },
  { id: 'garden', label: 'Garden' },
  { id: 'soil', label: 'Soil', parent: 'garden' },
]

// The tree the select takes is the application's to build, once.
const childrenOf = (parent: string | undefined): ReadonlyArray<CascadeSelect.Node> =>
  categories
    .filter(category => category.parent === parent)
    .map(({ id, label }) => {
      const children = childrenOf(id)
      return children.length === 0 ? { id, label } : { id, label, children }
    })

const Catalog: CascadeSelect.Config = { nodes: childrenOf(undefined) }

export default example({
  title: 'From rows with a parent',
  slots: CascadeSelectSlots,
  recipe: Recipes.CascadeSelect,
  state: Bundles.CascadeSelect.with({ id: 'category', config: Catalog }),
  view: ({ style, model, onMessage, h }) =>
    CascadeSelect.view(
      {
        model,
        config: Catalog,
        onMessage,
        label: 'Category',
        placeholder: 'Choose a category',
        style,
      },
      h,
    ),
})

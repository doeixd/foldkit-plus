import { Bundles, Recipes, TreeView, TreeViewSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Guided = forSlots(TreeViewSlots)(Recipes.TreeView({ guides: 'lines' }))

// What every tree of an application starts from: its look and its glide, said
// once. `fluid` is a value, so a tree that names it is the only one to ship it.
const AppTree = TreeView.configure({
  base: { style: Guided, mixins: TreeView.fluid },
  presets: { right: { direction: 'rtl' } },
})

const topics: ReadonlyArray<TreeView.TreeNode> = [
  {
    id: 'guides',
    label: 'Guides',
    children: [
      { id: 'start', label: 'Getting started' },
      { id: 'theme', label: 'Theming' },
    ],
  },
  { id: 'api', label: 'API' },
]

export default example({
  title: 'Configure once',
  slots: TreeViewSlots,
  recipe: Recipes.TreeView,
  state: Bundles.TreeView.with({ id: 'tree-configure', nodes: topics, open: ['guides'] }),
  view: ({ model, onMessage, h }) =>
    h.div(
      [h.Style({ inlineSize: '16rem' })],
      [AppTree.view({ label: 'Docs', model, nodes: topics, onMessage }, h)],
    ),
})

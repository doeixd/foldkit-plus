import { Option } from 'effect'
import { Bundles, Recipes, TreeView, TreeViewSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The tree's structure goes to the Bundle once: its keys, typeahead and checks
// read it. The view is given the same tree. `TreeView.fluid` glides one hover
// from row to row, after the pointer and the keys.
const files: ReadonlyArray<TreeView.TreeNode> = [
  {
    id: 'src',
    label: 'src',
    children: [
      {
        id: 'components',
        label: 'components',
        children: [
          { id: 'button', label: 'button.ts' },
          { id: 'tree', label: 'tree.ts' },
        ],
      },
      { id: 'index', label: 'index.ts' },
    ],
  },
  { id: 'tests', label: 'tests', children: [{ id: 'tree-test', label: 'tree.test.ts' }] },
  { id: 'lock', label: 'pnpm-lock.yaml', disabled: true },
  { id: 'readme', label: 'README.md' },
]

export default example({
  title: 'Basic',
  slots: TreeViewSlots,
  recipe: Recipes.TreeView,
  state: Bundles.TreeView.with({ id: 'tree-basic', nodes: files, open: ['src'] }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ display: 'grid', gap: '0.75rem', inlineSize: '16rem' })],
      [
        TreeView.view(
          { label: 'Files', model, nodes: files, onMessage, style, mixins: TreeView.fluid },
          h,
        ),
        h.p(
          [],
          [
            Option.match(model.selected, {
              onNone: () => 'Nothing chosen yet.',
              onSome: id => `Chose ${id}.`,
            }),
          ],
        ),
      ],
    ),
})

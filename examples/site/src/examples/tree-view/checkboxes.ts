import { Bundles, Recipes, TreeView, TreeViewSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const files: ReadonlyArray<TreeView.TreeNode> = [
  {
    id: 'src',
    label: 'src',
    children: [
      { id: 'index', label: 'index.ts' },
      {
        id: 'components',
        label: 'components',
        children: [
          { id: 'button', label: 'button.ts' },
          { id: 'tree', label: 'tree.ts' },
        ],
      },
    ],
  },
  { id: 'readme', label: 'README.md' },
]

// `checkable` is stated once, in the Bundle's args: its `update` and the view
// both read it from the Model. `checked` holds the files alone; a folder reads
// checked or mixed from them. `checkedAs('trunk')` lists the outermost fully
// checked rows, so a checked folder stands for everything in it.
export default example({
  title: 'Checkboxes',
  slots: TreeViewSlots,
  recipe: Recipes.TreeView,
  state: Bundles.TreeView.with({
    id: 'tree-checks',
    nodes: files,
    checkable: true,
    open: ['src'],
    checked: ['index'],
  }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ display: 'grid', gap: '0.75rem', inlineSize: '16rem' })],
      [
        TreeView.view(
          {
            label: 'Files to commit',
            model,
            nodes: files,
            onMessage,
            style,
            mixins: TreeView.fluid,
          },
          h,
        ),
        h.p(
          [],
          [
            model.checked.length === 0
              ? 'Nothing staged.'
              : `Staged: ${TreeView.checkedAs(files, model.checked, 'trunk').join(', ')}.`,
          ],
        ),
      ],
    ),
})

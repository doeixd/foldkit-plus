import { Bundles, Recipes, TreeView, TreeViewSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

const FOLDER = 'M1.5 4.5h4l1.5 1.5h7.5v6.5h-13z'
const FOLDER_OPEN = 'M1.5 4.5h4l1.5 1.5h6v2M1.5 12.5l2-4.5h11l-2 4.5z'
const FILE = 'M4 1.5h5l3 3v10H4zM9 1.5v3h3'

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

// A folder or file before each label, and a guide down each open folder. An
// icon is drawn by the view's builder, so the view decorates the tree the
// Bundle holds the structure of.
export default example({
  title: 'Icons and guides',
  slots: TreeViewSlots,
  recipe: Recipes.TreeView,
  pins: { guides: 'lines' },
  state: Bundles.TreeView.with({ id: 'tree-icons', nodes: files, open: ['src'] }),
  view: ({ style, model, onMessage, h }) => {
    const decorated = (level: ReadonlyArray<TreeView.TreeNode>): ReadonlyArray<TreeView.TreeNode> =>
      level.map(node =>
        node.children !== undefined
          ? {
              ...node,
              icon: outline(h, FOLDER),
              openIcon: outline(h, FOLDER_OPEN),
              children: decorated(node.children),
            }
          : { ...node, icon: outline(h, FILE) },
      )
    return h.div(
      [h.Style({ inlineSize: '16rem' })],
      [
        TreeView.view(
          {
            label: 'Files',
            model,
            nodes: decorated(files),
            onMessage,
            style,
            mixins: TreeView.fluid,
          },
          h,
        ),
      ],
    )
  },
})

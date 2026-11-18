import {
  Avatar,
  AvatarSlots,
  Badge,
  BadgeSlots,
  Bundles,
  Recipes,
  TreeView,
  TreeViewSlots,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { portrait } from '../../snippets/portrait.js'
import { forSlots } from '../../snippets/theme.js'

const Face = forSlots(AvatarSlots)(Recipes.Avatar({ size: 'xs' }))
const Mark = forSlots(BadgeSlots)(Recipes.Badge({}))

const org: ReadonlyArray<TreeView.TreeNode> = [
  {
    id: 'eng',
    label: 'Engineering',
    children: [
      { id: 'ada', label: 'Ada Lovelace' },
      { id: 'alan', label: 'Alan Turing' },
    ],
  },
  { id: 'ops', label: 'Operations', children: [{ id: 'grace', label: 'Grace Hopper' }] },
]

// A node's `content` is drawn in place of its label (which still names the row
// and is what typing matches), `trailing` after it and `action` at the row's
// end. All three are Html, so the avatar, the role and the button are the
// application's own.
export default example({
  title: 'People and roles',
  slots: TreeViewSlots,
  recipe: Recipes.TreeView,
  state: Bundles.TreeView.with({ id: 'tree-people', nodes: org, open: ['eng'] }),
  view: ({ style, model, onMessage, h }) => {
    const person = (id: string, name: string, role: string, hue: number): TreeView.TreeNode => ({
      id,
      label: name,
      icon: Avatar.view({ name, src: portrait(hue), style: Face }, h),
      trailing: Badge.view({ text: role, style: Mark }, h),
    })
    const nodes: ReadonlyArray<TreeView.TreeNode> = [
      {
        ...org[0]!,
        children: [
          person('ada', 'Ada Lovelace', 'Lead', 210),
          person('alan', 'Alan Turing', 'Staff', 140),
        ],
      },
      { ...org[1]!, children: [person('grace', 'Grace Hopper', 'Lead', 20)] },
    ]
    return h.div(
      [h.Style({ inlineSize: '20rem' })],
      [
        TreeView.view(
          { label: 'People', model, nodes, onMessage, style, mixins: TreeView.fluid },
          h,
        ),
      ],
    )
  },
})

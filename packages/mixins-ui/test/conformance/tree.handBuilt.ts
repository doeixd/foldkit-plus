/**
 * A tree assembled from `TreeNavigation` alone: the primitive writes each
 * showing row's role, level, position and `aria-expanded`, and the keys; the
 * view only nests what is open and says the tree's name.
 */
import { Option, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { TreeNavigation } from 'foldkit-primitives/interaction'
import { A11y, Attr, Behavior, Capability, Event, Slot, Slots, SlotView } from 'foldkit-mixins'

const Nav = Bundle.declare(TreeNavigation.bundle, 'nav')

const Model = Schema.Struct({ ...Nav.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Nav.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

const args = { openByDefault: false } as const

const Parts = Slots.define({
  tree: Slot.make({
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  treeitem: Slot.make({ capability: Capability.Focusable, attributes: [Attr.Role] }),
  group: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

export interface Node {
  readonly id: string
  readonly label: string
  readonly children?: ReadonlyArray<Node> | undefined
}

interface Input extends Model {
  readonly nodes: ReadonlyArray<Node>
  readonly direction: 'ltr' | 'rtl'
}

const Pattern = A11y.pattern({
  tree: { capability: Capability.Interactive, obligations: [A11y.Navigation, A11y.Name] },
  treeitem: { capability: Capability.Focusable, obligations: [A11y.FocusStrategy] },
})

const Tree = SlotView.over(Parts)<Input, Message>()

const rowsOf = (
  nodes: ReadonlyArray<Node>,
  parent: string | null = null,
): ReadonlyArray<TreeNavigation.Row> =>
  nodes.flatMap(node => [
    { id: node.id, parent, branch: (node.children ?? []).length > 0 },
    ...rowsOf(node.children ?? [], node.id),
  ])

const view = Tree.define(
  (input, slots, h) => {
    const draw = (level: ReadonlyArray<Node>): ReadonlyArray<Html> =>
      level.map((node, index) => {
        const children = node.children ?? []
        const open = TreeNavigation.isOpen(input.nav, args, node.id)
        return h.li(slots.treeitem.attrs([], { id: node.id, index }), [
          h.span([], [node.label]),
          ...(children.length > 0 && open
            ? [h.ul(slots.group.attrs([h.Role('group')]), draw(children))]
            : []),
        ])
      })
    return h.ul(
      slots.tree.attrs([h.Role('tree'), h.AriaLabel('Files'), h.Dir(input.direction)]),
      draw(input.nodes),
    )
  },
  { name: 'HandBuiltTree' },
).pipe(
  Behavior.attach(
    TreeNavigation.behavior(Nav, args)(Tree)({
      container: 'tree',
      item: 'treeitem',
      rows: input => rowsOf(input.nodes),
      direction: input => input.direction,
    }),
  ),
  SlotView.attach(A11y.base({ tree: [A11y.Name] })),
  A11y.conform(Pattern),
)

export const mount = (nodes: ReadonlyArray<Node>, direction: 'ltr' | 'rtl') => {
  const placed = Page.at(Nav, { args })
  const container = document.createElement('div')
  container.id = 'conformance-hand-tree'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { nav: { current: null, toggled: [] } } }),
      update: (model: Model, message: Message) =>
        Option.getOrElse(placed.update(model, message), () => ({ model })),
      view: (model: Model, h: HtmlBuilder<Message>) => view({ ...model, nodes, direction }, h),
    }),
  )
}

/** The tree as a server draws it: every parent shut. */
export const served = (nodes: ReadonlyArray<Node>, h: HtmlBuilder<Message>) =>
  view({ nav: { current: null, toggled: [] }, nodes, direction: 'ltr' }, h)

export type { Message }

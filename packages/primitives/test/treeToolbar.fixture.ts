/**
 * A panel holding an input and a tree whose first row holds a toolbar, each
 * roving widget a real primitive: `TreeNavigation` on the tree, a
 * `RovingTabindex` on the toolbar, and optionally `FocusRecovery` on the
 * panel. A row is removed through a Port, so focus stays where it was until
 * the removal is drawn.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Port from 'foldkit/port'
import * as Runtime from 'foldkit/runtime'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'
import { Attr, Behavior, Behaviors, Capability, Event, Slot, SlotView, Slots } from 'foldkit-mixins'
import { FocusRecovery, RovingTabindex, TreeNavigation } from '../src/interaction/index.js'

const Nav = Bundle.declare(TreeNavigation.bundle, 'nav')
const Tools = Bundle.declare(RovingTabindex.bundle, 'tools')

const ports = { inbound: { remove: Port.inbound(Schema.String) } }

const Model = Schema.Struct({ ...Nav.fields, ...Tools.fields, rows: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Nav.cases, ...Tools.cases, Removed: { id: Schema.String } })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

const navArgs = { openByDefault: false } as const
const toolArgs = { orientation: 'horizontal', loop: false, virtual: false } as const

const PanelSlots = Slots.define({
  panel: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput }),
  tree: Slot.make({
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  row: Slot.make({ capability: Capability.Focusable }),
  toolbar: Slot.make({
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role],
  }),
  tool: Slot.make({ capability: Capability.Focusable }),
})

const Panel = SlotView.over(PanelSlots)<Model, Message>()

const toolIds = ['x', 'y']

const Tree = TreeNavigation.behavior(Nav, navArgs)(Panel)({
  container: 'tree',
  item: 'row',
  rows: model => model.rows.map(id => ({ id, parent: null, branch: false })),
})
const Toolbar = RovingTabindex.behavior(Tools, toolArgs)(Panel)({
  container: 'toolbar',
  item: 'tool',
  items: () => Behaviors.Collection.of(toolIds, { id: id => id }),
})
const Recovers = FocusRecovery.behavior(Panel)({
  owner: 'panel',
  parts: { input: [], row: ['next', 'previous', { part: 'input' }] },
})

const drawn = Panel.define((model, slots, h) =>
  h.div(slots.panel.attrs([h.Id('panel')]), [
    h.input(slots.input.attrs([h.Id('query')])),
    h.ul(
      slots.tree.attrs([h.Role('tree'), h.AriaLabel('Rows')]),
      model.rows.map((id, index) =>
        h.li(slots.row.attrs([h.Key(id)], { id, index }), [
          id,
          ...(index === 0
            ? [
                h.div(
                  slots.toolbar.attrs([h.Role('toolbar')]),
                  toolIds.map((tool, at) =>
                    h.button(
                      slots.tool.attrs([h.DataAttribute('tool', tool)], { id: tool, index: at }),
                      [tool],
                    ),
                  ),
                ),
              ]
            : []),
        ]),
      ),
    ),
  ]),
).pipe(Behavior.attach(Tree), Behavior.attach(Toolbar))

const recovering = drawn.pipe(Behavior.attach(Recovers))

/** The row before `id`, which a removal makes the tree's current row when `id` was. */
const before = (rows: ReadonlyArray<string>, id: string): string | null => {
  const at = rows.indexOf(id)
  return at > 0 ? (rows[at - 1] ?? null) : null
}

export const boot = (rows: ReadonlyArray<string>, options: { readonly recovery: boolean }) => {
  const nav = Page.at(Nav, { args: navArgs })
  const tools = Page.at(Tools, { args: toolArgs })
  const view = options.recovery ? recovering : drawn
  const container = document.createElement('div')
  container.id = 'tree-toolbar'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      ports,
      init: () => ({
        model: { nav: { current: null, toggled: [] }, tools: { current: null }, rows },
      }),
      update: (model: Model, message: Message) => {
        const placed = (found: Option.Option<{ readonly model: Model }>) =>
          Option.getOrElse(found, () => ({ model }))
        return Message.match<{ readonly model: Model }>(message, {
          Removed: ({ id }) => ({
            model: {
              ...model,
              rows: model.rows.filter(row => row !== id),
              nav: {
                ...model.nav,
                current: model.nav.current === id ? before(model.rows, id) : model.nav.current,
              },
            },
          }),
          GotNavMessage: () => placed(nav.update(model, message)),
          GotToolsMessage: () => placed(tools.update(model, message)),
        })
      },
      subscriptions: Subscription.make<Model, Message>()(() => ({
        remove: Port.subscriptionEntry(ports.inbound.remove, id => Message.Removed({ id })),
      })),
      view: (model: Model, h: HtmlBuilder<Message>) => view(model, h),
    }),
  )
}

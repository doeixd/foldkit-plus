/**
 * The sidebar as one SlotView: a root Disclosure (the collapse toggle names
 * the navigation it hides) around section Disclosures over a Collection,
 * each trigger naming its own content from the open id — the accordion's
 * rule, with links for bodies. Collapsed, only the toggle draws.
 */
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { sidebarStyle } from '../style.js'
import { Message, SECTIONS, initial, update, type Model } from './app.js'

export const SidebarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  collapse: Slot.make({ capability: Capability.Interactive }),
  trigger: Slot.make({ capability: Capability.Interactive }),
  content: Slot.make({ capability: Capability.Container }),
  link: Slot.make({ capability: Capability.Interactive }),
})

const describeSections = () =>
  Behaviors.Collection.of(SECTIONS, {
    id: section => section.id,
  })

const Ids = Behaviors.Collection.behavior(SidebarSlots)<Model, Message>({
  item: 'trigger',
  items: () => describeSections(),
})

const contentId = (id: string): string => `${id}-content`

export const Sidebar = SlotView.forMessages<Message>()
  .define(SidebarSlots, (model: Model, slots, h) => {
    const items = describeSections()
    return h.div(slots.root.attrs(), [
      h.button(
        slots.collapse.attrs([
          h.AriaExpanded(!model.collapsed),
          h.AriaControls('docs-nav'),
          h.OnClick(Message.ToggledCollapse({})),
        ]),
        [model.collapsed ? 'Expand' : 'Collapse'],
      ),
      ...(model.collapsed
        ? []
        : [
            h.nav(slots.root.attrs([h.Id('docs-nav'), h.AriaLabel('Docs')]), [
              ...SECTIONS.map((section, index) => {
                const open = model.open === section.id
                return h.div(slots.root.attrs(), [
                  h.button(
                    slots.trigger.attrs(
                      [
                        h.Key(section.id),
                        h.AriaExpanded(open),
                        h.AriaControls(contentId(section.id)),
                        h.OnClick(Message.ToggledSection({ id: section.id })),
                      ],
                      items.slotItem(index),
                    ),
                    [section.title],
                  ),
                  ...(open
                    ? [
                        h.ul(slots.content.attrs([h.Id(contentId(section.id))]), [
                          ...section.links.map(link =>
                            h.li([], [h.a(slots.link.attrs([h.Href(link.href)]), [link.label])]),
                          ),
                        ]),
                      ]
                    : []),
                ])
              }),
            ]),
          ]),
    ])
  })
  .pipe(Behavior.attach(Ids), Style.attach(sidebarStyle(SidebarSlots)))

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const lines = [`start: open=${model.open} collapsed=${model.collapsed}`]
  model = update(model, Message.ToggledSection({ id: 'api' })).model
  lines.push(`opened api: open=${model.open}`)
  model = update(model, Message.ToggledCollapse({})).model
  lines.push(`collapsed: collapsed=${model.collapsed}`)
  return lines
}

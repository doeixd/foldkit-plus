/**
 * The accordion as one SlotView: a Collection description feeds identity
 * (ids, posinset/setsize). The disclosure attributes are the view's own
 * rule per section — `Disclosure` names one trigger/content pair, while an
 * accordion is N pairs over a Collection, so each trigger names its own
 * content id and expanded state from the open id. Same attributes the
 * behavior would write, derived per item.
 */
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { accordionStyle } from '../style.js'
import { Message, SECTIONS, initial, update, type Model } from './app.js'

export const AccordionSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Interactive }),
  content: Slot.make({ capability: Capability.Container }),
})

const describeSections = () =>
  Behaviors.Collection.of(SECTIONS, {
    id: section => section.id,
  })

const Ids = Behaviors.Collection.behavior(AccordionSlots)<Model, Message>({
  item: 'trigger',
  items: () => describeSections(),
})

const contentId = (id: string): string => `${id}-content`

export const Accordion = SlotView.forMessages<Message>()
  .define(AccordionSlots, (model: Model, slots, h) => {
    const items = describeSections()
    return h.div(
      slots.root.attrs(),
      SECTIONS.map((section, index) => {
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
            ? [h.div(slots.content.attrs([h.Id(contentId(section.id))]), [section.body])]
            : []),
        ])
      }),
    )
  })
  .pipe(Behavior.attach(Ids), Style.attach(accordionStyle(AccordionSlots)))

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const lines = [`start: open=${model.open}`]
  model = update(model, Message.ToggledSection({ id: 'team' })).model
  lines.push(`opened team: open=${model.open}`)
  model = update(model, Message.ToggledSection({ id: 'team' })).model
  lines.push(`closed team: open=${model.open}`)
  return lines
}

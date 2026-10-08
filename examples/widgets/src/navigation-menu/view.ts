/**
 * The menu as one SlotView: hovering a trigger opens its section, leaving
 * the bar shuts, a click toggles (touch and keyboard arrive that way); one
 * Collection description over the open section's links feeds identity,
 * `ListNavigation`, and `Selection` (aria only — clicks are the parent's
 * `FollowedLink`). The popup is the `Overlay.nonModal` policy.
 */
import { Option } from 'effect'
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { ListNavigation, Overlay, Selection } from 'foldkit-primitives/interaction'
import { keepInView } from '../place.js'
import { navigationMenuStyle } from '../style.js'
import { NAMES, Nav, Sel, Stack, Message, initial, linksOf, update, type Model } from './app.js'

export const NavigationMenuSlots = Slots.define({
  bar: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Interactive }),
  popup: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Focusable }),
})

const navArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 3,
} as const
const selArgs = { mode: 'single', allowEmpty: false } as const

const describeSections = () =>
  Behaviors.Collection.of(NAMES, {
    id: name => name,
  })

const describeLinks = (model: Model) =>
  Behaviors.Collection.of(linksOf(model.openSection), {
    id: link => `${model.openSection}/${link}`,
  })

const SectionIds = Behaviors.Collection.behavior(NavigationMenuSlots)<Model, Message>({
  item: 'trigger',
  items: () => describeSections(),
})

const LinkIds = Behaviors.Collection.behavior(NavigationMenuSlots)<Model, Message>({
  item: 'item',
  items: input => describeLinks(input),
})

const Keys = ListNavigation.behavior(Nav, navArgs)(NavigationMenuSlots)<Model, Message>({
  container: 'popup',
  item: 'item',
  items: input => describeLinks(input),
  text: (input, index) => linksOf(input.openSection)[index] ?? '',
})

const Picks = Selection.behavior(Sel, selArgs)(NavigationMenuSlots)<Model, Message>({
  container: 'popup',
  item: 'item',
  items: input => describeLinks(input),
  click: false,
})

export const NavigationOverlay = Overlay.behaviors(NavigationMenuSlots)<Model, Message, 'layers'>({
  stack: Stack,
  layer: 'popup',
  trigger: 'trigger',
  id: input => `section-${input.openSection ?? 'none'}`,
  policy: Overlay.nonModal,
})

export const NavigationMenu = SlotView.forMessages<Message>()
  .define(NavigationMenuSlots, (model: Model, slots, h) => {
    const sections = describeSections()
    const links = describeLinks(model)
    const shown = linksOf(model.openSection)
    return h.nav(
      slots.bar.attrs([
        h.AriaLabel('Site'),
        h.OnPointerLeave(pointerType =>
          pointerType === 'touch' ? Option.none() : Option.some(Message.LeftBar()),
        ),
      ]),
      [
        ...NAMES.map((name, index) =>
          h.button(
            slots.trigger.attrs(
              [
                h.Key(name),
                h.AriaExpanded(model.openSection === name),
                h.OnMouseEnter(Message.EnteredSection({ section: name })),
                h.OnClick(Message.ToggledSection({ section: name })),
              ],
              sections.slotItem(index),
            ),
            [name],
          ),
        ),
        ...(model.openSection === null
          ? []
          : [
              h.div(
                slots.popup.attrs([h.Role('menu'), h.AriaLabel(model.openSection)]),
                shown.map((link, index) =>
                  h.button(
                    slots.item.attrs(
                      [h.Key(link), h.OnClick(Message.FollowedLink({ link }))],
                      links.slotItem(index),
                    ),
                    [link],
                  ),
                ),
              ),
            ]),
        ...(model.followed === null ? [] : [h.p([], [`Last followed: ${model.followed}.`])]),
      ],
    )
  })
  .pipe(
    Behavior.attach(SectionIds),
    Behavior.attach(LinkIds),
    Behavior.attach(Keys),
    Behavior.attach(Picks),
    ...NavigationOverlay.map(Behavior.attach),
    Behavior.attach(keepInView(NavigationMenuSlots)({ panel: 'popup' })),
    Style.attach(navigationMenuStyle(NavigationMenuSlots)),
  )

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const show = (): string => `open=${model.openSection} followed=${model.followed}`
  const lines = [`start: ${show()}`]
  model = update(model, Message.EnteredSection({ section: 'Products' })).model
  lines.push(`hovered Products: ${show()}`)
  model = update(model, Message.FollowedLink({ link: 'Pricing' })).model
  lines.push(`followed Pricing: ${show()}`)
  return lines
}

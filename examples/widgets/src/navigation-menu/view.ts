/**
 * The menu as one SlotView: hovering a trigger opens its section, leaving
 * the bar shuts, a click toggles unless the hover just opened it. One
 * Collection description over the open section's links feeds identity,
 * `ListNavigation`, and `Selection` (aria only — clicks are the parent's
 * `FollowedLink`). The popup is the `Overlay.nonModal` policy. Its layer
 * id is the dismiss attribute, not an element id. `PlaceAt` puts the popup
 * under the open trigger.
 */
import { Option } from 'effect'
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { ListNavigation, Overlay, Placing, Selection } from 'foldkit-primitives/interaction'
import { navigationMenuStyle } from '../style.js'
import {
  NAMES,
  Nav,
  Sel,
  Stack,
  Message,
  initial,
  linksOf,
  linkElementId,
  navArgs,
  selArgs,
  textOf,
  triggerId,
  update,
  type Model,
} from './app.js'

export const NavigationMenuSlots = Slots.define({
  bar: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Interactive }),
  popup: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Focusable }),
})

const describeSections = () =>
  Behaviors.Collection.of(NAMES, {
    id: name => triggerId(name),
  })

const describeLinks = (model: Model) =>
  Behaviors.Collection.of(linksOf(model.openSection), {
    id: link =>
      Option.isSome(model.openSection) ? linkElementId(model.openSection.value, link) : link,
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
  id: input => `navigation-menu-section-${textOf(input.openSection)}`,
  policy: Overlay.nonModal,
})

export const NavigationMenu = SlotView.forMessages<Message>()
  .define(NavigationMenuSlots, (model: Model, slots, h) => {
    const sections = describeSections()
    const links = describeLinks(model)
    const shown = linksOf(model.openSection)
    const section = model.openSection
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
                h.AriaExpanded(Option.isSome(section) && section.value === name),
                h.OnMouseEnter(Message.EnteredSection({ section: name })),
                h.OnClick(Message.ToggledSection({ section: name })),
              ],
              sections.slotItem(index),
            ),
            [name],
          ),
        ),
        ...Option.match(section, {
          onNone: () => [],
          onSome: name => [
            h.div(
              slots.popup.attrs([h.Key(`popup:${name}`), h.Role('menu'), h.AriaLabel(name)]),
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
          ],
        }),
        ...(Option.isNone(model.followed)
          ? []
          : [h.p([], [`Last followed: ${model.followed.value}.`])]),
      ],
    )
  })
  .pipe(
    Behavior.attach(SectionIds),
    Behavior.attach(LinkIds),
    Behavior.attach(Keys),
    Behavior.attach(Picks),
    ...NavigationOverlay.map(Behavior.attach),
    Behavior.attach(
      Placing.placeAtTrigger(NavigationMenuSlots)<Model, Message>({
        panel: 'popup',
        triggerId: input =>
          Option.isSome(input.openSection) ? triggerId(input.openSection.value) : '',
      }),
    ),
    Behavior.attach(Placing.keepWithin(NavigationMenuSlots)({ panel: 'popup' })),
    Style.attach(navigationMenuStyle(NavigationMenuSlots)),
  )

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const show = (): string => `open=${textOf(model.openSection)} followed=${textOf(model.followed)}`
  const lines = [`start: ${show()}`]
  model = update(model, Message.EnteredSection({ section: 'Products' })).model
  lines.push(`hovered Products: ${show()}`)
  model = update(model, Message.FollowedLink({ link: 'Pricing' })).model
  lines.push(`followed Pricing: ${show()}`)
  return lines
}

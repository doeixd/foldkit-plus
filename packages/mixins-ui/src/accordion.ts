import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { flipped } from './choices.js'
import type { MixinList } from './resolve.js'

/**
 * An accordion: sections whose headings each show and hide their panel, as
 * the APG accordion pattern has it. Each trigger is a button in a heading,
 * with `aria-expanded` and `aria-controls`; each panel is a region named by
 * its trigger. Which sections are open is the application's, in its Model:
 * the view draws `open` and sends `onToggle`, and `toggled` is the
 * transition `update` applies. A shut panel stays drawn and is `inert`, out
 * of the accessibility tree and the tab order, so its close can animate and
 * `aria-controls` always names a node.
 */
export const AccordionSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  heading: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded, Attr.Disabled],
  }),
  label: Slot.make({ capability: Capability.Container }),
  chevron: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  /** The panel's one grid row, with no padding of its own, so it can shrink to nothing. */
  body: Slot.make({ capability: Capability.Container }),
  content: Slot.make({ capability: Capability.Container }),
})

export interface AccordionItem {
  /** Unique within the accordion, and part of its elements' ids. */
  readonly id: string
  readonly title: string
  readonly content: Html | string
  readonly disabled?: boolean | undefined
}

export interface AccordionView<Message> {
  readonly items: ReadonlyArray<AccordionItem>
  /** The ids of the open sections, as the application keeps them. */
  readonly open: ReadonlyArray<string>
  /** The Message a press on a section sends; its type comes from `h`. */
  readonly onToggle: (id: string) => NoInfer<Message>
  /** Prefixes every id the accordion draws, unique on the page. */
  readonly id: string
  /** The level of the headings that hold the triggers, for the page's outline. Default 3. */
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6 | undefined
  /** A style of `AccordionSlots`, for the accordion's look. */
  readonly style?: NamedStyle<typeof AccordionSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/**
 * The open sections after `id` is pressed. With `multiple`, any number stay
 * open; otherwise opening one shuts the others. A pressed open section shuts
 * unless it is the only one open and `collapsible` is false (shadcn's and
 * Zag's default for a single accordion is collapsible, and so is this).
 */
export const toggled = (
  open: ReadonlyArray<string>,
  id: string,
  options: { readonly multiple?: boolean; readonly collapsible?: boolean } = {},
): ReadonlyArray<string> => {
  const isOpen = open.includes(id)
  if (options.multiple === true) return flipped(open, id)
  if (!isOpen) return [id]
  return options.collapsible === false ? open : []
}

export const view = <Message>(options: AccordionView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    AccordionSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const open = new Set(options.open)
  const heading = (children: ReadonlyArray<Html>) => {
    const attrs = builders.heading.attrs()
    switch (options.headingLevel ?? 3) {
      case 2:
        return h.h2(attrs, children)
      case 4:
        return h.h4(attrs, children)
      case 5:
        return h.h5(attrs, children)
      case 6:
        return h.h6(attrs, children)
      default:
        return h.h3(attrs, children)
    }
  }
  return h.div(
    builders.root.attrs(),
    options.items.map(item => {
      const shown = open.has(item.id)
      const state = h.DataAttribute('state', shown ? 'open' : 'closed')
      const triggerId = `${options.id}-${item.id}-trigger`
      const panelId = `${options.id}-${item.id}-panel`
      const disabled = item.disabled === true
      return h.keyed('div')(item.id, builders.item.attrs([state]), [
        heading([
          h.button(
            builders.trigger.attrs([
              h.Type('button'),
              h.Id(triggerId),
              h.AriaExpanded(shown),
              h.AriaControls(panelId),
              state,
              ...(disabled ? [h.Disabled(true)] : [h.OnClick(options.onToggle(item.id))]),
            ]),
            [
              // Its text in `data-label` too, so turning semibold when open moves nothing.
              h.span(builders.label.attrs([h.DataAttribute('label', item.title)]), [item.title]),
              h.span(builders.chevron.attrs([h.AriaHidden(true)]), []),
            ],
          ),
        ]),
        h.div(
          builders.panel.attrs([
            h.Id(panelId),
            h.Role('region'),
            h.AriaLabelledBy(triggerId),
            state,
            ...(shown ? [] : [h.Attribute('inert', '')]),
          ]),
          [h.div(builders.body.attrs(), [h.div(builders.content.attrs(), [item.content])])],
        ),
      ])
    }),
  )
}

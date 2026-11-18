import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { layered, type PresetOption, type Presets } from './configure.js'
import type { MixinList } from './resolve.js'
import { toggled } from './accordion/toggled.js'

export { toggled }
export { Args, Message, Model, controls, init, update } from './accordion/state.js'

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
    attributes: [Attr.AriaExpanded, Attr.AriaControls, Attr.Disabled],
  }),
  /** An item's `icon`, before its title. */
  leading: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  /** An item's `trailing`, after its title: a badge, a count, a role. */
  trailing: Slot.make({ capability: Capability.Container }),
  chevron: Slot.make({ capability: Capability.Container }),
  /** The view's own `icon`, drawn in place of the chevron. */
  icon: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role, Attr.AriaLabelledby],
  }),
  /** The panel's one grid row, with no padding of its own, so it can shrink to nothing. */
  body: Slot.make({ capability: Capability.Container }),
  content: Slot.make({ capability: Capability.Container }),
})

export interface AccordionItem {
  /** Unique within the accordion, and part of its elements' ids. */
  readonly id: string
  /** The row's name; always text, and `data-label` keeps its width when it turns semibold. */
  readonly title: string
  /** Drawn before the title: a glyph, an avatar. */
  readonly icon?: Html | undefined
  /** Drawn after the title, before the indicator: a badge, a count, a role. */
  readonly trailing?: Html | undefined
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
  /**
   * Drawn in each row in place of the recipe's chevron or plus, carrying the
   * section's `data-state`; the recipe leaves it still.
   */
  readonly icon?: Html | undefined
  /** The level of the headings that hold the triggers, for the page's outline. Default 3. */
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6 | undefined
  /** A style of `AccordionSlots`, for the accordion's look. */
  readonly style?: NamedStyle<typeof AccordionSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
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
              ...(item.icon === undefined ? [] : [h.span(builders.leading.attrs(), [item.icon])]),
              h.span(builders.label.attrs([h.DataAttribute('label', item.title)]), [item.title]),
              ...(item.trailing === undefined
                ? []
                : [h.span(builders.trailing.attrs(), [item.trailing])]),
              options.icon === undefined
                ? h.span(builders.chevron.attrs([h.AriaHidden(true)]), [])
                : h.span(builders.icon.attrs([h.AriaHidden(true), state]), [options.icon]),
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

/** What an Accordion is given once: its look and the options that hold no Message. */
export type AccordionPreset = Pick<AccordionView<never>, 'icon' | 'headingLevel' | 'style'> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own Accordion: `base` for every use, `presets` chosen at
 * a use with `preset`, and the call over both. `mixins` concatenate in that
 * order; any other option given at the call replaces the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<AccordionPreset, Names>,
): {
  readonly view: <Outer>(
    options: AccordionView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})

import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { flipped } from './choices.js'
import type { MixinList } from './resolve.js'

/**
 * An application's sidebar, shadcn's: a navigation landmark of sections,
 * each a heading button that shows and hides its links, as an accordion's
 * sections do (several open at once), and a toggle that collapses the whole
 * navigation off the page, Fluid Functionalism's way (collapsed is gone, not
 * an icon rail). A link marks the page it leads to with `aria-current`. The
 * collapsed flag and the open sections are the application's; `toggled`
 * opens or shuts a section. A collapsed navigation stays drawn, `inert`,
 * so its collapse can animate and the toggle's `aria-controls` names it.
 */
export const SidebarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  toggle: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded, Attr.AriaLabel],
  }),
  nav: Slot.make({ capability: Capability.Container }),
  section: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  }),
  chevron: Slot.make({ capability: Capability.Container }),
  links: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  link: Slot.make({ capability: Capability.Interactive }),
})

export interface SidebarLink {
  readonly label: string
  readonly href: string
  /** Whether it leads to the page shown, `aria-current="page"`. */
  readonly current?: boolean | undefined
}

export interface SidebarSection {
  readonly id: string
  readonly title: string
  readonly links: ReadonlyArray<SidebarLink>
}

export interface SidebarView<Message> {
  /** Prefixes every id the sidebar draws, unique on the page. */
  readonly id: string
  /** The navigation landmark's name. */
  readonly label: string
  readonly sections: ReadonlyArray<SidebarSection>
  /** The ids of the open sections. */
  readonly open: ReadonlyArray<string>
  readonly onToggleSection: (id: string) => NoInfer<Message>
  readonly collapsed: boolean
  readonly onToggleCollapsed: NoInfer<Message>
  /** A style of `SidebarSlots`, for the sidebar's look. */
  readonly style?: NamedStyle<typeof SidebarSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/** The open sections after `id` is pressed: several stay open, a press flips one. */
export const toggled = (open: ReadonlyArray<string>, id: string): ReadonlyArray<string> =>
  flipped(open, id)

export const view = <Message>(options: SidebarView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    SidebarSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const open = new Set(options.open)
  const navId = `${options.id}-nav`
  const collapsed = h.DataAttribute('collapsed', String(options.collapsed))
  return h.div(builders.root.attrs([collapsed]), [
    h.button(
      builders.toggle.attrs([
        h.Type('button'),
        h.AriaExpanded(!options.collapsed),
        h.AriaControls(navId),
        h.AriaLabel(options.collapsed ? `Show ${options.label}` : `Hide ${options.label}`),
        h.OnClick(options.onToggleCollapsed),
      ]),
      [],
    ),
    h.nav(
      builders.nav.attrs([
        h.Id(navId),
        h.AriaLabel(options.label),
        collapsed,
        ...(options.collapsed ? [h.Attribute('inert', '')] : []),
      ]),
      options.sections.map(section => {
        const shown = open.has(section.id)
        const state = h.DataAttribute('state', shown ? 'open' : 'closed')
        const linksId = `${options.id}-${section.id}-links`
        return h.keyed('div')(section.id, builders.section.attrs([state]), [
          h.button(
            builders.trigger.attrs([
              h.Type('button'),
              h.AriaExpanded(shown),
              h.AriaControls(linksId),
              state,
              h.OnClick(options.onToggleSection(section.id)),
            ]),
            [h.span([], [section.title]), h.span(builders.chevron.attrs([h.AriaHidden(true)]), [])],
          ),
          h.ul(
            builders.links.attrs([
              h.Id(linksId),
              state,
              ...(shown ? [] : [h.Attribute('inert', '')]),
            ]),
            section.links.map(link =>
              h.li(builders.item.attrs(), [
                h.a(
                  builders.link.attrs([
                    h.Href(link.href),
                    ...(link.current === true ? [h.AriaCurrent('page')] : []),
                  ]),
                  [link.label],
                ),
              ]),
            ),
          ),
        ])
      }),
    ),
  ])
}

import type { RenderInfo, TabInfo } from '@foldkit/ui/tabs'
import { Attr, Behavior, Capability, Event, Slot, Slots, type SlotAttributes } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { FluidHover, Measure } from 'foldkit-primitives/dom'
import { FollowDirection, ReadingKeys } from './direction.js'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'

/**
 * Tabs is a nested Submodel: one `tablist` group plus a `tab`/`panel` pair per
 * item, so the resolver runs once per group and each base `ChildAttribute`
 * bundle passes through by identity.
 *
 * Enabled tabs own `click` through the base `OnClick`; a Behavior adding its
 * own click handler is a conflict rather than a second silent owner. Disabled
 * tabs publish no click, so the contract still lists it as allowed.
 *
 * `indicator` and `highlight` have no upstream bundle: they are this
 * package's, drawn first in the tablist, for the marker under the chosen tab
 * and the hover that follows the pointer, which `fluid` moves.
 */
export const TabsSlots = Slots.define({
  tablist: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  tab: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected, Attr.Disabled, Attr.AriaDisabled],
  }),
  panel: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  indicator: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
})

export type ResolvedTab<Value extends string, Message> = Omit<TabInfo<Value>, 'tab' | 'panel'> & {
  readonly tab: SlotAttributes<Message>
  readonly panel: SlotAttributes<Message>
}

export interface ResolvedTabs<Value extends string, Message> {
  readonly tablist: SlotAttributes<Message>
  /** The marker under the chosen tab; drawn, the tabs' recipe reads it in place of each tab's own. */
  readonly indicator: SlotAttributes<Message>
  /** The hover that follows the pointer between tabs. */
  readonly highlight: SlotAttributes<Message>
  readonly tabs: ReadonlyArray<ResolvedTab<Value, Message>>
  readonly activeIndex: number
}

const chosen = '[aria-selected="true"]'

/**
 * What moves the `indicator` and `highlight`: on the tablist, the chosen tab
 * is measured (`--fk-tabs-chosen-x`, `-y`, `-w`, `-h`, `-display`) and one
 * highlight follows the pointer to the nearest tab (`--fk-tabs-hover-*`),
 * growing out of the chosen tab and returning to it. Pass them beside the
 * style; until they run (before a page hydrates, or without them), each tab
 * marks itself and the drawn indicator and highlight show nothing.
 */
export const fluid = [
  Behavior.forSlots(TabsSlots)<unknown, never>(
    {
      tablist: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => Measure({ targets: { 'tabs-chosen': chosen } }),
      }),
    },
    { name: 'TabsChosen' },
  ).mixin,
  Behavior.forSlots(TabsSlots)<unknown, never>(
    {
      tablist: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({
            name: 'tabs-hover',
            item: '[role="tab"]',
            axis: 'xy',
            gapClick: true,
            from: chosen,
          }),
      }),
    },
    { name: 'TabsHover' },
  ).mixin,
  // Measured again when the direction flips, which resizes nothing.
  Behavior.forSlots(TabsSlots)<unknown, never>(
    {
      tablist: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => FollowDirection(),
      }),
    },
    { name: 'TabsDirection' },
  ).mixin,
] as const

/**
 * Arrow keys read by the direction the tablist is drawn in: right to left,
 * ArrowLeft goes to the next tab, as the APG asks. Upstream's keys know no
 * direction, and its bundles no view option reaches, so this is a Mount
 * (`ReadingKeys`) that reads the key before upstream's handler does. Pass it
 * beside the style where the page may be right to left. It is not built in
 * because a Scene test must resolve every Mount with a Message, and this one
 * has none to give.
 */
export const readingKeys = Behavior.forSlots(TabsSlots)<unknown, never>(
  {
    tablist: Behavior.slot({
      requires: { capability: Capability.Container },
      mount: () => ReadingKeys(),
    }),
  },
  { name: 'TabsReadingKeys' },
).mixin

/** Resolves the tabs' nested render groups, preserving `activeIndex`. */
export const resolve = <Value extends string, Input, Message>(
  render: RenderInfo<Value>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedTabs<Value, Message> => {
  const builders = buildersOf(TabsSlots, mixins, context)
  return {
    tablist: builders.tablist.attrs(render.tablist),
    indicator: builders.indicator.attrs([context.h.AriaHidden(true)]),
    highlight: builders.highlight.attrs([context.h.AriaHidden(true)]),
    tabs: render.tabs.map(item => ({
      ...item,
      tab: builders.tab.attrs(item.tab),
      panel: builders.panel.attrs(item.panel),
    })),
    activeIndex: render.activeIndex,
  }
}

/** The tabs' `toView`: `draw` receives their bundles with `mixins` applied. */
export const toView =
  <Value extends string, Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedTabs<Value, Message>) => Html,
  ) =>
  (render: RenderInfo<Value>): Html =>
    draw(resolve(render, mixins, context))

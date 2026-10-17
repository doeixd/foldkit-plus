import { Option } from 'effect'
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
 * and the hover that follows the pointer, which `fluid` moves. So are the
 * rest: `item` holds a tab and its `close` button side by side (a button in
 * a button is not allowed), and `label` and `icon` are the tab's words,
 * trimmed in a box of their own, and a mark before them.
 */
export const TabsSlots = Slots.define({
  tablist: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  item: Slot.make({ capability: Capability.Container }),
  tab: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected, Attr.Disabled, Attr.AriaDisabled],
  }),
  label: Slot.make({ capability: Capability.Container }),
  icon: Slot.make({ capability: Capability.Container }),
  close: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  panel: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  indicator: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
})

export type ResolvedTab<Value extends string, Message> = Omit<TabInfo<Value>, 'tab' | 'panel'> & {
  /** What holds the tab and its close button, keyed by the tab's value. */
  readonly item: SlotAttributes<Message>
  readonly tab: SlotAttributes<Message>
  readonly panel: SlotAttributes<Message>
  /** The close button, drawn after the tab in its `item`, when the tabs are closable and it is enabled. */
  readonly close: Option.Option<SlotAttributes<Message>>
}

export interface ResolvedTabs<Value extends string, Message> {
  readonly tablist: SlotAttributes<Message>
  /** The marker under the chosen tab; drawn, the tabs' recipe reads it in place of each tab's own. */
  readonly indicator: SlotAttributes<Message>
  /** The hover that follows the pointer between tabs. */
  readonly highlight: SlotAttributes<Message>
  /** A tab's words, in the tab. */
  readonly label: SlotAttributes<Message>
  /** A mark before a tab's words, hidden from assistive technology. */
  readonly icon: SlotAttributes<Message>
  readonly tabs: ReadonlyArray<ResolvedTab<Value, Message>>
  readonly activeIndex: number
}

/**
 * Closable tabs, as the APG's tabs with deletion: Delete on a tab sends
 * `onClose`, and so does a press on its close button. The button is no tab
 * stop and hidden from assistive technology, since a tablist holds tabs
 * alone; the tab names the key in `aria-keyshortcuts`. Answer `onClose`
 * with `closing`.
 */
export interface TabsClose<Value extends string, Message> {
  readonly onClose: (value: Value) => Message
  /** The close button's tooltip (`title`); default `"Close <value>"`. */
  readonly label?: ((value: Value) => string) | undefined
}

export interface TabsContext<Value extends string, Input, Message> extends ResolveContext<
  Input,
  Message
> {
  /** Makes every enabled tab closable. */
  readonly close?: TabsClose<Value, Message> | undefined
}

/**
 * What closing `value` leaves, as the APG asks: the tabs without it, the
 * tab chosen after (the one after it, or before it at the end, when it was
 * the chosen one; none once no tab is left), and the index to focus, the
 * tab that followed it. Focus it with `@foldkit/ui`'s `FocusTab`: the
 * focused tab was taken from the page. A value not among `tabs` changes
 * nothing and focuses none.
 */
export const closing = <Value extends string>(
  tabs: ReadonlyArray<Value>,
  selected: Value,
  value: Value,
): {
  readonly tabs: ReadonlyArray<Value>
  readonly selected: Option.Option<Value>
  readonly focus: Option.Option<number>
} => {
  const at = tabs.indexOf(value)
  if (at === -1) return { tabs, selected: Option.some(selected), focus: Option.none() }
  const left = tabs.filter((_, index) => index !== at)
  const next = Option.fromNullishOr(left[Math.min(at, left.length - 1)])
  return {
    tabs: left,
    selected: selected === value ? next : Option.some(selected),
    focus: Option.map(next, () => Math.min(at, left.length - 1)),
  }
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
  context: TabsContext<Value, Input, Message>,
): ResolvedTabs<Value, Message> => {
  const builders = buildersOf(TabsSlots, mixins, context)
  const { h, close } = context
  const closable = (item: TabInfo<Value>) =>
    close === undefined || item.isDisabled ? Option.none() : Option.some(close)
  return {
    tablist: builders.tablist.attrs(render.tablist),
    indicator: builders.indicator.attrs([h.AriaHidden(true)]),
    highlight: builders.highlight.attrs([h.AriaHidden(true)]),
    label: builders.label.attrs(),
    icon: builders.icon.attrs([h.AriaHidden(true)]),
    tabs: render.tabs.map(item => ({
      ...item,
      item: builders.item.attrs([h.Key(item.value)]),
      tab: builders.tab.attrs(
        Option.match(closable(item), {
          onNone: () => item.tab,
          onSome: ({ onClose }) => [
            ...item.tab,
            h.DataAttribute('closable', ''),
            h.AriaKeyshortcuts('Delete'),
            h.OnKeyDownPreventDefault(key =>
              key === 'Delete' ? Option.some(onClose(item.value)) : Option.none(),
            ),
          ],
        }),
      ),
      panel: builders.panel.attrs(item.panel),
      close: Option.map(closable(item), ({ onClose, label }) =>
        builders.close.attrs([
          h.Type('button'),
          h.Tabindex(-1),
          h.AriaHidden(true),
          h.Title(label === undefined ? `Close ${item.value}` : label(item.value)),
          h.OnClick(onClose(item.value)),
        ]),
      ),
    })),
    activeIndex: render.activeIndex,
  }
}

/** The tabs' `toView`: `draw` receives their bundles with `mixins` applied. */
export const toView =
  <Value extends string, Message>(
    mixins: MixinList<Message>,
    context: TabsContext<Value, unknown, Message>,
    draw: (resolved: ResolvedTabs<Value, Message>) => Html,
  ) =>
  (render: RenderInfo<Value>): Html =>
    draw(resolve(render, mixins, context))

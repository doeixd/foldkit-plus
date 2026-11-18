import { Option } from 'effect'
import type { RenderInfo, TabInfo } from '@foldkit/ui/tabs'
import { Behaviors, type Diagnostic, type SlotAttributes } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'

import { TabsSlots } from './tabs/slots.js'

export { TabsSlots } from './tabs/slots.js'
export { fluid } from './tabs/fluid.js'
export { readingKeys } from './tabs/readingKeys.js'

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

/** A key the application answers on a tab; its input is the tab. */
export type Route<Value extends string, Message> = Behaviors.Keys.Route<TabInfo<Value>, Message>

export interface TabsContext<Value extends string, Input, Message> extends ResolveContext<
  Input,
  Message
> {
  /** Makes every enabled tab closable. */
  readonly close?: TabsClose<Value, Message> | undefined
  /**
   * Keys the application answers on a tab, such as F2 renaming it. They share
   * one keydown owner with Delete, which a closable tab takes: a route on the
   * same gesture is a diagnostic naming both. Upstream's arrows live on the
   * tablist, so they cannot clash.
   */
  readonly routes?: ReadonlyArray<Route<Value, NoInfer<Message>>> | undefined
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

/** A tab's own key: Delete closes it, when the tabs are closable. */
const ownRoutes = <Value extends string, Message>(
  close: TabsClose<Value, Message> | undefined,
): ReadonlyArray<Route<Value, Message>> =>
  close === undefined
    ? []
    : [
        Behaviors.Keys.route<TabInfo<Value>, Message>('Close', {
          on: [Behaviors.Keys.chord('Delete')],
          handle: ({ input }) =>
            input.isDisabled ? Option.none() : Option.some(close.onClose(input.value)),
        }),
      ]

/**
 * The `mixins:key-conflict` that resolving the tabs with `routes` would throw,
 * or none: the application's routes against Delete, which a closable tab
 * takes (`close` is the one the tabs are given), and against each other.
 */
export const conflict = <Value extends string, Message>(
  routes: ReadonlyArray<Route<Value, Message>>,
  input: Pick<TabsContext<Value, unknown, Message>, 'close'> = {},
): Option.Option<Diagnostic> =>
  Behaviors.Keys.conflict([...ownRoutes(input.close), ...routes], Option.some('tab'))

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
  const routes: ReadonlyArray<Route<Value, Message>> = [
    ...ownRoutes(close),
    ...(context.routes ?? []),
  ]
  // No keydown at all unless there is a key to answer.
  const keys = routes.length === 0 ? undefined : Behaviors.Keys.attribute(routes, { slot: 'tab' })
  return {
    tablist: builders.tablist.attrs(render.tablist),
    indicator: builders.indicator.attrs([h.AriaHidden(true)]),
    highlight: builders.highlight.attrs([h.AriaHidden(true)]),
    label: builders.label.attrs(),
    icon: builders.icon.attrs([h.AriaHidden(true)]),
    tabs: render.tabs.map(item => ({
      ...item,
      item: builders.item.attrs([h.Key(item.value)]),
      tab: builders.tab.attrs([
        ...item.tab,
        ...(Option.isSome(closable(item))
          ? [h.DataAttribute('closable', ''), h.AriaKeyshortcuts('Delete')]
          : []),
        ...(keys === undefined ? [] : [keys({ input: item, h })]),
      ]),
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

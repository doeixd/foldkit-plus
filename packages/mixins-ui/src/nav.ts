import type { ItemInfo, RenderInfo } from '@foldkit/ui/nav'
import { Behavior, Capability, Slot, Slots, type SlotAttributes } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { FluidHover, Measure } from 'foldkit-primitives/dom'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'

/**
 * `@foldkit/ui`'s Nav, a navigation landmark of links with the current one
 * marked, as shadcn's navigation menu draws it: links in a row, their keys
 * the browser's (Tab to move, Enter to follow), no roving tab stop, since
 * that is a composite widget's pattern and not a landmark's. `indicator` and
 * `highlight`, drawn in the list, are the current link's marker and the
 * hover that follows the pointer, which `fluid` moves, as Tabs' do.
 */
export const NavSlots = Slots.define({
  nav: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  link: Slot.make({ capability: Capability.Interactive }),
  indicator: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
})

export interface ResolvedNav<Value extends string, Message> {
  readonly nav: SlotAttributes<Message>
  readonly list: SlotAttributes<Message>
  readonly indicator: SlotAttributes<Message>
  readonly highlight: SlotAttributes<Message>
  readonly items: ReadonlyArray<
    Omit<ItemInfo<Value>, 'link'> & {
      readonly item: SlotAttributes<Message>
      readonly link: SlotAttributes<Message>
    }
  >
}

/** Applies `mixins` to the nav's bundles: its landmark, and each item's link. */
export const resolve = <Value extends string, Input, Message>(
  render: RenderInfo<Value>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedNav<Value, Message> => {
  const builders = buildersOf(NavSlots, mixins, context)
  return {
    nav: builders.nav.attrs(render.nav),
    list: builders.list.attrs(),
    // Items of the list, so it holds only `li`s, and nothing a reader counts.
    indicator: builders.indicator.attrs([
      context.h.AriaHidden(true),
      context.h.Role('presentation'),
    ]),
    highlight: builders.highlight.attrs([
      context.h.AriaHidden(true),
      context.h.Role('presentation'),
    ]),
    items: render.items.map(info => ({
      ...info,
      item: builders.item.attrs(),
      link: builders.link.attrs([
        ...info.link,
        ...(info.isCurrent ? [context.h.AriaCurrent('page')] : []),
      ]),
    })),
  }
}

/** The links drawn in a list, the indicator and highlight first. */
export const draw = <Value extends string, Message>(
  nav: ResolvedNav<Value, Message>,
  label: (value: Value) => Html | string,
  h: HtmlBuilder<Message>,
): Html =>
  h.nav(nav.nav, [
    h.ul(nav.list, [
      h.li(nav.indicator, []),
      h.li(nav.highlight, []),
      ...nav.items.map(item =>
        h.keyed('li')(item.value, item.item, [h.a(item.link, [label(item.value)])]),
      ),
    ]),
  ])

/**
 * The nav's `toView`: with no `draw`, the links in a list, each showing
 * `label` of its value; a `draw` of your own receives the bundles.
 */
export const toView =
  <Value extends string, Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    label: (value: Value) => Html | string,
    custom?: (resolved: ResolvedNav<Value, Message>) => Html,
  ) =>
  (render: RenderInfo<Value>): Html => {
    const resolved = resolve(render, mixins, context)
    return custom === undefined ? draw(resolved, label, context.h) : custom(resolved)
  }

const current = '[aria-current="page"]'

/**
 * What moves the `indicator` and `highlight`, on the list: the current link
 * is measured (`--fk-nav-chosen-*`), and one highlight follows the pointer
 * to the nearest link (`--fk-nav-hover-*`), born at the current one. Pass
 * them beside the style; until they run, the current link marks itself.
 */
export const fluid = [
  Behavior.forSlots(NavSlots)<unknown, never>(
    {
      list: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => Measure({ targets: { 'nav-chosen': current } }),
      }),
    },
    { name: 'NavChosen' },
  ).mixin,
  Behavior.forSlots(NavSlots)<unknown, never>(
    {
      list: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({ name: 'nav-hover', item: 'a', axis: 'x', gapClick: true, from: current }),
      }),
    },
    { name: 'NavHover' },
  ).mixin,
] as const

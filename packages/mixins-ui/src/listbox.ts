import { Attr, Behavior, Capability, Event, Slot, Slots, type SlotAttributes } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { FluidHover, Measure } from 'foldkit-primitives/dom'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'
import type {
  ListboxGroupRender,
  ListboxHeadingRender,
  ListboxItemRender,
  ListboxRenderInfo,
} from './listboxView.js'
import { drawListbox } from './popupView.js'

/**
 * Listbox is a nested Submodel: one `button`/`backdrop`/`items` group plus
 * an `item` per entry (and `group`/`heading`/`separator` where the caller
 * groups), so the resolver runs once per bundle and each base attribute
 * passes through by identity. `hiddenInputs` are the form inputs submitted
 * under `name`: generated markup with no styling surface, passed through
 * for the draw to place.
 *
 * The button owns `click` (and `pointerdown`/`keydown` while enabled); an
 * item owns `click` while interactive. A Behavior adding its own handler to
 * one of those is a conflict, not a second silent owner. Disabled buttons
 * and items publish no click, so the contract still lists it as allowed.
 */
export const ListboxSlots = Slots.define({
  wrapper: Slot.make({ capability: Capability.Container }),
  button: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click, Event.PointerDown, Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaExpanded, Attr.Disabled, Attr.AriaDisabled],
  }),
  backdrop: Slot.make({ capability: Capability.Container, events: [Event.Click] }),
  items: Slot.make({
    capability: Capability.Container,
    events: [Event.KeyDown, Event.Blur],
    attributes: [Attr.Role],
  }),
  scroll: Slot.make({ capability: Capability.Container }),
  item: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected, Attr.Disabled, Attr.AriaDisabled],
  }),
  group: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  heading: Slot.make({ capability: Capability.Container }),
  separator: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  rows: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
  indicator: Slot.make({ capability: Capability.Container }),
})

export type ResolvedListboxItem<Message> = Omit<ListboxItemRender, 'attributes'> & {
  readonly attributes: SlotAttributes<Message>
}

export type ResolvedListboxHeading<Message> = Omit<ListboxHeadingRender, 'attributes'> & {
  readonly attributes: SlotAttributes<Message>
}

export type ResolvedListboxGroup<Message> = Omit<
  ListboxGroupRender,
  'heading' | 'group' | 'separator' | 'items'
> & {
  readonly heading: ResolvedListboxHeading<Message> | undefined
  readonly group: { key: string; attributes: SlotAttributes<Message> } | undefined
  readonly separator: { key: string; attributes: SlotAttributes<Message> } | undefined
  readonly items: ReadonlyArray<ResolvedListboxItem<Message>>
}

export type ResolvedListbox<Message> = Omit<
  ListboxRenderInfo,
  'wrapper' | 'button' | 'backdrop' | 'items' | 'scroll' | 'groups'
> & {
  readonly wrapper: SlotAttributes<Message>
  readonly button: SlotAttributes<Message>
  readonly buttonContent: Html
  readonly hiddenInputs: ReadonlyArray<Html>
  readonly backdrop: { key: string; attributes: SlotAttributes<Message> } | undefined
  readonly items: { key: string; attributes: SlotAttributes<Message> } | undefined
  readonly scroll: SlotAttributes<Message> | undefined
  /**
   * The box of the open panel's rows, which `fluid` runs on, and the hover it
   * moves, drawn first in it: this package's, with no upstream bundle (the
   * panel itself carries upstream's anchor, and an element holds one Mount).
   */
  readonly rows: SlotAttributes<Message> | undefined
  readonly highlight: SlotAttributes<Message> | undefined
  /** The marker `fluid` moves to the chosen row, drawn beside the highlight. */
  readonly indicator: SlotAttributes<Message> | undefined
  readonly groups: ReadonlyArray<ResolvedListboxGroup<Message>>
}

/** Resolves the listbox's bundles (and every item's); pass-throughs stay intact. */
export const resolve = <Input, Message>(
  render: ListboxRenderInfo,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedListbox<Message> => {
  const builders = buildersOf(ListboxSlots, mixins, context)
  return {
    id: render.id,
    isVisible: render.isVisible,
    wrapper: builders.wrapper.attrs(render.wrapper),
    button: builders.button.attrs(render.button),
    buttonContent: render.buttonContent,
    hiddenInputs: render.hiddenInputs,
    backdrop:
      render.backdrop === undefined
        ? undefined
        : {
            key: render.backdrop.key,
            attributes: builders.backdrop.attrs(render.backdrop.attributes),
          },
    items:
      render.items === undefined
        ? undefined
        : {
            key: render.items.key,
            attributes: builders.items.attrs(render.items.attributes),
          },
    scroll: render.scroll === undefined ? undefined : builders.scroll.attrs(render.scroll),
    rows: render.items === undefined ? undefined : builders.rows.attrs(),
    highlight:
      render.items === undefined
        ? undefined
        : builders.highlight.attrs([context.h.AriaHidden(true)]),
    indicator:
      render.items === undefined
        ? undefined
        : builders.indicator.attrs([context.h.AriaHidden(true)]),
    groups: render.groups.map(group => ({
      key: group.key,
      heading:
        group.heading === undefined
          ? undefined
          : {
              id: group.heading.id,
              attributes: builders.heading.attrs(group.heading.attributes),
              content: group.heading.content,
            },
      group:
        group.group === undefined
          ? undefined
          : {
              key: group.group.key,
              attributes: builders.group.attrs(group.group.attributes),
            },
      separator:
        group.separator === undefined
          ? undefined
          : {
              key: group.separator.key,
              attributes: builders.separator.attrs(group.separator.attributes),
            },
      items: group.items.map(item => ({
        key: item.key,
        attributes: builders.item.attrs(item.attributes),
        content: item.content,
      })),
    })),
  }
}

/**
 * The listbox's `toView`: `draw` receives its bundles with `mixins` applied.
 * Without one, it draws upstream's markup from them.
 */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedListbox<Message>) => Html = resolved =>
      drawListbox(resolved, context.h),
  ) =>
  (render: ListboxRenderInfo): Html =>
    draw(resolve(render, mixins, context))

const chosen = '[aria-selected="true"]'

/**
 * What moves the open panel's `highlight` and `indicator`: on its rows,
 * the chosen row is measured (`--fk-popup-chosen-*`) and one highlight
 * follows the pointer to the nearest row (`--fk-popup-hover-*`),
 * and to the row the keys mark (`data-active`) while the pointer is away.
 * Pass them beside the style; until they run, each row marks itself.
 */
export const fluid = [
  Behavior.forSlots(ListboxSlots)<unknown, never>(
    {
      rows: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => Measure({ targets: { 'popup-chosen': chosen } }),
      }),
    },
    { name: 'ListboxChosen' },
  ).mixin,
  Behavior.forSlots(ListboxSlots)<unknown, never>(
    {
      rows: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({
            name: 'popup-hover',
            item: '[role="option"]',
            axis: 'y',
            gapClick: true,
            follows: '[data-active]',
            from: chosen,
          }),
      }),
    },
    { name: 'ListboxHover' },
  ).mixin,
] as const

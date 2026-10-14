import { Attr, Behavior, Capability, Event, Slot, Slots, type SlotAttributes } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { FluidHover, Measure } from 'foldkit-primitives/dom'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'
import type {
  ComboboxGroupRender,
  ComboboxHeadingRender,
  ComboboxItemRender,
  ComboboxRenderInfo,
} from './comboboxView.js'
import { drawCombobox } from './popupView.js'

/**
 * Combobox is a nested Submodel: an `input`/`inputWrapper` pair with an
 * optional `toggleButton`, plus a `backdrop`/`items` group with an `item`
 * per entry (and `group`/`heading`/`separator` where the caller groups), so
 * the resolver runs once per bundle and each base attribute passes through
 * by identity. `hiddenInputs` are the form inputs submitted under
 * `formName`: generated markup with no styling surface, passed through for
 * the draw to place.
 *
 * The input owns `input`/`keydown`/`blur` (and `focus` with `openOnFocus`);
 * an item owns `click` while interactive; the toggle owns `click` while
 * enabled. A Behavior adding its own handler to one of those is a
 * conflict, not a second silent owner.
 */
export const ComboboxSlots = Slots.define({
  wrapper: Slot.make({ capability: Capability.Container }),
  inputWrapper: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input, Event.KeyDown, Event.Blur, Event.Focus],
    attributes: [Attr.Role, Attr.AriaExpanded, Attr.Disabled, Attr.AriaDisabled],
  }),
  toggleButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded, Attr.Disabled, Attr.AriaDisabled],
  }),
  backdrop: Slot.make({ capability: Capability.Container, events: [Event.Click] }),
  items: Slot.make({
    capability: Capability.Container,
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

export type ResolvedComboboxItem<Message> = Omit<ComboboxItemRender, 'attributes'> & {
  readonly attributes: SlotAttributes<Message>
}

export type ResolvedComboboxHeading<Message> = Omit<ComboboxHeadingRender, 'attributes'> & {
  readonly attributes: SlotAttributes<Message>
}

export type ResolvedComboboxGroup<Message> = Omit<
  ComboboxGroupRender,
  'heading' | 'group' | 'separator' | 'items'
> & {
  readonly heading: ResolvedComboboxHeading<Message> | undefined
  readonly group: { key: string; attributes: SlotAttributes<Message> } | undefined
  readonly separator: { key: string; attributes: SlotAttributes<Message> } | undefined
  readonly items: ReadonlyArray<ResolvedComboboxItem<Message>>
}

export type ResolvedComboboxToggle<Message> = Readonly<{
  key: string
  attributes: SlotAttributes<Message>
  content: Html
}>

export type ResolvedCombobox<Message> = Omit<
  ComboboxRenderInfo,
  'wrapper' | 'inputWrapper' | 'input' | 'toggleButton' | 'backdrop' | 'items' | 'scroll' | 'groups'
> & {
  readonly wrapper: SlotAttributes<Message>
  readonly inputWrapper: SlotAttributes<Message>
  readonly input: SlotAttributes<Message>
  readonly toggleButton: ResolvedComboboxToggle<Message> | undefined
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
  readonly groups: ReadonlyArray<ResolvedComboboxGroup<Message>>
}

/** Resolves the combobox's bundles (and every item's). */
export const resolve = <Input, Message>(
  render: ComboboxRenderInfo,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedCombobox<Message> => {
  const builders = buildersOf(ComboboxSlots, mixins, context)
  return {
    id: render.id,
    isVisible: render.isVisible,
    wrapper: builders.wrapper.attrs(render.wrapper),
    inputWrapper: builders.inputWrapper.attrs(render.inputWrapper),
    input: builders.input.attrs(render.input),
    toggleButton:
      render.toggleButton === undefined
        ? undefined
        : {
            key: render.toggleButton.key,
            attributes: builders.toggleButton.attrs(render.toggleButton.attributes),
            content: render.toggleButton.content,
          },
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
    hiddenInputs: render.hiddenInputs,
  }
}

/**
 * The combobox's `toView`: `draw` receives its bundles with `mixins` applied.
 * Without one, it draws upstream's markup from them.
 */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedCombobox<Message>) => Html = resolved =>
      drawCombobox(resolved, context.h),
  ) =>
  (render: ComboboxRenderInfo): Html =>
    draw(resolve(render, mixins, context))

const chosen = '[aria-selected="true"]'

/**
 * What moves the open panel's `highlight` and `indicator`: on its rows,
 * the chosen row is measured (`--fk-popup-chosen-*`) and one highlight
 * follows the pointer to the nearest row (`--fk-popup-hover-*`),
 * and to the row the keys mark (`data-active`) while the pointer is away. A press in a gap is left alone: the field keeps focus.
 * Pass them beside the style; until they run, each row marks itself.
 */
export const fluid = [
  Behavior.forSlots(ComboboxSlots)<unknown, never>(
    {
      rows: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => Measure({ targets: { 'popup-chosen': chosen } }),
      }),
    },
    { name: 'ComboboxChosen' },
  ).mixin,
  Behavior.forSlots(ComboboxSlots)<unknown, never>(
    {
      rows: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({
            name: 'popup-hover',
            item: '[role="option"]',
            axis: 'y',
            gapClick: false,
            follows: '[data-active]',
            from: chosen,
          }),
      }),
    },
    { name: 'ComboboxHover' },
  ).mixin,
] as const

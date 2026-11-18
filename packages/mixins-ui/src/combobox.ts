import type { SlotAttributes } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { ComboboxSlots } from './combobox/slots.js'
import { drawOption } from './listbox.js'
import type { RowContent } from './rowContent.js'
import { scrollBarOf } from './popupScroll.js'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'
import type {
  ComboboxGroupRender,
  ComboboxHeadingRender,
  ComboboxItemRender,
  ComboboxRenderInfo,
} from './comboboxView.js'
import { drawCombobox } from './popupView.js'

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

type Part<Message> = { readonly key: string; readonly attributes: SlotAttributes<Message> }

export type ResolvedCombobox<Message> = Omit<
  ComboboxRenderInfo,
  | 'wrapper'
  | 'inputWrapper'
  | 'input'
  | 'toggleButton'
  | 'backdrop'
  | 'items'
  | 'scroll'
  | 'groups'
  | 'chips'
  | 'clearButton'
  | 'empty'
> & {
  /** The chips' list, while there are chips, and each chip with its remove button. */
  readonly chips:
    | {
        readonly attributes: SlotAttributes<Message>
        readonly chips: ReadonlyArray<
          Part<Message> & { readonly label: string; readonly remove: SlotAttributes<Message> }
        >
      }
    | undefined
  readonly clearButton: (Part<Message> & { readonly content: Html }) | undefined
  readonly empty: (Part<Message> & { readonly content: Html }) | undefined
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
  /** The overlay bar `overlayBars` drives, beside `scroll` in the panel, and its thumb: only with `scroll`. */
  readonly scrollBar: SlotAttributes<Message> | undefined
  readonly scrollThumb: SlotAttributes<Message> | undefined
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
    ...scrollBarOf(render.scroll !== undefined, builders, context.h),
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
    chips:
      render.chips.length === 0
        ? undefined
        : {
            attributes: builders.chips.attrs(),
            chips: render.chips.map(chip => ({
              key: chip.key,
              label: chip.label,
              attributes: builders.chip.attrs(),
              remove: builders.chipRemove.attrs([
                ...chip.remove,
                context.h.DataAttribute('glyph', 'cross'),
              ]),
            })),
          },
    clearButton:
      render.clearButton === undefined
        ? undefined
        : {
            key: render.clearButton.key,
            attributes: builders.clearButton.attrs(render.clearButton.attributes),
            content: render.clearButton.content,
          },
    empty:
      render.empty === undefined
        ? undefined
        : {
            key: render.empty.key,
            attributes: builders.empty.attrs(render.empty.attributes),
            content: render.empty.content,
          },
  }
}

/**
 * Upstream's markup with this package's parts placed: the chips before the
 * input and the clear button after it, in the field, and the empty panel
 * after the list.
 */
export const draw = <Message>(
  resolved: ResolvedCombobox<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const { chips, clearButton, empty } = resolved
  return drawCombobox(
    {
      ...resolved,
      beforeInput:
        chips === undefined
          ? []
          : [
              h.ul(
                chips.attributes,
                chips.chips.map(chip =>
                  h.keyed('li')(chip.key, chip.attributes, [
                    chip.label,
                    h.button(chip.remove, ['×']),
                  ]),
                ),
              ),
            ],
      afterInput:
        clearButton === undefined
          ? []
          : [h.keyed('button')(clearButton.key, clearButton.attributes, [clearButton.content])],
      afterPanel:
        empty === undefined ? [] : [h.keyed('div')(empty.key, empty.attributes, [empty.content])],
    },
    h,
  )
}

/**
 * An option's content in the combobox's slots: its icon, its label with the
 * typed `query` marked (or `content` of its own in the label's place), its
 * description, what it holds after the label, and the check the chosen row
 * shows. `disabled` is not drawn here: it is upstream's `isItemDisabled`.
 * Pass the mixins the combobox's `toView` gets.
 */
export const parts = <Message>(
  mixins: MixinList<Message>,
  context: ResolveContext<unknown, Message>,
) => {
  const builders = buildersOf(ComboboxSlots, mixins, context)
  return {
    option: (content: RowContent, query: string): Html =>
      drawOption(builders, context.h, content, query),
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
    drawResolved: (resolved: ResolvedCombobox<Message>) => Html = resolved =>
      draw(resolved, context.h),
  ) =>
  (render: ComboboxRenderInfo): Html =>
    drawResolved(resolve(render, mixins, context))

// The three shipped choices, a file each, so a page keeps only the one it reads.
export { many } from './choice/many.js'
export { one } from './choice/one.js'
export { text } from './choice/text.js'

// The slots, and each Behavior a page may not pass, are files of their own: a
// page keeps a Behavior, and the primitive behind it, only when it reads the name.
export { ComboboxSlots } from './combobox/slots.js'
export { fluid } from './combobox/fluid.js'
export { overlayBars } from './combobox/overlayBars.js'
// The Combobox drawn from options, its filters and its words.
export { contains, startsWith } from './combobox/filters.js'
export { configure, view, type ComboboxPreset, type ComboboxView } from './combobox/view.js'
export { words, type ComboboxWords } from './combobox/words.js'

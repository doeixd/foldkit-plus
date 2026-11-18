import type { SlotAttributes, SlotBuilder } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { ListboxSlots } from './listbox/slots.js'
import { scrollBarOf } from './popupScroll.js'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'
import type { RowContent } from './rowContent.js'
import type {
  ListboxGroupRender,
  ListboxHeadingRender,
  ListboxItemRender,
  ListboxRenderInfo,
} from './listboxView.js'
import { drawListbox } from './popupView.js'

type OptionSlot =
  | 'itemContent'
  | 'itemIcon'
  | 'itemText'
  | 'itemLabel'
  | 'itemDescription'
  | 'itemCheck'

/** `label` with each stretch that matches `query`, ignoring case, in the `match` builder's mark. */
const marked = <Message>(
  label: string,
  query: string,
  match: SlotBuilder<Message>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html | string> => {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [label]
  const hay = label.toLowerCase()
  const out: Array<Html | string> = []
  let from = 0
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, from)) {
    if (at > from) out.push(label.slice(from, at))
    out.push(h.mark(match.attrs(), [label.slice(at, at + needle.length)]))
    from = at + needle.length
  }
  if (from < label.length) out.push(label.slice(from))
  return out
}

/**
 * An option's content in the slots Listbox and Combobox share: its icon,
 * its label (the stretches matching `query` marked, where a `match` slot is
 * given) or `content` of its own in the label's place, its description, what
 * it holds after the label where the widget has an `itemTrailing` slot, and
 * the check the chosen row shows.
 */
export const drawOption = <Message>(
  builders: { readonly [K in OptionSlot]: SlotBuilder<Message> } & {
    readonly match?: SlotBuilder<Message>
    /** Where a row's `trailing` is drawn; a widget without the slot draws none. */
    readonly itemTrailing?: SlotBuilder<Message>
  },
  h: HtmlBuilder<Message>,
  content: Pick<RowContent, 'label' | 'description' | 'icon' | 'trailing' | 'content'>,
  query = '',
): Html =>
  h.span(builders.itemContent.attrs(), [
    ...iconOf(builders.itemIcon, h, content.icon),
    h.span(builders.itemText.attrs(), [
      h.span(
        builders.itemLabel.attrs(),
        content.content !== undefined
          ? [content.content]
          : builders.match === undefined
            ? [content.label]
            : marked(content.label, query, builders.match, h),
      ),
      ...(content.description === undefined
        ? []
        : [h.span(builders.itemDescription.attrs(), [content.description])]),
    ]),
    ...(builders.itemTrailing === undefined || content.trailing === undefined
      ? []
      : [h.span(builders.itemTrailing.attrs(), [content.trailing])]),
    // The row's `aria-selected` says it is chosen; the check is drawn for the eye.
    h.span(builders.itemCheck.attrs([h.AriaHidden(true)]), []),
  ])

const iconOf = <Message>(
  builder: SlotBuilder<Message>,
  h: HtmlBuilder<Message>,
  drawn: Html | undefined,
) => (drawn === undefined ? [] : [h.span(builder.attrs([h.AriaHidden(true)]), [drawn])])

/**
 * The parts of a select over this listbox, in its slots: `option` is an
 * item's content (`itemToConfig`), and `trigger` the button's
 * (`buttonContent`): what is chosen, or the placeholder, then the chevron.
 * One chosen row shows its icon and label, several their labels joined,
 * none the placeholder, muted; `shown` draws what it holds in place of that.
 * Pass the mixins the listbox's `toView` gets.
 */
export const parts = <Message>(
  mixins: MixinList<Message>,
  context: ResolveContext<unknown, Message>,
) => {
  const builders = buildersOf(ListboxSlots, mixins, context)
  const { h } = context
  return {
    option: (content: RowContent): Html => drawOption(builders, h, content),
    trigger: (
      chosen: ReadonlyArray<RowContent>,
      placeholder: string,
      shown?: Html | undefined,
    ): Html =>
      h.span(builders.value.attrs(), [
        ...(shown !== undefined
          ? [shown]
          : [
              ...(chosen.length === 1 ? iconOf(builders.itemIcon, h, chosen[0]?.icon) : []),
              h.span(
                builders.valueText.attrs([
                  h.DataAttribute('placeholder', String(chosen.length === 0)),
                ]),
                [chosen.length === 0 ? placeholder : chosen.map(row => row.label).join(', ')],
              ),
            ]),
        h.span(builders.chevron.attrs([h.AriaHidden(true)]), []),
      ]),
  }
}

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
  /** The overlay bar `overlayBars` drives, beside `scroll` in the panel, and its thumb: only with `scroll`. */
  readonly scrollBar: SlotAttributes<Message> | undefined
  readonly scrollThumb: SlotAttributes<Message> | undefined
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

// The three shipped choices, a file each, so a page keeps only the one it reads.
export { many } from './choice/many.js'
export { one } from './choice/one.js'

// The slots, and each Behavior a page may not pass, are files of their own: a
// page keeps a Behavior, and the primitive behind it, only when it reads the name.
export { ListboxSlots } from './listbox/slots.js'
export { fluid } from './listbox/fluid.js'
export { overlayBars } from './listbox/overlayBars.js'
// The Listbox drawn from options, and its words.
export { configure, view, type ListboxPreset, type ListboxView } from './listbox/view.js'
export { words, type ListboxWords } from './listbox/words.js'

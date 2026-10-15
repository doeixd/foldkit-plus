import * as UiVirtualList from '@foldkit/ui/virtualList'
import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { ScrollBars } from 'foldkit-primitives/dom'
import type { MixinList } from './resolve.js'

/**
 * `@foldkit/ui`'s virtual list, which draws only the rows in view and
 * spacers for the rest, so a list of thousands scrolls as one of thirty.
 * The list's Model is upstream's, which the application keeps and folds with
 * `VirtualList.update` from `@foldkit/ui/virtualList`, as it does a Menu's.
 *
 * Upstream draws its own scrolling `ul` and rows, and takes no `toView`, so
 * the slots are around and inside them: `root` is the box the list scrolls
 * within, which gives it its height, and `row` is each row's content. A row
 * is drawn inside the list's submodel, so its mixins may style it but not
 * handle its events: a handler there would speak the list's Messages. The
 * overlay `bar` and its `thumb` sit beside upstream's list, in `root`, which
 * runs `ScrollBars` for it: upstream's list holds a Mount of its own.
 */
export const VirtualListSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
  bar: Slot.make({ capability: Capability.Container }),
  thumb: Slot.make({ capability: Capability.Container }),
})

export type VirtualListView<Item, Message> = Readonly<{
  model: UiVirtualList.Model
  items: ReadonlyArray<Item>
  /** A key that stays with the item as the list changes. */
  itemToKey: (item: Item, index: number) => string
  /** A row's content, drawn in its `row` slot. */
  itemToView: (item: Item, index: number) => Html
  onMessage: (message: UiVirtualList.Message) => NoInfer<Message>
  /** Rows drawn beyond the view at each end. */
  overscan?: number | undefined
  /**
   * A thin bar over the list, which fades while it rests (`ScrollBars`), in
   * place of the browser's, on a pointer that can hover. Off by default: its
   * Mount sends no Message, which a Scene test would have to resolve.
   */
  overlayBars?: boolean | undefined
  /** A style of `VirtualListSlots`, for the look. */
  style?: NamedStyle<typeof VirtualListSlots> | undefined
  /** Mixins beside the style. */
  mixins?: MixinList<Message> | undefined
}> &
  UiVirtualList.RowHeightInputs<Item>

export const view = <Item, Message>(
  options: VirtualListView<Item, Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    VirtualListSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { model, items, itemToKey, itemToView, onMessage, overscan } = options
  const overlay = options.overlayBars === true
  return h.div(
    builders.root.attrs(overlay ? [h.OnMount(ScrollBars({ scroller: ':scope > ul' }))] : []),
    [
      h.submodel({
        slotId: model.id,
        model,
        view: UiVirtualList.view<Item>(),
        viewInputs: {
          items,
          itemToKey,
          itemToView: (item: Item, index: number) =>
            h.div(builders.row.attrs(), [itemToView(item, index)]),
          ...(overscan === undefined ? {} : { overscan }),
          ...rowHeights(options),
        },
        toParentMessage: onMessage,
      }),
      // Hidden from assistive technology: the list is what a reader scrolls.
      ...(overlay
        ? [
            h.div(
              builders.bar.attrs([h.DataAttribute('scroll-bar', 'block'), h.AriaHidden(true)]),
              [h.div(builders.thumb.attrs(), [])],
            ),
          ]
        : []),
    ],
  )
}

/** The one row-height input the options chose, as upstream's union holds it. */
const rowHeights = <Item>(
  options: UiVirtualList.RowHeightInputs<Item>,
): UiVirtualList.RowHeightInputs<Item> => {
  if (options.dynamicRowHeights === true) {
    return {
      dynamicRowHeights: true,
      ...(options.itemToEstimatedRowHeightPx === undefined
        ? {}
        : { itemToEstimatedRowHeightPx: options.itemToEstimatedRowHeightPx }),
    }
  }
  return options.itemToRowHeightPx === undefined
    ? {}
    : { itemToRowHeightPx: options.itemToRowHeightPx }
}

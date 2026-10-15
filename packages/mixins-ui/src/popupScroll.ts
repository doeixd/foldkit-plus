/**
 * The overlay bar the popups (Menu, Listbox, Combobox) draw beside their
 * panel's `scroll`: their `scrollBar` and `scrollThumb` slots, which
 * `ScrollBars` on `scroll` drives. The panel carries upstream's anchor, and
 * an element holds one Mount, so the Mount goes on `scroll` and the bar beside
 * it, in the panel.
 */
import type { HtmlBuilder } from 'foldkit/html'
import type { SlotAttributes } from 'foldkit-mixins'

type Builder<Message> = {
  readonly attrs: (base?: SlotAttributes<Message>) => SlotAttributes<Message>
}

/** The bar and its thumb while the panel has a `scroll`, and nothing otherwise. */
export const scrollBarOf = <Message>(
  scrolls: boolean,
  builders: { readonly scrollBar: Builder<Message>; readonly scrollThumb: Builder<Message> },
  h: HtmlBuilder<Message>,
): {
  readonly scrollBar: SlotAttributes<Message> | undefined
  readonly scrollThumb: SlotAttributes<Message> | undefined
} =>
  scrolls
    ? {
        // Hidden from assistive technology: the list is what a reader scrolls.
        scrollBar: builders.scrollBar.attrs([
          h.DataAttribute('scroll-bar', 'block'),
          h.AriaHidden(true),
        ]),
        scrollThumb: builders.scrollThumb.attrs(),
      }
    : { scrollBar: undefined, scrollThumb: undefined }

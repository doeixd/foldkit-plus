import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * Page navigation publishes its regions as slots; it owns no state, only the
 * controlled page it is given. The application moves the page in `onPage`;
 * this draws where it is. A single page — or none — draws nothing, since
 * there is nowhere to go.
 */
export const PaginationSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  prev: Slot.make({ capability: Capability.Interactive }),
  next: Slot.make({ capability: Capability.Interactive }),
  page: Slot.make({ capability: Capability.Interactive }),
  ellipsis: Slot.make({ capability: Capability.Container }),
})

/** One numbered stop, or a collapsed run of them. */
export type PaginationItem = number | 'ellipsis'

/**
 * The stops to draw: every page while they fit, otherwise the first, the
 * last, the current with its neighbours, and an ellipsis for each run
 * between. Pure, so the window is testable without drawing.
 */
export const itemsOf = (page: number, pageCount: number): ReadonlyArray<PaginationItem> => {
  const count = Math.max(0, Math.floor(pageCount))
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1)
  const current = Math.min(count, Math.max(1, Math.floor(page)))
  const stops = [...new Set([1, current - 1, current, current + 1, count])]
    .filter(stop => stop >= 1 && stop <= count)
    .sort((a, b) => a - b)
  const items: Array<PaginationItem> = []
  for (const [index, stop] of stops.entries()) {
    if (index > 0 && stop - (stops[index - 1] as number) > 1) items.push('ellipsis')
    items.push(stop)
  }
  return items
}

/**
 * Page navigation in one call: the controlled page, how many there are, what
 * choosing one causes, a style for its slots, and mixins beside the style.
 * No upstream component stands behind it.
 */
export interface PaginationView<Message> {
  readonly page: number
  readonly pageCount: number
  readonly onPage: (page: number) => Message
  /** The landmark's name. Default: `'Pagination'`. */
  readonly label?: string | undefined
  /** A style of `PaginationSlots`, for the navigation's look. */
  readonly style?: NamedStyle<typeof PaginationSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Message>(options: PaginationView<Message>, h: HtmlBuilder<Message>): Html => {
  if (Math.floor(options.pageCount) < 2) return h.empty
  const builders = SlotView.buildersFor(
    PaginationSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const count = Math.max(0, Math.floor(options.pageCount))
  const current = Math.min(count, Math.max(1, Math.floor(options.page)))
  const stop = (page: number, slot: 'prev' | 'next', text: string, atEnd: boolean) =>
    h.button(
      builders[slot].attrs([
        h.OnClick(options.onPage(page)),
        h.Disabled(atEnd),
        h.AriaLabel(`${text} page`),
      ]),
      [text],
    )
  return h.nav(
    builders.root.attrs([h.AriaLabel(options.label ?? 'Pagination'), h.Role('navigation')]),
    [
      stop(current - 1, 'prev', 'Previous', current === 1),
      ...itemsOf(current, count).map(item =>
        item === 'ellipsis'
          ? h.span(builders.ellipsis.attrs(), ['…'])
          : h.button(
              builders.page.attrs([
                h.OnClick(options.onPage(item)),
                ...(item === current ? [h.AriaCurrent('page')] : []),
              ]),
              [String(item)],
            ),
      ),
      stop(current + 1, 'next', 'Next', current === count),
    ],
  )
}

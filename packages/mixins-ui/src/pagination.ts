import { Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
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
  summary: Slot.make({ capability: Capability.Container }),
  first: Slot.make({ capability: Capability.Interactive }),
  prev: Slot.make({ capability: Capability.Interactive }),
  next: Slot.make({ capability: Capability.Interactive }),
  last: Slot.make({ capability: Capability.Interactive }),
  page: Slot.make({ capability: Capability.Interactive }),
  /**
   * After the current stop's number, `" / 12"`, hidden from assistive
   * technology so the stop's name stays its number: the recipe shows it where
   * `compact` hides the other numbers.
   */
  pageCount: Slot.make({ capability: Capability.Container }),
  ellipsis: Slot.make({ capability: Capability.Container }),
  /** The page-size choice: its words and the select inside them. */
  perPage: Slot.make({ capability: Capability.Container }),
  perPageSelect: Slot.make({ capability: Capability.Interactive, events: [Event.Change] }),
})

/** One numbered stop, or a collapsed run of them. */
export type PaginationItem = number | 'ellipsis'

/** How many stops stand around the current page and at each end. */
export interface PaginationWindow {
  /** Stops either side of the current page; default 1. */
  readonly siblings?: number | undefined
  /** Stops at each end; default 1. */
  readonly boundaries?: number | undefined
}

/**
 * The stops to draw: every page while they fit, otherwise the first and last
 * `boundaries`, the current with `siblings` either side, and an ellipsis for
 * each run between. A run of one page draws that page, since an ellipsis
 * would take its room and hide it. Pure, so the window is testable without
 * drawing.
 */
export const itemsOf = (
  page: number,
  pageCount: number,
  window: PaginationWindow = {},
): ReadonlyArray<PaginationItem> => {
  const count = Math.max(0, Math.floor(pageCount))
  const siblings = Math.max(0, Math.floor(window.siblings ?? 1))
  const boundaries = Math.max(1, Math.floor(window.boundaries ?? 1))
  if (count <= 2 * boundaries + 2 * siblings + 3) {
    return Array.from({ length: count }, (_, index) => index + 1)
  }
  const current = Math.min(count, Math.max(1, Math.floor(page)))
  const ends = Array.from({ length: boundaries }, (_, index) => [index + 1, count - index]).flat()
  const near = Array.from({ length: 2 * siblings + 1 }, (_, index) => current - siblings + index)
  const stops = [...new Set([...ends, ...near])]
    .filter(stop => stop >= 1 && stop <= count)
    .sort((a, b) => a - b)
  const items: Array<PaginationItem> = []
  for (const [index, stop] of stops.entries()) {
    const previous = index === 0 ? stop - 1 : (stops[index - 1] as number)
    if (stop - previous === 2) items.push(stop - 1)
    else if (stop - previous > 2) items.push('ellipsis')
    items.push(stop)
  }
  return items
}

/** The rows a page may show, for a select of them; its value is the range's `perPage`. */
export interface PaginationPerPage<Message> {
  /** The sizes to choose from, such as `[10, 20, 50]`. */
  readonly sizes: ReadonlyArray<number>
  /** Sent with the size chosen; the application sets `perPage` and the page that keeps its rows in view. */
  readonly onPerPage: (perPage: number) => Message
  /** The words before the select; default `"Rows per page"`. */
  readonly label?: string | undefined
}

/** The rows a page shows, from 1, and how many there are in all: what `summary` says. */
export interface PaginationRange<Message = never> {
  /** Rows in all. */
  readonly total: number
  /** Rows a page shows. */
  readonly perPage: number
  /** The words; default `"1–10 of 97"`. */
  readonly text?: ((from: number, to: number, total: number) => string) | undefined
  /** A select of how many rows a page shows, beside the summary. */
  readonly choose?: PaginationPerPage<Message> | undefined
}

/**
 * Page navigation in one call: the controlled page, how many there are, what
 * choosing one causes, a style for its slots, and mixins beside the style.
 * No upstream component stands behind it.
 */
export interface PaginationView<Message> extends PaginationWindow {
  readonly page: number
  readonly pageCount: number
  readonly onPage: (page: number) => Message
  /** The landmark's name. Default: `'Pagination'`. */
  readonly label?: string | undefined
  /** Draws the numbered stops; `false` leaves previous and next alone. Default true. */
  readonly numbered?: boolean | undefined
  /** Draws first and last beside previous and next. Default false. */
  readonly ends?: boolean | undefined
  /** Says which rows the page shows, before the stops: `"1–10 of 97"`. */
  readonly range?: PaginationRange<Message> | undefined
  /** A style of `PaginationSlots`, for the navigation's look. */
  readonly style?: NamedStyle<typeof PaginationSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const shown = (from: number, to: number, total: number): string => `${from}–${to} of ${total}`

/** The first and last row page `page` shows, and the total: `"11–20 of 97"`. */
export const summaryOf = <Message>(page: number, range: PaginationRange<Message>): string => {
  const total = Math.max(0, Math.floor(range.total))
  const perPage = Math.max(1, Math.floor(range.perPage))
  const from = Math.min(total, (page - 1) * perPage + 1)
  const to = Math.min(total, page * perPage)
  return (range.text ?? shown)(from, to, total)
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
  const stop = (
    page: number,
    slot: 'first' | 'prev' | 'next' | 'last',
    text: string,
    atEnd: boolean,
  ) =>
    h.button(
      builders[slot].attrs([
        h.OnClick(options.onPage(page)),
        h.Disabled(atEnd),
        h.AriaLabel(`${text} page`),
      ]),
      [text],
    )
  const ends = options.ends === true
  const range = options.range
  const choose = range?.choose
  const perPage =
    range === undefined || choose === undefined
      ? []
      : [
          h.label(builders.perPage.attrs(), [
            choose.label ?? 'Rows per page',
            h.select(
              builders.perPageSelect.attrs([h.OnChange(value => choose.onPerPage(Number(value)))]),
              choose.sizes.map(size =>
                h.option(
                  [h.Value(String(size)), h.Selected(size === range.perPage)],
                  [String(size)],
                ),
              ),
            ),
          ]),
        ]
  return h.nav(
    builders.root.attrs([h.AriaLabel(options.label ?? 'Pagination'), h.Role('navigation')]),
    [
      ...(range === undefined
        ? []
        : [h.span(builders.summary.attrs(), [summaryOf(current, range)])]),
      ...perPage,
      ...(ends ? [stop(1, 'first', 'First', current === 1)] : []),
      stop(current - 1, 'prev', 'Previous', current === 1),
      ...(options.numbered === false
        ? []
        : itemsOf(current, count, options).map(item =>
            item === 'ellipsis'
              ? h.span(builders.ellipsis.attrs(), ['…'])
              : h.button(
                  builders.page.attrs([
                    h.OnClick(options.onPage(item)),
                    ...(item === current ? [h.AriaCurrent('page')] : []),
                  ]),
                  item === current
                    ? [
                        String(item),
                        h.span(builders.pageCount.attrs([h.AriaHidden(true)]), [` / ${count}`]),
                      ]
                    : [String(item)],
                ),
          )),
      stop(current + 1, 'next', 'Next', current === count),
      ...(ends ? [stop(count, 'last', 'Last', current === count)] : []),
    ],
  )
}

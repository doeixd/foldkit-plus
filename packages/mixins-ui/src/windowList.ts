/**
 * A virtual list that scrolls with the window: it draws the rows in view of
 * the document's viewport, and spacers as tall as the rest, so a list of
 * thousands below a header and above a footer costs what thirty rows do,
 * while the page keeps its own scrolling. Nothing in it scrolls: the
 * browser restores the document's offset on back and reload, a `sticky`
 * header above it sticks, and the page's keys (Space, End) move it.
 *
 * ```text
 * Track (on root) -> Placed { top, height } -> update -> viewport
 *                 -> Measured { rows }      -> update -> heights
 * view: windowOf(model, keys) -> start spacer, rows [start, end), end spacer
 * ```
 *
 * `top` is how far the viewport's top is past the list's, so content above
 * the list, or growing above it, is read every time and never assumed. A
 * row's height is its border box, measured once drawn; until then it is
 * `estimatedHeight`, or with `unmeasured: 'mean'` the mean of the rows
 * measured. A row is drawn `display: flow-root`, so space rows with
 * padding, not margins. `@foldkit/ui`'s `VirtualList` is the list in a box
 * of its own.
 *
 * A server's page can open the list at a row (`init({ from })`): its window
 * starts there, and the rows above it take no room until `Track` places the
 * list, which gives them their room and scrolls the window by as much, so
 * the row stays where the reader saw it. A page without scripts draws that
 * window in the page's flow (`Recipes.WindowList` hides the spacers) and
 * pages by links (`pageOf`).
 */
import { Effect, Equal, Option, Queue, Schema, Stream } from 'effect'
import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { Scene } from 'foldkit/test'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import * as Command from 'foldkit/command'
import * as Render from 'foldkit/render'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import {
  MeasureRows,
  offsetFor,
  totalHeight,
  visibleRange,
  WindowViewport,
  type VirtualLayout,
  type VirtualWindow,
} from 'foldkit-primitives/state'
import type { MixinList } from './resolve.js'

export const WindowListSlots = Slots.define({
  /** The list, in the page's flow, as tall as every row. */
  root: Slot.make({ capability: Capability.Container }),
  /** The room the rows not drawn take, at each end (`data-edge`). */
  spacer: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
})

export const Model = Schema.Struct({
  id: Schema.String,
  /** A row's height until it is measured, in pixels; kept at the mean of `heights` under `'mean'`. */
  estimatedHeight: Schema.Number,
  /** What a row not yet measured counts: `init`'s estimate, or the mean of the rows measured. */
  unmeasured: Schema.Literals(['estimate', 'mean']),
  /** Rows drawn beyond the viewport at each end. */
  overscan: Schema.Number,
  /** Measured border-box heights, by row key. */
  heights: Schema.Record(Schema.String, Schema.Number),
  /** Where the viewport lies over the list: its top past the list's top, and its height. */
  viewport: Schema.Struct({ top: Schema.Number, height: Schema.Number }),
  /** The row the window starts at until the list is placed; 0 after. */
  from: Schema.Number,
  /** The key of the row holding focus, which stays drawn while it is outside the window. */
  held: Schema.OptionFromNullOr(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Placed: { top: Schema.Number, height: Schema.Number },
  /** The rows drawn or resized since the last report, border boxes. */
  Measured: { rows: Schema.Array(Schema.Struct({ key: Schema.String, height: Schema.Number })) },
  /** The row now holding focus, or none once focus left the list. */
  Focused: { key: Schema.Option(Schema.String) },
  /** `Reveal` has brought its row into view, or given up on it. */
  CompletedReveal: {},
})
export type Message = typeof Message.Type

export interface InitConfig {
  /** The list's id, unique in the document. */
  readonly id: string
  /** A row's height until it is measured, in pixels. */
  readonly estimatedHeight: number
  /**
   * What a row not yet measured counts. `'estimate'` (the default) is
   * `estimatedHeight`. `'mean'` is the mean of the rows measured above 0, and
   * `estimatedHeight` until one is: for rows of one height that the window's
   * width decides (a grid of one column on a phone and three on a desktop),
   * which `init`, run before any width is known, cannot pick, so the list's
   * length is right once one row is measured rather than moving as each is.
   */
  readonly unmeasured?: Model['unmeasured']
  /** Rows drawn beyond the viewport at each end. Default 5. */
  readonly overscan?: number
  /**
   * The viewport's height assumed before the list is mounted, on a server and
   * in the first frame, where the viewport is taken to start at the list.
   * Default 1000.
   */
  readonly viewportHeight?: number
  /**
   * The row the list opens at, as a page's address names it (`?from=`): the
   * window starts at that row, with no overscan above it, until the list is
   * placed; a row past the last viewport's worth opens that last viewport.
   * Default 0.
   */
  readonly from?: number
}

/**
 * A list with nothing measured. Throws on an estimate that is not above 0, or
 * an overscan or a `from` that is not a whole number.
 */
export const init = (config: InitConfig): Model => {
  const overscan = config.overscan ?? 5
  const from = config.from ?? 0
  if (!(config.estimatedHeight > 0 && Number.isFinite(config.estimatedHeight))) {
    throw new Error(
      `WindowList ${config.id}: estimatedHeight must be above 0, given ${config.estimatedHeight}`,
    )
  }
  for (const [name, value] of [
    ['overscan', overscan],
    ['from', from],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`WindowList ${config.id}: ${name} must be a whole number, given ${value}`)
    }
  }
  return {
    id: config.id,
    estimatedHeight: config.estimatedHeight,
    unmeasured: config.unmeasured ?? 'estimate',
    overscan,
    heights: {},
    viewport: { top: 0, height: config.viewportHeight ?? 1000 },
    from,
    held: Option.none(),
  }
}

/**
 * `model` with `heights`, and under `'mean'` its estimate their mean; the
 * last mean stays while no row measured is above 0, since a row seen at this
 * width is a better guess than `init`'s.
 */
const withHeights = (model: Model, heights: Model['heights']): Model => {
  const measured = Object.values(heights).filter(height => height > 0)
  const estimatedHeight =
    model.unmeasured === 'mean' && measured.length > 0
      ? measured.reduce((sum, height) => sum + height, 0) / measured.length
      : model.estimatedHeight
  return modifyFields(model, { heights: () => heights, estimatedHeight: () => estimatedHeight })
}

/** The list after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    Placed: ({ top, height }) =>
      top === model.viewport.top && height === model.viewport.height && model.from === 0
        ? { model }
        : { model: modifyFields(model, { viewport: () => ({ top, height }), from: () => 0 }) },
    CompletedReveal: () => ({ model }),
    Focused: ({ key }) =>
      Equal.equals(key, model.held)
        ? { model }
        : { model: modifyFields(model, { held: () => key }) },
    Measured: ({ rows }) => {
      // A poisoned reading is ignored; a row drawn again reports the height held.
      const changed = rows.filter(
        ({ key, height }) =>
          Number.isFinite(height) &&
          height >= 0 &&
          !(Object.hasOwn(model.heights, key) && model.heights[key] === height),
      )
      return changed.length === 0
        ? { model }
        : {
            model: withHeights(
              model,
              Object.fromEntries([
                ...Object.entries(model.heights),
                ...changed.map(({ key, height }) => [key, height] as const),
              ]),
            ),
          }
    },
  })

/**
 * The Model without the heights of rows no longer in `keys` (and not the row
 * holding focus), its `'mean'` taken again over those kept; the same Model
 * when none left.
 */
export const keep = (model: Model, keys: ReadonlyArray<string>): Model => {
  const kept = new Set(
    Option.match(model.held, { onNone: () => keys, onSome: key => [...keys, key] }),
  )
  const entries = Object.entries(model.heights)
  const held = entries.filter(([key]) => kept.has(key))
  return held.length === entries.length ? model : withHeights(model, Object.fromEntries(held))
}

const layoutOf = (model: Model): VirtualLayout => ({
  estimatedHeight: model.estimatedHeight,
  gap: 0,
  paddingStart: 0,
  paddingEnd: 0,
})

/**
 * The window of a list opened at `row`: the viewport's worth from that row,
 * or from the last viewport's worth when `row` is past its start, and
 * `overscan` more below.
 */
const openedAt = (model: Model, keys: ReadonlyArray<string>, row: number): VirtualWindow => {
  const layout = layoutOf(model)
  const { height } = model.viewport
  const total = totalHeight(keys, model.heights, layout)
  const last = visibleRange(keys, model.heights, layout, total - height, height, 0).start
  const start = Math.min(row, last)
  const top = offsetFor(start, keys, model.heights, layout)
  return {
    start,
    end: visibleRange(keys, model.heights, layout, top, height, model.overscan).end,
  }
}

/**
 * The rows drawn, `[start, end)`: those the viewport overlaps, and
 * `overscan` more at each end; until a list opened at a row is placed, the
 * rows from that one. Keep `keys` between calls: the offsets are cached by
 * its identity.
 */
export const windowOf = (model: Model, keys: ReadonlyArray<string>): VirtualWindow =>
  model.from === 0
    ? visibleRange(
        keys,
        model.heights,
        layoutOf(model),
        model.viewport.top,
        // The part of the viewport below the list's top. A pixel at least, so a
        // list wholly above or below the viewport keeps its overscan at that end.
        Math.max(1, model.viewport.height + Math.min(0, model.viewport.top)),
        model.overscan,
      )
    : openedAt(model, keys, model.from)

/**
 * The rows drawn and the rows to open next, for links that page a list
 * without scripts (`?from=`): `previous` is the first row whose window
 * reaches this one's start, `next` this one's end; none at either end of
 * the list.
 */
export interface Page {
  readonly start: number
  readonly end: number
  readonly previous: Option.Option<number>
  readonly next: Option.Option<number>
}

/** The page `windowOf` draws, and the rows the pages either side of it open at. */
export const pageOf = (model: Model, keys: ReadonlyArray<string>): Page => {
  const { start, end } = windowOf(model, keys)
  // A window's end only grows with the row it opens at: search for the first that reaches.
  let low = 0
  let high = start
  while (low < high) {
    const middle = (low + high) >>> 1
    if (openedAt(model, keys, middle).end >= start) high = middle
    else low = middle + 1
  }
  return {
    start,
    end,
    previous: start > 0 ? Option.some(low) : Option.none(),
    next: end < keys.length ? Option.some(end) : Option.none(),
  }
}

// A row's index by key, built once per keys array and only when a row holds focus.
const indexCache = new WeakMap<ReadonlyArray<string>, ReadonlyMap<string, number>>()

const indexByKey = (keys: ReadonlyArray<string>): ReadonlyMap<string, number> => {
  const cached = indexCache.get(keys)
  if (cached !== undefined) return cached
  const built = new Map(keys.map((key, index) => [key, index] as const))
  indexCache.set(keys, built)
  return built
}

/**
 * The row holding focus, when it is still in `keys` and not the list opened
 * at a row. The list draws it beside the window, so a reader keeps their place
 * in the tab order while it is scrolled away.
 */
export const heldRow = (model: Model, keys: ReadonlyArray<string>): Option.Option<number> =>
  model.from === 0
    ? Option.flatMap(model.held, key => Option.fromNullishOr(indexByKey(keys).get(key)))
    : Option.none()

export type WindowListView<Item, Outer> = Readonly<{
  model: Model
  items: ReadonlyArray<Item>
  /** A key that stays with the item as the list changes. */
  itemToKey: (item: Item, index: number) => string
  /** A row's content, drawn in its `row` slot. */
  itemToView: (item: Item, index: number) => Html
  onMessage: (message: Message) => NoInfer<Outer>
  /** Names the list for assistive technology. */
  label?: string | undefined
  /** A style of `WindowListSlots`. */
  style?: NamedStyle<typeof WindowListSlots> | undefined
  /** Mixins beside the style. */
  mixins?: MixinList<Outer> | undefined
}>

/** The attribute naming a row's key, which `MeasureRows` files its height under. */
const ROW_KEY = 'data-window-list-key'

/**
 * Set to 1 on `root` by `Track`: until then the start spacer of a list
 * opened at a row takes no room, so the row drawn first is at the list's top.
 */
const PLACED = '--fk-window-list-placed'

/**
 * Gives the rows above a list opened at a row their room, and scrolls the
 * window by what that moved the first row drawn, so it stays where it was
 * seen. Measured, not taken from the spacer, so it holds whatever else
 * moved the row.
 */
const place = (root: Element) => {
  if (!(root instanceof HTMLElement)) return
  const first = root.querySelector(`:scope > [${ROW_KEY}]`)
  const before = first?.getBoundingClientRect().top ?? 0
  root.style.setProperty(PLACED, '1')
  const moved = (first?.getBoundingClientRect().top ?? 0) - before
  if (moved !== 0) window.scrollBy({ top: moved, behavior: 'instant' })
}

// The keys of an items array, kept while the array and its key function are,
// so the offsets table built from them is reused from one scroll to the next.
const keysCache = new WeakMap<
  ReadonlyArray<unknown>,
  { readonly itemToKey: unknown; readonly keys: ReadonlyArray<string> }
>()

const keysOf = <Item>(
  items: ReadonlyArray<Item>,
  itemToKey: (item: Item, index: number) => string,
): ReadonlyArray<string> => {
  const cached = keysCache.get(items)
  if (cached !== undefined && cached.itemToKey === itemToKey) return cached.keys
  const keys = items.map(itemToKey)
  keysCache.set(items, { itemToKey, keys })
  return keys
}

/** Where `Reveal` puts the row in the viewport: `nearest` scrolls only as far as shows it. */
export const Align = Schema.Literals(['nearest', 'start', 'center', 'end'])
export type Align = typeof Align.Type

const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

/** How many scrolls `Reveal` makes before giving up; each follows a frame of drawing and measuring. */
const REVEAL_ATTEMPTS = 12

const drawnRows = (list: Element): ReadonlyArray<HTMLElement> =>
  Array.from(list.querySelectorAll<HTMLElement>(`:scope > [${ROW_KEY}]`))

/**
 * Scrolls the document until row `index` of list `id` is drawn and in place.
 * A row not drawn is as many mean row heights away as rows lie between it
 * and the one drawn nearest the viewport's middle; the scroll redraws the
 * window there and measures its rows, so each pass is nearer; a row drawn is
 * brought to `align` until it stops moving, since measuring its neighbours
 * moves it. Scrolls at once: Chromium drops a key pressed in the last frame
 * of its own animated scroll (#406), and a reveal is a jump.
 */
const revealRow = async (id: string, index: number, align: Align): Promise<void> => {
  let previous = Number.NaN
  for (let attempt = 0; attempt < REVEAL_ATTEMPTS; attempt++) {
    const list = document.getElementById(id)
    if (list === null) return
    const rows = drawnRows(list)
    const target = rows.find(row => row.getAttribute('aria-posinset') === String(index + 1))
    if (target !== undefined) {
      target.scrollIntoView({ block: align, inline: 'nearest', behavior: 'instant' })
      // Measuring its neighbours moves it: once more, until it stays.
      await frame()
      await frame()
      const top = target.getBoundingClientRect().top
      if (target.isConnected && top === previous) return
      previous = top
      continue
    }
    const middle = window.innerHeight / 2
    const nearest = rows.reduce<HTMLElement | undefined>(
      (best, row) =>
        best === undefined ||
        Math.abs(row.getBoundingClientRect().top - middle) <
          Math.abs(best.getBoundingClientRect().top - middle)
          ? row
          : best,
      undefined,
    )
    const first = rows[0]
    const last = rows.at(-1)
    if (nearest === undefined || first === undefined || last === undefined) return
    const mean =
      (last.getBoundingClientRect().bottom - first.getBoundingClientRect().top) / rows.length
    const at = Number(nearest.getAttribute('aria-posinset')) - 1
    window.scrollBy({ top: (index - at) * mean, behavior: 'instant' })
    await frame()
    await frame()
  }
}

/**
 * Brings row `index` of the list `id` into view, however far it is. Returned
 * by `reveal`; an application's own `update` returns that.
 */
export const Reveal = Command.define('WindowList.Reveal', {
  args: { id: Schema.String, index: Schema.Number, align: Align },
  messages: [Message.CompletedReveal],
  execute: ({ id, index, align }) =>
    Render.afterCommit.pipe(
      Effect.flatMap(() => Effect.promise(() => revealRow(id, index, align))),
      Effect.map(() => Message.CompletedReveal()),
    ),
})

/**
 * The Command that scrolls the page until row `index` of `model`'s list is
 * drawn and shown at `align` (`'nearest'` by default). Return it from an
 * `update`: a row far outside the window is not drawn, so it cannot be
 * scrolled to by element, and the window's own scroll then moves it in.
 */
export const reveal = (model: Model, index: number, align: Align = 'nearest') =>
  Reveal({ id: model.id, index, align })

/**
 * Which row holds focus, as `Focused`. A keyed row that must stay drawn is
 * moved in the DOM when it changes side of the window, and a move drops
 * focus (a blur with no new target, then `body`), so a move that took focus
 * from the held row's control gives it back. Told from a reader leaving by
 * the records of the list's children: a blur alone is ambiguous.
 */
const followFocus = (element: Element): Stream.Stream<ReturnType<typeof Message.Focused>> =>
  Stream.callback<ReturnType<typeof Message.Focused>>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        let held = Option.none<{ readonly row: Element; readonly control: Element }>()
        let reported = Option.none<string>()
        const report = (next: Option.Option<string>) => {
          if (Equal.equals(next, reported)) return
          reported = next
          Queue.offerUnsafe(queue, Message.Focused({ key: next }))
        }
        const rowOf = (node: EventTarget | null): Option.Option<Element> => {
          for (let at = node instanceof Element ? node : null; at !== null && at !== element;) {
            if (at.parentElement === element && at.hasAttribute(ROW_KEY)) return Option.some(at)
            at = at.parentElement
          }
          return Option.none()
        }
        const release = () => {
          held = Option.none()
          report(Option.none())
        }
        const enter = (target: EventTarget | null) => {
          if (!(target instanceof Element)) return release()
          const row = rowOf(target)
          held = Option.map(row, row => ({ row, control: target }))
          report(Option.flatMap(row, row => Option.fromNullishOr(row.getAttribute(ROW_KEY))))
        }
        const adrift = () => {
          const active = document.activeElement
          return active === null || active === document.body
        }
        const restoreAfterMove = (records: ReadonlyArray<MutationRecord>) => {
          Option.match(held, {
            onNone: () => undefined,
            onSome: ({ row, control }) => {
              const moved = records.some(
                record =>
                  Array.from(record.addedNodes).includes(row) ||
                  Array.from(record.removedNodes).includes(row),
              )
              if (moved && control.isConnected && adrift() && control instanceof HTMLElement) {
                control.focus({ preventScroll: true })
              }
            },
          })
        }
        // A browser that fires no blur when its focused node leaves still
        // changes the DOM: the held row going is told by its records too.
        const children = new MutationObserver(records => {
          restoreAfterMove(records)
          if (Option.exists(held, ({ row }) => !row.isConnected)) release()
        })
        children.observe(element, { childList: true })
        const onFocusIn = (event: Event) => enter(event.target)
        // After the patch that moved the row, not during it.
        const onFocusOut = () =>
          queueMicrotask(() => {
            restoreAfterMove(children.takeRecords())
            if (Option.exists(held, ({ row }) => !row.contains(document.activeElement))) release()
          })
        element.addEventListener('focusin', onFocusIn)
        element.addEventListener('focusout', onFocusOut)
        enter(document.activeElement)
        return () => {
          element.removeEventListener('focusin', onFocusIn)
          element.removeEventListener('focusout', onFocusOut)
          children.disconnect()
        }
      }),
      detach => Effect.sync(detach),
    ),
  )

/**
 * The list's one Mount, on its `root`: where the viewport lies over the list
 * (`WindowViewport`, as `Placed`) and the heights of the rows drawn
 * (`MeasureRows`, as `Measured`). A failure in either ends both, reported
 * as this Mount's. Before either reads, it gives the rows above a list opened
 * at a row their room. A Scene test resolves it with `resolveTrack`.
 */
export const Track = Mount.defineStream('WindowList.Track', {
  messages: [Message.Placed, Message.Measured, Message.Focused],
  execute: ({ element, viewStateChanges }) =>
    // After the patch that inserted the list: a hydrating runtime compares
    // the page it adopted with the server's once the patch ends.
    Stream.unwrap(
      Effect.map(Effect.yieldNow, () => {
        place(element)
        return Stream.merge(
          Stream.merge(
            WindowViewport()
              .f(element, viewStateChanges)
              .pipe(Stream.map(({ top, height }) => Message.Placed({ top, height }))),
            MeasureRows({ attribute: ROW_KEY })
              .f(element, viewStateChanges)
              .pipe(Stream.map(({ rows }) => Message.Measured({ rows }))),
          ),
          followFocus(element),
        )
      }),
    ),
})

/**
 * `Track` resolved with `reading`, for a Scene test of a page that draws the
 * list: the reading goes through the view's own `onMessage`, as it does when
 * the Mount reports, so the page's `update` receives its own Message.
 * `Scene.Mount.resolveAll(WindowList.resolveTrack(onMessage, WindowList.Message.Placed({ top: 0, height: 900 })))`.
 */
export const resolveTrack = <Outer>(
  onMessage: (message: Message) => Outer,
  reading: Message,
): Scene.MountResolver<Outer> => [Track, onMessage(reading)]

/** The list: the rows in view of the window, between spacers as tall as the rest. */
export const view = <Item, Outer>(
  options: WindowListView<Item, Outer>,
  h: HtmlBuilder<Outer>,
): Html => {
  const { model, items, itemToView, onMessage } = options
  const builders = SlotView.buildersFor(
    WindowListSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const keys = keysOf(items, options.itemToKey)
  const { start, end } = windowOf(model, keys)
  const layout = layoutOf(model)
  const offset = (index: number) => offsetFor(index, keys, model.heights, layout)
  const spacer = (edge: 'start' | 'gap' | 'end', blockSize: string) =>
    h.keyed('div')(
      `${model.id}-${edge}`,
      builders.spacer.attrs([
        h.DataAttribute('edge', edge),
        h.AriaHidden(true),
        h.Style({ blockSize }),
      ]),
      [],
    )
  const drawRow = (index: number) =>
    h.keyed('div')(
      keys[index]!,
      builders.row.attrs([
        h.Role('listitem'),
        h.Attribute(ROW_KEY, keys[index]!),
        h.AriaPosinset(index + 1),
        h.AriaSetsize(items.length),
        // A child's margin collapsing through the row would escape its measure.
        h.Style({ display: 'flow-root' }),
      ]),
      [itemToView(items[index]!, index)],
    )
  const drawRows = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, at) => drawRow(from + at))
  const total = totalHeight(keys, model.heights, layout)
  // A row holding focus outside the window sits in flow at its own offset,
  // with a spacer for the rows between it and the window, so the spacers
  // still add up to the whole list and nothing moves when it starts or stops.
  const held = Option.filter(heldRow(model, keys), index => index < start || index >= end)
  const startHeight = (until: number) =>
    model.from === 0 ? `${offset(until)}px` : `calc(var(${PLACED}, 0) * ${offset(until)}px)`
  const children = Option.match(held, {
    onNone: () => [
      spacer('start', startHeight(start)),
      ...drawRows(start, end),
      spacer('end', `${total - offset(end)}px`),
    ],
    onSome: index =>
      index < start
        ? [
            spacer('start', startHeight(index)),
            drawRow(index),
            spacer('gap', `${offset(start) - offset(index + 1)}px`),
            ...drawRows(start, end),
            spacer('end', `${total - offset(end)}px`),
          ]
        : [
            spacer('start', startHeight(start)),
            ...drawRows(start, end),
            spacer('gap', `${offset(index) - offset(end)}px`),
            drawRow(index),
            spacer('end', `${total - offset(index + 1)}px`),
          ],
  })
  return h.div(
    builders.root.attrs([
      h.Id(model.id),
      h.Role('list'),
      ...(options.label === undefined ? [] : [h.AriaLabel(options.label)]),
      h.OnMount(Mount.mapMessage(Track(), onMessage)),
    ]),
    children,
  )
}

// @vitest-environment jsdom
/**
 * More rows asked for as the end comes into view, on the real runtime: the
 * More button, given `moreOnScroll`, sends `onMore` when it comes within
 * 200px of the grid's box, measured against the grid; nothing while it is
 * out of view or the grid is busy; and again once a load has added rows.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, RowCount, RowModel, RowStatus } from 'foldkit-data-grid'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'

interface Line {
  readonly id: string
}
const columns = Columns.define<Line>()({ id: { header: 'Id', value: line => line.id } })
const Grid = DataGrid.make({ id: 'lines', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({
  ...Placement.fields,
  loaded: Schema.Number,
  asked: Schema.Number,
  loading: Schema.Boolean,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases, AskedForMore: {}, Loaded: {} })
type Message = typeof Message.Type
const View = DataGridView<Message>().define(Grid)

/** The loaded lines, with more to come. */
const linesOf = (count: number): RowModel<Line> => {
  const loaded = RowModel.fromArray(
    Array.from({ length: count }, (_, index) => ({ id: `r${index}` })),
    line => line.id,
  )
  return { ...loaded, count: RowCount.Unknown({ atLeast: count }) }
}

/** What the Mount reads of an entry. */
type Crossing = (entries: ReadonlyArray<{ readonly isIntersecting: boolean }>) => void
/** Every observer made, with the element it watches and the options it was given. */
const observers: Array<{
  readonly callback: Crossing
  readonly options: IntersectionObserverInit | undefined
  readonly watched: Array<Element>
  disconnected: boolean
}> = []
class FakeObserver {
  private readonly made: (typeof observers)[number]
  constructor(callback: Crossing, options?: IntersectionObserverInit) {
    this.made = { callback, options, watched: [], disconnected: false }
    observers.push(this.made)
  }
  observe(element: Element) {
    this.made.watched.push(element)
  }
  disconnect() {
    this.made.disconnected = true
  }
}
const live = () => observers.filter(observer => !observer.disconnected)
const cross = (isIntersecting: boolean) => live()[0]!.callback([{ isIntersecting }])

afterEach(() => {
  observers.length = 0
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

test('the end coming into view asks for more, once per load and not while loading', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200)
  const application = Bundle.assemble<Model, Message>()([
    Bundle.parent({ Model, Message }).at(Placement, { onOut: Bundle.ignore }),
  ])
  const update = application.update()
  let latest: Model = {
    grid: Grid.bundle.init(undefined).model,
    loaded: 3,
    asked: 0,
    loading: false,
  }
  const container = document.createElement('div')
  container.id = 'grid-more'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial(latest),
      update: (model: Model, message: Message) => {
        const next = Message.match(message, {
          AskedForMore: () => ({
            model: modifyFields(model, { asked: () => model.asked + 1, loading: () => true }),
          }),
          Loaded: () => ({
            model: modifyFields(model, { loaded: () => model.loaded + 3, loading: () => false }),
          }),
          GotGridMessage: () => update(model, message),
        })
        latest = next.model
        return next
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [],
          [
            h.button([h.Id('loaded'), h.OnClick(Message.Loaded())], ['Loaded']),
            View(
              {
                state: model.grid,
                rows: linesOf(model.loaded),
                wrap: message => Placement.wrapper.make(message),
                label: 'Lines',
                rowHeight: 20,
                headerHeight: 20,
                status: model.loading ? RowStatus.Loading() : RowStatus.Ready(),
                onMore: Message.AskedForMore(),
                moreOnScroll: true,
              },
              h,
            ),
          ],
        ),
    }),
  )
  try {
    await vi.waitFor(() => expect(live()).toHaveLength(1))
    const [first] = live()
    // It watches the More button, measured against the grid it scrolls in.
    expect(first!.watched[0]!.textContent).toBe('More')
    expect(first!.options?.root).toBe(document.getElementById('lines'))
    expect(first!.options?.rootMargin).toBe('200px')

    // Out of view asks nothing; coming in asks once, and loading stops watching.
    cross(false)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(latest.asked).toBe(0)
    cross(true)
    await vi.waitFor(() => expect(latest.asked).toBe(1))
    await vi.waitFor(() => expect(live()).toHaveLength(0))

    // The load lands: more rows, and a fresh watch that asks again.
    document.getElementById('loaded')!.click()
    await vi.waitFor(() => expect(live()).toHaveLength(1))
    expect(live()[0]).not.toBe(first)
    cross(true)
    await vi.waitFor(() => expect(latest.asked).toBe(2))
  } finally {
    handle.dispose()
  }
})

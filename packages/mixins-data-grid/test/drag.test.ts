// @vitest-environment jsdom
/**
 * A column header dragged with the pointer, on the real runtime: a press
 * moved past 4px drags the header with the pointer and marks where it would
 * land, release moves the column there, Escape lets it go back, a click on a
 * sort button stays a click unless it ended a drag, and a press on a resize
 * handle resizes rather than drags.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { Inert } from 'foldkit-mixins/testing'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'

interface Line {
  readonly id: string
}
const rows = RowModel.fromArray<Line>(
  Array.from({ length: 5 }, (_, index) => ({ id: `r${index}` })),
  line => line.id,
)
// 100px each: A's middle is 50, B's 150, C's 250.
const columns = Columns.define<Line>()({
  a: { header: 'A', value: line => line.id, width: 100 },
  b: { header: 'B', value: () => 'b', width: 100 },
  c: { header: 'C', value: () => 'c', width: 100 },
  d: { header: 'D', value: () => 'd', width: 100 },
  e: { header: 'E', value: () => 'e', width: 100 },
})
type Id = keyof typeof columns.byId

const Grid = DataGrid.make({ id: 'lines', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields, sorts: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases, Sorted: {} })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, { onOut: Bundle.ignore }),
])
const View = DataGridView<Message>().define(Grid)
const inputOf = (state: Model['grid'], direction: 'ltr' | 'rtl' = 'ltr') => ({
  state,
  rows,
  wrap: (message: typeof Grid.Message.Type) => Placement.wrapper.make(message),
  label: 'Lines',
  rowHeight: 20,
  headerHeight: 20,
  direction,
  sort: { b: { message: Message.Sorted() } },
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

test('a dragged header follows the pointer toward its end, mirrored right to left', () => {
  const dragging = {
    ...Grid.bundle.init(undefined).model,
    viewport: { top: 0, left: 0, width: 500, height: 100 },
    dragging: Option.some({ column: 'a' as const, delta: 160 }),
  }
  const transformOf = (direction: 'ltr' | 'rtl') =>
    Inert.style(Inert.byRole(Inert.draw(View, inputOf(dragging, direction)), 'columnheader')[0])
      .transform
  expect(transformOf('ltr')).toBe('translateX(160px)')
  expect(transformOf('rtl')).toBe('translateX(-160px)')
})

/** The grid on the real runtime, and the last Model its update returned. */
const mount = (direction: 'ltr' | 'rtl') => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
  const update = application.update()
  let latest: Model = { grid: Grid.bundle.init(undefined).model, sorts: 0 }
  const container = document.createElement('div')
  container.id = 'grid-drag'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial(latest),
      update: (model: Model, message: Message) => {
        const next = Message.match(message, {
          Sorted: () => ({ model: modifyFields(model, { sorts: () => model.sorts + 1 }) }),
          GotGridMessage: () => update(model, message),
        })
        latest = next.model
        return next
      },
      view: (model: Model, h: HtmlBuilder<Message>) => View(inputOf(model.grid, direction), h),
    }),
  )
  return { handle, latest: () => latest }
}

const header = (column: Id) => document.getElementById(GridFocus.headerId('lines', column))!
const order = () =>
  Array.from(document.querySelectorAll('#lines [role="columnheader"]'), each => each.textContent)
// jsdom has no PointerEvent: a MouseEvent with the pointer's id is what the Mounts read.
const pointer = (target: Element, type: string, x: number) => {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x })
  Object.defineProperty(event, 'pointerId', { value: 3 })
  target.dispatchEvent(event)
}
const settle = () => new Promise(resolve => setTimeout(resolve, 20))

test('a header is dragged to a new place, cancelled with Escape, and leaves clicks alone', async () => {
  const { handle, latest } = mount('ltr')
  const sortButton = () => header('b').querySelector('button')!
  try {
    await vi.waitFor(() => expect(order()).toEqual(['A', 'B', 'C', 'D', 'E']))

    // A press that does not move is a click, and sorts.
    pointer(sortButton(), 'pointerdown', 120)
    pointer(sortButton(), 'pointerup', 120)
    sortButton().click()
    await vi.waitFor(() => expect(latest().sorts).toBe(1))

    // Within 4px nothing is dragged; past it the header follows, and C is
    // marked as where A would land: past B's middle, short of C's.
    pointer(header('a'), 'pointerdown', 10)
    pointer(header('a'), 'pointermove', 13)
    await settle()
    expect(header('a').hasAttribute('data-dragging')).toBe(false)
    pointer(header('a'), 'pointermove', 170)
    await vi.waitFor(() => expect(header('a').dataset['dragging']).toBe('true'))
    await vi.waitFor(() => expect(header('a').style.transform).toBe('translateX(160px)'))
    expect(header('c').dataset['drop']).toBe('before')
    pointer(header('a'), 'pointerup', 170)
    await vi.waitFor(() => expect(order()).toEqual(['B', 'A', 'C', 'D', 'E']))
    expect(header('a').hasAttribute('data-dragging')).toBe(false)
    expect(document.querySelector('#lines [data-drop]')).toBeNull()

    // A drag that begins on the sort button ends there without sorting.
    pointer(sortButton(), 'pointerdown', 50)
    pointer(sortButton(), 'pointermove', 260)
    await vi.waitFor(() => expect(header('b').dataset['dragging']).toBe('true'))
    pointer(sortButton(), 'pointerup', 260)
    sortButton().click()
    await vi.waitFor(() => expect(order()).toEqual(['A', 'C', 'B', 'D', 'E']))
    expect(latest().sorts).toBe(1)
    await settle()
    sortButton().click()
    await vi.waitFor(() => expect(latest().sorts).toBe(2))

    // Escape lets a drag go back, and its release then moves nothing.
    pointer(header('e'), 'pointerdown', 450)
    pointer(header('e'), 'pointermove', 100)
    await vi.waitFor(() => expect(header('e').dataset['dragging']).toBe('true'))
    document
      .getElementById('lines')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.waitFor(() => expect(header('e').hasAttribute('data-dragging')).toBe(false))
    pointer(header('e'), 'pointerup', 100)
    await settle()
    expect(order()).toEqual(['A', 'C', 'B', 'D', 'E'])

    // A press on a resize handle resizes; it does not drag the header.
    const handleOf = header('d').querySelector('[role="separator"]')!
    pointer(handleOf, 'pointerdown', 400)
    pointer(handleOf, 'pointermove', 450)
    await vi.waitFor(() => expect(handleOf.getAttribute('aria-valuenow')).toBe('150'))
    expect(header('d').hasAttribute('data-dragging')).toBe(false)
    pointer(handleOf, 'pointerup', 450)
    await settle()
    expect(order()).toEqual(['A', 'C', 'B', 'D', 'E'])
  } finally {
    handle.dispose()
  }
})

test('right to left, a header dragged toward the end goes left', async () => {
  const { handle } = mount('rtl')
  try {
    await vi.waitFor(() => expect(order()).toEqual(['A', 'B', 'C', 'D', 'E']))
    // 160px to the left is toward the end: past B's middle, short of C's.
    pointer(header('a'), 'pointerdown', 400)
    pointer(header('a'), 'pointermove', 240)
    await vi.waitFor(() => expect(header('c').dataset['drop']).toBe('before'))
    pointer(header('a'), 'pointerup', 240)
    await vi.waitFor(() => expect(order()).toEqual(['B', 'A', 'C', 'D', 'E']))
  } finally {
    handle.dispose()
  }
})

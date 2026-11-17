/**
 * Keys pressed faster than a frame. The grid draws on the next frame, so a key
 * handler is the one the last frame drew: a burst of range keys must still
 * compose, each continuing from the key before it and not from the drawing.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

interface Line {
  readonly id: string
}
const lines: ReadonlyArray<Line> = Array.from({ length: 40 }, (_, index) => ({ id: `r${index}` }))
const columns = Columns.define<Line>()({
  id: { header: 'Id', value: line => line.id, width: 80 },
  c0: { header: 'C0', value: () => 'zero', width: 80 },
  c1: { header: 'C1', value: () => 'one', width: 80 },
  c2: { header: 'C2', value: () => 'two', width: 80 },
})
const rows = RowModel.fromArray(lines, line => line.id)

const Grid = DataGrid.make({ id: 'burst', columns, cellSelection: true })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, { onOut: Bundle.ignore }),
])

const Drawn = DataGridView<Message>().define(Grid)
const view = (model: Model, h: HtmlBuilder<Message>) =>
  Drawn(
    {
      state: model.grid,
      rows,
      wrap: message => Placement.wrapper.make(message),
      label: 'Burst',
      rowHeight: 20,
      headerHeight: 20,
    },
    h,
  )

afterEach(() => {
  document.body.innerHTML = ''
})

const cellId = (row: string, column: keyof typeof columns.byId) =>
  GridFocus.cellId('burst', { row, column })

/** Runs `act` with every frame held, then lets them go: what it sent meets the page as last drawn. */
const beforeNextFrame = async (act: () => Promise<void>) => {
  const real = window.requestAnimationFrame
  const held: Array<FrameRequestCallback> = []
  window.requestAnimationFrame = callback => held.push(callback)
  try {
    await act()
  } finally {
    window.requestAnimationFrame = real
    held.forEach(callback => real.call(window, callback))
  }
}

const open = async () => {
  const container = document.createElement('div')
  container.id = 'burst-browser'
  document.body.append(container)
  let latest: Model = { grid: Grid.bundle.init(undefined).model }
  const update = application.update()
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial(latest),
      update: (model: Model, message: Message) => {
        const next = update(model, message)
        latest = next.model
        return next
      },
      view,
    }),
  )
  await vi.waitFor(() => expect(document.getElementById(cellId('r2', 'c0'))).not.toBeNull())
  await userEvent.click(document.getElementById(cellId('r2', 'c0'))!)
  await vi.waitFor(() =>
    expect(document.getElementById('burst')!.getAttribute('aria-activedescendant')).toBe(
      cellId('r2', 'c0'),
    ),
  )
  return { handle, model: () => latest }
}

const corners = (model: Model) =>
  Option.match(model.grid.selection.cells, {
    onNone: () => 'none',
    onSome: ({ anchor, focus }) => `${anchor.row}:${anchor.column} to ${focus.row}:${focus.column}`,
  })

test('two Shift arrows before a frame make one range, not the second alone', async () => {
  const { handle, model } = await open()
  try {
    await beforeNextFrame(async () => {
      await userEvent.keyboard('{Shift>}{ArrowDown}{ArrowRight}{/Shift}')
    })
    await vi.waitFor(() => expect(corners(model())).toBe('r2:c0 to r3:c1'))
  } finally {
    handle.dispose()
  }
})

test('a burst of Shift keys continues from the range the one before made', async () => {
  const { handle, model } = await open()
  try {
    await beforeNextFrame(async () => {
      await userEvent.keyboard('{Shift>}{ArrowDown}{ArrowDown}{End}{ArrowUp}{/Shift}')
    })
    await vi.waitFor(() => expect(corners(model())).toBe('r2:c0 to r3:c2'))
  } finally {
    handle.dispose()
  }
})

test('a plain arrow and a Shift arrow before a frame move, then range from where it moved', async () => {
  const { handle, model } = await open()
  try {
    await beforeNextFrame(async () => {
      await userEvent.keyboard('{ArrowDown}')
      await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    })
    await vi.waitFor(() => expect(corners(model())).toBe('r3:c0 to r3:c1'))
  } finally {
    handle.dispose()
  }
})

test('two plain arrows before a frame move two cells', async () => {
  const { handle, model } = await open()
  try {
    await beforeNextFrame(async () => {
      await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    })
    await vi.waitFor(() =>
      expect(document.getElementById('burst')!.getAttribute('aria-activedescendant')).toBe(
        cellId('r4', 'c0'),
      ),
    )
    expect(corners(model())).toBe('none')
  } finally {
    handle.dispose()
  }
})

test('a burst a frame has caught up with does not carry into the next one', async () => {
  const { handle, model } = await open()
  try {
    await beforeNextFrame(async () => {
      await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
    })
    await vi.waitFor(() => expect(corners(model())).toBe('r2:c0 to r3:c0'))
    // Back to the focus and the no range the burst began from.
    await userEvent.click(document.getElementById(cellId('r2', 'c0'))!)
    await vi.waitFor(() => expect(corners(model())).toBe('none'))
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
    await vi.waitFor(() => expect(corners(model())).toBe('r2:c0 to r3:c0'))
  } finally {
    handle.dispose()
  }
})

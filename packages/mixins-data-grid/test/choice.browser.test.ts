/**
 * A choice column's list in a real browser, where focus, keys, the pointer
 * and layout are real: it opens focused on the cell's value, the arrows walk
 * it, a press on an option chooses it without the blur committing the old
 * one first, and it opens upward when the cell is low in the view.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { Frames } from 'foldkit-mixins/testing'
import { DataGridView, GridSlots, GridStyle } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

const Status = Schema.Literals(['Active', 'Pending', 'Paused', 'Discontinued'])
interface Task {
  readonly id: string
  readonly status: typeof Status.Type
}
const rows = RowModel.fromArray<Task>(
  Array.from({ length: 6 }, (_, index) => ({ id: `t${index}`, status: 'Active' })),
  task => task.id,
)
const columns = Columns.define<Task>()({
  id: { header: 'Id', value: task => task.id, width: 80 },
  status: { header: 'Status', value: task => task.status, width: 160, edit: { schema: Status } },
})
const Grid = DataGrid.make({ id: 'tasks', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields, edits: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, {
    onOut: out => model =>
      Grid.Out.match(out, {
        Edited: edited => ({
          model: modifyFields(model, {
            edits: () => [...model.edits, `${edited.row}=${edited.text}`],
          }),
        }),
        Pasted: () => ({ model }),
      }),
  }),
])
// Six 32px rows under a 32px header in a 192px box: the last rows are low in the view.
const Sized = DataGridView<Message>()
  .define(Grid)
  .pipe(
    Style.attach(GridStyle),
    Style.attach(
      Style.forSlots(GridSlots)({ root: Style.inline({ height: '192px', width: '400px' }) }),
    ),
  )

afterEach(() => {
  document.body.replaceChildren()
})

const mount = () => {
  let latest: Model = { grid: Grid.bundle.init(undefined).model, edits: [] }
  const update = application.update()
  const container = document.createElement('div')
  container.id = 'grid-choice-browser'
  document.body.appendChild(container)
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
      view: (model: Model, h: HtmlBuilder<Message>) =>
        Sized(
          {
            state: model.grid,
            rows,
            wrap: message => Placement.wrapper.make(message),
            label: 'Tasks',
            rowHeight: 32,
            headerHeight: 32,
          },
          h,
        ),
    }),
  )
  return { handle, edits: () => latest.edits }
}
const cell = (row: string) =>
  document.getElementById(GridFocus.cellId('tasks', { row, column: 'status' }))!
const combobox = () => document.querySelector<HTMLElement>('#tasks [role="combobox"]')
const list = () => document.querySelector<HTMLElement>('#tasks [role="listbox"]')
const option = (text: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('#tasks [role="option"]')).find(
    each => each.textContent === text,
  )!
const active = () =>
  document.getElementById(combobox()?.getAttribute('aria-activedescendant') ?? '')?.textContent

test('a choice opens focused on the value, is walked by keys, and keeps or drops its draft', async () => {
  const { handle, edits } = mount()
  try {
    await vi.waitFor(() => expect(cell('t0')).not.toBeNull())
    await userEvent.dblClick(cell('t0'))
    await vi.waitFor(() => expect(document.activeElement).toBe(combobox()))
    expect(active()).toBe('Active')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    await vi.waitFor(() => expect(edits()).toEqual(['t0=Paused']))
    // Enter moved focus to the cell below, on the grid.
    await vi.waitFor(() =>
      expect(document.getElementById('tasks')!.getAttribute('aria-activedescendant')).toBe(
        cell('t1').id,
      ),
    )
    expect(document.activeElement).toBe(document.getElementById('tasks'))

    // A letter finds an option; Escape drops it, focus back on the grid.
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(combobox()))
    await userEvent.keyboard('d')
    await vi.waitFor(() => expect(active()).toBe('Discontinued'))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(combobox()).toBeNull())
    expect(document.activeElement).toBe(document.getElementById('tasks'))
    expect(edits()).toEqual(['t0=Paused'])
  } finally {
    handle.dispose()
  }
})

test('two arrows inside one frame move two options, not the same one twice', async () => {
  const { handle, edits } = mount()
  try {
    await vi.waitFor(() => expect(cell('t0')).not.toBeNull())
    await userEvent.dblClick(cell('t0'))
    await vi.waitFor(() => expect(document.activeElement).toBe(combobox()))
    const frames = Frames.track()
    frames.hold()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    frames.release()
    frames.dispose()
    await vi.waitFor(() => expect(active()).toBe('Paused'))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(edits()).toEqual(['t0=Paused']))
  } finally {
    handle.dispose()
  }
})

test('a press on an option chooses it, and the blur does not commit the old draft first', async () => {
  const { handle, edits } = mount()
  try {
    await vi.waitFor(() => expect(cell('t0')).not.toBeNull())
    await userEvent.dblClick(cell('t0'))
    await vi.waitFor(() => expect(list()).not.toBeNull())
    await userEvent.click(option('Pending'))
    await vi.waitFor(() => expect(edits()).toEqual(['t0=Pending']))
    await vi.waitFor(() => expect(combobox()).toBeNull())
  } finally {
    handle.dispose()
  }
})

test('the list opens below a cell high in the view, and above one low in it', async () => {
  const { handle } = mount()
  try {
    await vi.waitFor(() => expect(cell('t4')).not.toBeNull())
    await userEvent.dblClick(cell('t0'))
    await vi.waitFor(() => expect(list()).not.toBeNull())
    expect(list()!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      cell('t0').getBoundingClientRect().bottom - 1,
    )
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(list()).toBeNull())

    await userEvent.dblClick(cell('t4'))
    await vi.waitFor(() => expect(list()).not.toBeNull())
    expect(list()!.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      cell('t4').getBoundingClientRect().top + 1,
    )
  } finally {
    handle.dispose()
  }
})

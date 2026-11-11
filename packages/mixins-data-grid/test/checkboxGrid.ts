/**
 * A grid of tasks with a checkbox column the application writes back, on the
 * real runtime: shared by the jsdom and the browser tests of the checkbox.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { DataGridView, GridStyle } from 'foldkit-mixins-data-grid'

const Task = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
type Task = typeof Task.Type

// The checkbox column first, so the grid's first cell, its tab stop before
// anything is focused, is a checkbox.
const columns = Columns.define<Task>()({
  done: { header: 'Done', value: task => task.done, width: 80, edit: { schema: Columns.checkbox } },
  title: { header: 'Title', value: task => task.title, width: 100, edit: {} },
  // A boolean that does not edit: the application draws its own checkbox
  // (`drawCell`), which is no control of the grid's.
  seen: { header: 'Seen', value: task => task.done, width: 80 },
})

export const Grid = DataGrid.make({ id: 'tasks', columns, rowSelection: 'multiple' })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({
  ...Placement.fields,
  tasks: Schema.Array(Task),
  edits: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type

const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, {
    // A toggle is written to its task, and every edit is logged as row.column=text.
    onOut: out => model =>
      Grid.Out.match(out, {
        Edited: edited => ({
          model: modifyFields(model, {
            tasks: tasks =>
              Grid.matchEdit(edited, {
                title: ({ row, value }) =>
                  tasks.map(task => (task.id === row ? { ...task, title: value } : task)),
                done: ({ row, value }) =>
                  tasks.map(task => (task.id === row ? { ...task, done: value } : task)),
              }),
            edits: edits => [...edits, `${edited.row}.${edited.column}=${edited.text}`],
          }),
        }),
        // A paste or a clear is only logged: accepted as row.column=text, refused with a `!`.
        Pasted: ({ accepted, refused }) => ({
          model: modifyFields(model, {
            edits: edits => [
              ...edits,
              ...accepted.map(cell => `${cell.row}.${cell.column}=${cell.text}`),
              ...refused.map(cell => `${cell.row}.${cell.column}!${cell.text}`),
            ],
          }),
        }),
        UndoRequested: () => ({ model }),
        RedoRequested: () => ({ model }),
        Filled: () => ({ model }),
        RowsRequested: () => ({ model }),
      }),
  }),
])

const taskKey = (task: Task) => task.id
const drawCell = (column: string, task: Task, h: HtmlBuilder<Message>) =>
  column === 'seen'
    ? h.span([h.Role('checkbox'), h.AriaChecked(task.done), h.AriaLabel('Seen')], [])
    : String(column === 'title' ? task.title : task.done)

// The rows, with one row counted and keyed but not loaded yet, as a page
// still on its way leaves it; one model per tasks array, as `fromArray` keeps.
const unloadedRows = new WeakMap<ReadonlyArray<Task>, RowModel<Task>>()
const rowsOf = (tasks: ReadonlyArray<Task>, unloaded: Option.Option<string>) => {
  const rows = RowModel.fromArray(tasks, taskKey)
  if (Option.isNone(unloaded)) return rows
  const kept = unloadedRows.get(tasks)
  if (kept !== undefined) return kept
  const held: RowModel<Task> = {
    ...rows,
    rowAt: index => Option.filter(rows.rowAt(index), task => task.id !== unloaded.value),
  }
  unloadedRows.set(tasks, held)
  return held
}
const View = DataGridView<Message>().define(Grid).pipe(Style.attach(GridStyle))
const wrap = (message: typeof Grid.Message.Type) => Placement.wrapper.make(message)

/**
 * The grid on the real runtime over three tasks, the second done, the row
 * keyed `unloaded` not loaded yet; and the latest Model.
 */
export const mountTasks = (unloaded: Option.Option<string> = Option.none()) => {
  const container = document.createElement('div')
  container.id = 'grid-checkbox'
  document.body.appendChild(container)
  let latest: Model = {
    grid: Grid.bundle.init(undefined).model,
    tasks: ['t0', 't1', 't2'].map((id, index) => ({
      id,
      title: `Task ${index}`,
      done: index === 1,
    })),
    edits: [],
  }
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
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Style({ height: '200px', display: 'grid' })],
          [
            View(
              {
                state: model.grid,
                rows: rowsOf(model.tasks, unloaded),
                cell: drawCell,
                wrap,
                label: 'Tasks',
                rowHeight: 24,
                headerHeight: 24,
              },
              h,
            ),
          ],
        ),
    }),
  )
  return { latest: () => latest, dispose: () => handle.dispose() }
}

export const grid = () => document.getElementById('tasks')!
export const cellOf = (row: string, column: 'title' | 'done' | 'seen') =>
  document.getElementById(GridFocus.cellId('tasks', { row, column }))
export const boxOf = (row: string, column: 'done' | 'seen' = 'done') =>
  cellOf(row, column)?.querySelector('[role="checkbox"]') ?? null

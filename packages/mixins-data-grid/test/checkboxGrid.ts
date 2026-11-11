/**
 * A grid of tasks with a checkbox column the application writes back, on the
 * real runtime: shared by the jsdom and the browser tests of the checkbox.
 */
import { Schema } from 'effect'
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

const columns = Columns.define<Task>()({
  title: { header: 'Title', value: task => task.title, width: 100, edit: {} },
  done: { header: 'Done', value: task => task.done, width: 80, edit: { schema: Columns.checkbox } },
  // A boolean that does not edit is its text, with no checkbox to press.
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
        Pasted: () => ({ model }),
        UndoRequested: () => ({ model }),
        RedoRequested: () => ({ model }),
        Filled: () => ({ model }),
        RowsRequested: () => ({ model }),
      }),
  }),
])

const taskKey = (task: Task) => task.id
const View = DataGridView<Message>().define(Grid).pipe(Style.attach(GridStyle))
const wrap = (message: typeof Grid.Message.Type) => Placement.wrapper.make(message)

/** The grid on the real runtime over three tasks, the second done; and the latest Model. */
export const mountTasks = () => {
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
                rows: RowModel.fromArray(model.tasks, taskKey),
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
export const boxOf = (row: string) =>
  cellOf(row, 'done')?.querySelector('[role="checkbox"]') ?? null

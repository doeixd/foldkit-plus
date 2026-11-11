/**
 * A grid of tasks whose columns filter, on the real runtime: the application
 * holds the filters, filters its rows by them, and logs each one reported.
 * Shared by the jsdom and the browser tests of the filter form.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { CellEditor, ColumnFilter, Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { DataGridView, GridStyle } from 'foldkit-mixins-data-grid'

const Status = Schema.Literals(['Open', 'Doing', 'Done'])
const Task = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  status: Status,
  hours: Schema.Number,
  done: Schema.Boolean,
})
type Task = typeof Task.Type

const columns = Columns.define<Task>()({
  title: { header: 'Title', value: task => task.title, width: 120, edit: {}, filter: true },
  status: {
    header: 'Status',
    value: task => task.status,
    width: 100,
    edit: { schema: Status },
    filter: true,
  },
  hours: {
    header: 'Hours',
    value: task => task.hours.toFixed(1),
    width: 80,
    filter: CellEditor.Number(),
  },
  done: {
    header: 'Done',
    value: task => task.done,
    width: 80,
    edit: { schema: Columns.checkbox },
    filter: true,
  },
})

export const Grid = DataGrid.make({ id: 'tasks', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({
  ...Placement.fields,
  tasks: Schema.Array(Task),
  filters: Grid.Filters,
  /** Every change reported, as `column=filter` (none as `-`), and every cut or paste. */
  log: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Placement.cases,
  /** The application wrote the filters itself, as a URL or a saved view would. */
  Wrote: {},
})
type Message = typeof Message.Type

/** A filter as stored, or `-` for none. */
const logged = (filter: Option.Option<ColumnFilter>): string =>
  Option.match(filter, {
    onNone: () => '-',
    onSome: given => JSON.stringify(Schema.encodeSync(ColumnFilter)(given)),
  })

const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, {
    onOut: out => model =>
      Grid.Out.match(out, {
        Filtered: ({ change }) => ({
          model: modifyFields(model, {
            filters: filters => Grid.setFilter(filters, change),
            log: log => [...log, `${change.column}=${logged(change.filter)}`],
          }),
        }),
        Pasted: ({ accepted }) => ({
          model: modifyFields(model, { log: log => [...log, `pasted ${accepted.length}`] }),
        }),
        Edited: () => ({ model }),
        UndoRequested: () => ({ model }),
        RedoRequested: () => ({ model }),
        Filled: () => ({ model }),
        RowsRequested: () => ({ model }),
      }),
  }),
])

// Kept per tasks and filters: the row model, and the projection keyed by it, last a render.
const kept = new WeakMap<object, { tasks: ReadonlyArray<Task>; rows: RowModel<Task> }>()
const rowsOf = (model: Model): RowModel<Task> => {
  const known = kept.get(model.filters)
  if (known !== undefined && known.tasks === model.tasks) return known.rows
  const keeps = Grid.keeps(model.filters, {
    title: task => task.title,
    status: task => task.status,
    hours: task => task.hours,
    done: task => task.done,
  })
  const rows = RowModel.fromArray(model.tasks.filter(keeps), task => task.id)
  kept.set(model.filters, { tasks: model.tasks, rows })
  return rows
}
const View = DataGridView<Message>().define(Grid).pipe(Style.attach(GridStyle))
const wrap = (message: typeof Grid.Message.Type) => Placement.wrapper.make(message)

export const tasks: ReadonlyArray<Task> = [
  { id: 't0', title: 'Fix the bolt', status: 'Open', hours: 1, done: false },
  { id: 't1', title: 'Paint', status: 'Done', hours: 4, done: true },
  { id: 't2', title: 'Bolt the door', status: 'Doing', hours: 2.5, done: false },
]

/**
 * The grid on the real runtime, with the latest Model, and `write` to change
 * the filters as the application would from outside the grid (a URL).
 */
export const mountTasks = () => {
  const container = document.createElement('div')
  container.id = 'grid-filter'
  document.body.appendChild(container)
  let latest: Model = {
    grid: Grid.bundle.init(undefined).model,
    tasks,
    filters: Grid.noFilters,
    log: [],
  }
  const update = application.update()
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial(latest),
      update: (model: Model, message: Message) => {
        const next =
          message._tag === 'Wrote'
            ? {
                model: modifyFields(model, {
                  filters: filters => ({
                    ...filters,
                    title: Option.some(ColumnFilter.Contains({ text: 'paint' })),
                  }),
                }),
              }
            : update(model, message)
        latest = next.model
        return next
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Style({ height: '300px', display: 'grid' })],
          [
            View(
              {
                state: model.grid,
                rows: rowsOf(model),
                wrap,
                label: 'Tasks',
                rowHeight: 24,
                headerHeight: 28,
                filters: model.filters,
              },
              h,
            ),
            // After the grid: what writes the filters as a URL would.
            h.button([h.Id('write'), h.Type('button'), h.OnClick(Message.Wrote())], ['Write']),
          ],
        ),
    }),
  )
  return { latest: () => latest, dispose: () => handle.dispose() }
}

export const grid = () => document.getElementById('tasks')!
export const headerOf = (column: 'title' | 'status' | 'hours' | 'done') =>
  document.getElementById(GridFocus.headerId('tasks', column))!
export const buttonOf = (column: 'title' | 'status' | 'hours' | 'done') =>
  headerOf(column).querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!
export const form = () => document.querySelector<HTMLElement>('#tasks [role="dialog"]')
/** The ids of the rows drawn, in order. */
export const shownRows = () =>
  [...document.querySelectorAll('#tasks [role="row"][aria-rowindex]')]
    .map(row => row.querySelector('[role="gridcell"]')?.id ?? '')
    .filter(id => id !== '')
    .map(id =>
      GridFocus.cellOf('tasks', id).pipe(
        Option.map(cell => cell.row),
        Option.getOrElse(() => ''),
      ),
    )

import { Table } from '../src/index.js'

interface Row {
  readonly id: string
}
interface Pressed {
  readonly _tag: 'Pressed'
}
const pressed: Pressed = { _tag: 'Pressed' }
const columns = [{ header: 'Id', value: (row: Row) => row.id }]
const rows: ReadonlyArray<Row> = []
declare const h: Parameters<typeof Table.view<Row, Pressed>>[1]

const selection = {
  id: 'rows',
  isSelected: () => false,
  onToggle: () => pressed,
  onToggleAll: () => pressed,
}

// Accepted: the highlight and the box are values the page passes.
Table.view<Row, Pressed>(
  { columns, rows, fluid: Table.fluid, selection: { ...selection, control: Table.checkboxes() } },
  h,
)

// A selection without a control draws nothing.
// @ts-expect-error `control` is required
Table.view<Row, Pressed>({ columns, rows, selection }, h)

// `fluid` is a value, not a flag.
// @ts-expect-error a boolean no longer switches the highlight on
Table.view<Row, Pressed>({ columns, rows, fluid: true }, h)

// A word the table does not draw.
// @ts-expect-error `selectColumn` is not a word
Table.view<Row, Pressed>({ columns, rows, words: { selectColumn: 'x' } }, h)

// `configure` binds words, and refuses a preset it was not given.
const App = Table.configure({ base: { words: { selectAll: 'Alle' } } })
App.view<Row, Pressed>({ columns, rows }, h)
// @ts-expect-error no presets were declared
App.view<Row, Pressed>({ columns, rows, preset: 'dense' }, h)

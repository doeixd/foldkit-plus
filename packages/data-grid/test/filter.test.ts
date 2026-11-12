import { Option, Schema, SchemaGetter } from 'effect'
import {
  isEcho,
  CellEditor,
  ColumnFilter,
  Columns,
  DataGrid,
  filterKindOf,
  type KindOfValue,
  type OneOf,
} from 'foldkit-data-grid'
import { describe, expect, test } from 'vitest'

type Task = {
  readonly id: string
  readonly title: string
  readonly status: 'Open' | 'Doing' | 'Done'
  readonly hours: number
  readonly done: boolean
  readonly due: Date
  readonly code: string
}

const Status = Schema.Literals(['Open', 'Doing', 'Done'])
const Hours = Schema.NumberFromString

const columns = Columns.define<Task>()({
  title: { header: 'Title', value: task => task.title, filter: true },
  status: { header: 'Status', value: task => task.status, edit: { schema: Status }, filter: true },
  hours: { header: 'Hours', value: task => task.hours, edit: { schema: Hours }, filter: true },
  done: {
    header: 'Done',
    value: task => task.done,
    edit: { schema: Columns.checkbox },
    filter: true,
  },
  due: { header: 'Due', value: task => task.due, filter: CellEditor.Date() },
  code: { header: 'Code', value: task => task.code },
})
const Grid = DataGrid.make({ id: 'tasks', columns })
type Model = typeof Grid.Model.Type
type Message = typeof Grid.Message.Type

const start: Model = Grid.bundle.init(undefined).model
const step = (model: Model, message: Message) => Grid.bundle.update(model, message, undefined)
/** Messages in turn: the last Model, and every filter reported on the way. */
const run = (model: Model, messages: ReadonlyArray<Message>) =>
  messages.reduce<{ model: Model; reported: Array<unknown> }>(
    (state, message) => {
      const next = step(state.model, message)
      return {
        model: next.model,
        reported: Option.match(Option.fromUndefinedOr(next.outMessage), {
          onNone: () => state.reported,
          onSome: out =>
            Grid.Out.match(out, {
              Filtered: ({ change }) => [...state.reported, change],
              Edited: () => state.reported,
              Pasted: () => state.reported,
              UndoRequested: () => state.reported,
              RedoRequested: () => state.reported,
              Filled: () => state.reported,
              RowsRequested: () => state.reported,
            }),
        }),
      }
    },
    { model, reported: [] },
  )
const fresh = Option.none()
const open = (
  column: Parameters<typeof Grid.Message.FilterOpened>[0]['column'],
  drawn: Option.Option<ColumnFilter> = Option.none(),
) => Grid.Message.FilterOpened({ column, drawn })
const typed = (field: 'text' | 'min' | 'max' | 'from' | 'to', text: string) =>
  Grid.Message.FilterTyped({ field, text, stale: Option.none() })
const range = (min: Option.Option<number>, max: Option.Option<number>) =>
  ColumnFilter.Range({ min, max })

enum TextEnum {
  A = 'a',
  B = 'b',
}
enum NumberEnum {
  One = 1,
  Two = 2,
}
enum MixedEnum {
  A = 'a',
  One = 1,
}

describe('the kind a column filters as', () => {
  // The type says the kind and the run time reads it: each row compiles only
  // when `KindOfValue` agrees with the literal, and passes only when
  // `filterKindOf` does, so the two cannot drift apart.
  const agree = <V, E>(schema: Schema.Codec<V, E>, kind: KindOfValue<V>) =>
    expect(filterKindOf(schema)._tag).toBe(kind)

  test.each([
    ['text', () => agree(Schema.String, 'Text')],
    ['a branded text', () => agree(Schema.String.pipe(Schema.brand('Upc')), 'Text')],
    ['a template literal', () => agree(Schema.TemplateLiteral([Schema.Number, 'px']), 'Text')],
    ['text literals', () => agree(Status, 'Choice')],
    ['one text literal', () => agree(Schema.Literal('Only'), 'Choice')],
    ['a text enum', () => agree(Schema.Enum(TextEnum), 'Choice')],
    ['a number enum', () => agree(Schema.Enum(NumberEnum), 'Number')],
    ['a mixed enum', () => agree(Schema.Enum(MixedEnum), 'Text')],
    [
      'a text literal or a number',
      () => agree(Schema.Union([Schema.Literal('a'), Schema.Number]), 'Text'),
    ],
    ['a nullable literal', () => agree(Schema.NullOr(Status), 'Text')],
    ['a boolean', () => agree(Schema.Boolean, 'Checkbox')],
    ['the checkbox text', () => agree(Columns.checkbox, 'Checkbox')],
    ['a boolean literal', () => agree(Schema.Literal(true), 'Checkbox')],
    ['a number from text', () => agree(Hours, 'Number')],
    ['an integer', () => agree(Schema.Int, 'Number')],
    ['number literals', () => agree(Schema.Literals([1, 2]), 'Number')],
    ['a nullable number', () => agree(Schema.NullOr(Schema.Number), 'Text')],
    ['a date', () => agree(Schema.Date, 'Date')],
    [
      'text literals decoding to numbers',
      () =>
        agree(
          Schema.Literals(['1', '2']).pipe(
            Schema.decodeTo(Schema.Number, {
              decode: SchemaGetter.transform((text: '1' | '2') => Number(text)),
              encode: SchemaGetter.transform((value: number) => (value === 1 ? '1' : '2')),
            }),
          ),
          'Number',
        ),
    ],
  ])('%s', (_, check) => check())

  test('is read once per column: the declared kind, or the schema read', () => {
    expect(Grid.filterFor('title')).toEqual(Option.some(CellEditor.Text()))
    expect(Grid.filterFor('status')).toEqual(
      Option.some(CellEditor.Choice({ options: ['Open', 'Doing', 'Done'] })),
    )
    expect(Grid.filterFor('hours')).toEqual(Option.some(CellEditor.Number()))
    expect(Grid.filterFor('done')).toEqual(Option.some(CellEditor.Checkbox()))
    expect(Grid.filterFor('due')).toEqual(Option.some(CellEditor.Date()))
    expect(Grid.filterFor('code')).toEqual(Option.none())
  })
})

describe('the filter form', () => {
  test('opens seeded from the filter drawn, focusing its header', () => {
    const { model } = run(start, [open('hours', Option.some(range(Option.some(2), Option.none())))])
    expect(model.focus.header).toEqual(Option.some('hours'))
    expect(model.filtering).toEqual(
      Option.some({
        column: 'hours',
        form: { text: '', min: '2', max: '', options: [], checked: 'any', from: '', to: '' },
        reported: Option.some(range(Option.some(2), Option.none())),
        sent: [Option.some(range(Option.some(2), Option.none()))],
        generation: 0,
      }),
    )
  })

  test.each([
    ['a column that does not filter', open('code')],
    ['a drawn filter of another kind', open('title', Option.some(range(Option.some(1), fresh)))],
    [
      'a drawn filter its column refuses',
      open('status', Option.some(ColumnFilter.OneOf({ options: ['Gone'] }))),
    ],
  ])('refuses %s', (_, message) => {
    expect(step(start, message).model).toBe(start)
  })

  test('refuses a hidden column', () => {
    const hidden = step(start, Grid.Message.ColumnHidden({ column: 'title' })).model
    expect(step(hidden, open('title')).model).toBe(hidden)
  })

  test('reports text as it is typed, and empty text as no filter', () => {
    const { reported } = run(start, [
      open('title'),
      typed('text', 'b'),
      typed('text', 'bo'),
      typed('text', ''),
    ])
    expect(reported).toEqual([
      { column: 'title', filter: Option.some(ColumnFilter.Contains({ text: 'b' })) },
      { column: 'title', filter: Option.some(ColumnFilter.Contains({ text: 'bo' })) },
      { column: 'title', filter: Option.none() },
    ])
  })

  test('keeps a bound that is no number unreported, and judges the next against what was reported', () => {
    const { model, reported } = run(start, [
      open('hours'),
      typed('min', '1'),
      typed('min', '1x'),
      typed('min', '2'),
      typed('min', '2y'),
      typed('min', ''),
    ])
    // Through each bound that is no number the rows stay filtered by the last that held.
    expect(reported).toEqual([
      { column: 'hours', filter: Option.some(range(Option.some(1), fresh)) },
      { column: 'hours', filter: Option.some(range(Option.some(2), fresh)) },
      { column: 'hours', filter: Option.none() },
    ])
    expect(Option.map(model.filtering, each => each.reported)).toEqual(Option.some(fresh))
  })

  test('holds a bound as typed, and reports one that reads the same no more', () => {
    const { model, reported } = run(start, [open('hours'), typed('min', '1'), typed('min', '1.')])
    expect(reported).toHaveLength(1)
    expect(Option.map(model.filtering, each => each.form.min)).toEqual(Option.some('1.'))
  })

  test('reports crossed bounds, which keep nothing', () => {
    const { reported } = run(start, [open('hours'), typed('min', '5'), typed('max', '2')])
    expect(reported.at(-1)).toEqual({
      column: 'hours',
      filter: Option.some(range(Option.some(5), Option.some(2))),
    })
  })

  test('ticks options in the column order, and none ticked is no filter', () => {
    const toggle = (option: string) =>
      Grid.Message.FilterOptionToggled({ option, stale: Option.none() })
    const { reported } = run(start, [
      open('status'),
      toggle('Done'),
      toggle('Open'),
      toggle('Done'),
      toggle('Open'),
    ])
    expect(reported).toEqual([
      { column: 'status', filter: Option.some(ColumnFilter.OneOf({ options: ['Done'] })) },
      { column: 'status', filter: Option.some(ColumnFilter.OneOf({ options: ['Open', 'Done'] })) },
      { column: 'status', filter: Option.some(ColumnFilter.OneOf({ options: ['Open'] })) },
      { column: 'status', filter: Option.none() },
    ])
  })

  test('reads a checkbox filter, and any as none', () => {
    const checked = (state: 'any' | 'true' | 'false') =>
      Grid.Message.FilterChecked({ state, stale: Option.none() })
    const { reported } = run(start, [open('done'), checked('false'), checked('any')])
    expect(reported).toEqual([
      { column: 'done', filter: Option.some(ColumnFilter.Is({ checked: false })) },
      { column: 'done', filter: Option.none() },
    ])
  })

  test('reads days', () => {
    const { reported } = run(start, [open('due'), typed('from', '2026-01-02')])
    expect(reported).toEqual([
      {
        column: 'due',
        filter: Option.some(ColumnFilter.Between({ from: Option.some('2026-01-02'), to: fresh })),
      },
    ])
  })

  test.each([
    ['a field another kind owns', typed('min', '3')],
    [
      'an option the column does not offer',
      Grid.Message.FilterOptionToggled({ option: 'Gone', stale: Option.none() }),
    ],
    [
      'a checkbox state on text',
      Grid.Message.FilterChecked({ state: 'true', stale: Option.none() }),
    ],
  ])('refuses %s, giving the Model back', (_, message) => {
    const opened = step(start, open('title')).model
    expect(step(opened, message)).toEqual({ model: opened })
  })

  test('changes nothing when no form is open', () => {
    expect(step(start, typed('text', 'b')).model).toBe(start)
    expect(step(start, Grid.Message.FilterClosed()).model).toBe(start)
    expect(step(start, Grid.Message.FilterCleared({ stale: Option.none() })).model).toBe(start)
  })

  test('clears to no filter, reporting only when one held', () => {
    const { reported } = run(start, [
      open('title'),
      Grid.Message.FilterCleared({ stale: Option.none() }),
      typed('text', 'a'),
      Grid.Message.FilterCleared({ stale: Option.none() }),
    ])
    expect(reported).toEqual([
      { column: 'title', filter: Option.some(ColumnFilter.Contains({ text: 'a' })) },
      { column: 'title', filter: Option.none() },
    ])
  })

  test('reseeds from a stale frame, once, before its change', () => {
    // The application wrote "x" while the form, which had reported "b", was open.
    const opened = run(start, [open('title'), typed('text', 'b')]).model
    // Drawn after one report: the generation the form had then.
    const stale = Option.some({
      drawn: Option.some(ColumnFilter.Contains({ text: 'x' })),
      generation: 1,
    })
    // Two keys from that one frame: the first reseeds, the second adds to it.
    const { model, reported } = run(opened, [
      Grid.Message.FilterTyped({ field: 'text', text: 'xy', stale }),
      Grid.Message.FilterTyped({ field: 'text', text: 'xyz', stale }),
    ])
    expect(reported).toEqual([
      { column: 'title', filter: Option.some(ColumnFilter.Contains({ text: 'xy' })) },
      { column: 'title', filter: Option.some(ColumnFilter.Contains({ text: 'xyz' })) },
    ])
    expect(Option.map(model.filtering, each => each.form.text)).toEqual(Option.some('xyz'))
  })

  test('the form remembers each filter it sent, for the view to tell an echo by', () => {
    const { model } = run(start, [open('title'), typed('text', 'a'), typed('text', 'ab')])
    expect(Option.map(model.filtering, each => each.sent)).toEqual(
      Option.some([
        Option.none(),
        Option.some(ColumnFilter.Contains({ text: 'a' })),
        Option.some(ColumnFilter.Contains({ text: 'ab' })),
      ]),
    )
  })

  test("a stale frame that is only the form's own report, late or trimmed, reseeds nothing", () => {
    const contains = (text: string) => Option.some(ColumnFilter.Contains({ text }))
    const sent = [Option.none(), contains('a '), contains('ab')]
    expect(isEcho(sent, Option.none())).toBe(true)
    expect(isEcho(sent, contains('a'))).toBe(true)
    expect(isEcho(sent, contains('ab '))).toBe(true)
    expect(isEcho(sent, contains('x'))).toBe(false)
    expect(isEcho(sent, Option.some(range(Option.some(1), Option.none())))).toBe(false)
  })

  test('reseeds a choice from a stale frame before ticking', () => {
    const opened = run(start, [
      open('status'),
      Grid.Message.FilterOptionToggled({ option: 'Open', stale: Option.none() }),
    ]).model
    const stale = Option.some({
      drawn: Option.some(ColumnFilter.OneOf({ options: ['Done'] })),
      generation: 1,
    })
    // Two presses from that one frame: the first reseeds, the second adds to it.
    const { reported } = run(opened, [
      Grid.Message.FilterOptionToggled({ option: 'Doing', stale }),
      Grid.Message.FilterOptionToggled({ option: 'Open', stale }),
    ])
    expect(reported).toEqual([
      { column: 'status', filter: Option.some(ColumnFilter.OneOf({ options: ['Doing', 'Done'] })) },
      {
        column: 'status',
        filter: Option.some(ColumnFilter.OneOf({ options: ['Open', 'Doing', 'Done'] })),
      },
    ])
  })

  test('a stale frame whose first change reports the old value again does not reseed twice', () => {
    // [Open] reported; the application wrote [Open, Done] from outside.
    const opened = run(start, [
      open('status'),
      Grid.Message.FilterOptionToggled({ option: 'Open', stale: Option.none() }),
    ]).model
    const stale = Option.some({
      drawn: Option.some(ColumnFilter.OneOf({ options: ['Open', 'Done'] })),
      generation: 1,
    })
    // Untick Done (back to [Open], what was reported before), then tick Doing.
    const { reported } = run(opened, [
      Grid.Message.FilterOptionToggled({ option: 'Done', stale }),
      Grid.Message.FilterOptionToggled({ option: 'Doing', stale }),
    ])
    expect(reported).toEqual([
      { column: 'status', filter: Option.some(ColumnFilter.OneOf({ options: ['Open'] })) },
      { column: 'status', filter: Option.some(ColumnFilter.OneOf({ options: ['Open', 'Doing'] })) },
    ])
  })

  test('clears a filter written from outside, from the frame that shows it', () => {
    const opened = step(start, open('title')).model
    const { reported } = run(opened, [
      Grid.Message.FilterCleared({
        stale: Option.some({
          drawn: Option.some(ColumnFilter.Contains({ text: 'x' })),
          generation: 0,
        }),
      }),
    ])
    expect(reported).toEqual([{ column: 'title', filter: Option.none() }])
  })

  test('a hexadecimal or exponent bound is no number as typed, though JavaScript reads one', () => {
    const { reported } = run(start, [open('hours'), typed('min', '0x10'), typed('max', '1e3')])
    expect(reported).toEqual([])
  })

  test('a stale frame whose first change reports nothing still reseeds once', () => {
    const opened = run(start, [open('hours'), typed('min', '1')]).model
    const stale = Option.some({
      drawn: Option.some(range(Option.some(5), fresh)),
      generation: 1,
    })
    // A bound that is no number reports nothing; the next key adds to it, not to a reseed.
    const { model, reported } = run(opened, [
      Grid.Message.FilterTyped({ field: 'min', text: '5x', stale }),
      Grid.Message.FilterTyped({ field: 'max', text: '9', stale }),
    ])
    expect(reported).toEqual([])
    expect(Option.map(model.filtering, each => [each.form.min, each.form.max])).toEqual(
      Option.some(['5x', '9']),
    )
  })

  test('a bound past every finite number is no number: kept as typed, unreported', () => {
    const long = '9'.repeat(400)
    const { model, reported } = run(start, [open('hours'), typed('min', long)])
    expect(reported).toEqual([])
    expect(Option.map(model.filtering, each => each.form.min)).toEqual(Option.some(long))
  })

  test('closes a form whose column a write hid, on the next Message', () => {
    const opened = step(start, open('title')).model
    const hidden = { ...opened, columns: { ...opened.columns, hidden: ['title' as const] } }
    expect(step(hidden, Grid.Message.MountStarted()).model.filtering).toEqual(Option.none())
    // The paste a form would refuse lands again.
    expect(
      step(
        hidden,
        Grid.Message.Pasted({
          cells: [{ row: 't', column: 'status', text: 'Done', from: 'Open' }],
        }),
      ).outMessage,
    ).toBeDefined()
  })

  test.each([
    [
      'a paste',
      Grid.Message.Pasted({ cells: [{ row: 't', column: 'status', text: 'Done', from: 'Open' }] }),
    ],
    [
      'a fill',
      Grid.Message.FillRequested({
        source: { anchor: { row: 't', column: 'title' }, focus: { row: 't', column: 'title' } },
        to: { row: 'u', column: 'title' },
      }),
    ],
    ['an undo', Grid.Message.UndoRequested()],
    ['a redo', Grid.Message.RedoRequested()],
  ])('refuses %s while the form is open', (_, message) => {
    const opened = step(start, open('title')).model
    expect(step(opened, message)).toEqual({ model: opened })
  })

  test.each([
    ['a cell focused', Grid.Message.Focused({ address: { row: 't', column: 'title' } })],
    [
      'an edit typed',
      Grid.Message.EditTyped({ address: { row: 't', column: 'code' }, text: 'a', from: '' }),
    ],
    [
      'an edit started',
      Grid.Message.EditStarted({ address: { row: 't', column: 'title' }, draft: '' }),
    ],
    ['the menu opened', Grid.Message.MenuOpened({ column: 'title' })],
    ['a fill started', Grid.Message.FillStarted()],
    ['its column hidden', Grid.Message.ColumnHidden({ column: 'title' })],
  ])('closes on %s', (_, message) => {
    const opened = step(start, open('title')).model
    expect(step(opened, message).model.filtering).toEqual(Option.none())
  })

  test('stays open when another column is hidden', () => {
    const opened = step(start, open('title')).model
    expect(
      Option.isSome(step(opened, Grid.Message.ColumnHidden({ column: 'hours' })).model.filtering),
    ).toBe(true)
  })
})

describe('the stored filters', () => {
  const decode = Schema.decodeUnknownSync(Grid.Filters)
  const none = { title: null, status: null, hours: null, done: null, due: null }

  test('start with every column none, and read back what they write', () => {
    expect(Schema.encodeSync(Grid.Filters)(Grid.noFilters)).toEqual(none)
    const stored = {
      ...none,
      status: { _tag: 'OneOf', options: ['Open'] },
      hours: { _tag: 'Range', min: 1, max: null },
    }
    expect(Schema.encodeSync(Grid.Filters)(decode(stored))).toEqual(stored)
  })

  test('refuses a key no filtering column has, whatever the decode is given', () => {
    expect(() => decode({ ...none, code: null })).toThrow()
    expect(() => decode({ ...none, constructor: null })).toThrow()
  })

  test('of a grid that filters nothing, holds nothing', () => {
    const Plain = DataGrid.make({
      id: 'plain',
      columns: Columns.define<Task>()({ title: { header: 'Title', value: task => task.title } }),
    })
    expect(Schema.decodeUnknownSync(Plain.Filters)({})).toEqual({})
    expect(() => Schema.decodeUnknownSync(Plain.Filters)({ foo: 1 })).toThrow()
    expect(() => Schema.decodeUnknownSync(Plain.Filters)('text')).toThrow()
    expect(() => Schema.decodeUnknownSync(Plain.Filters)([])).toThrow()
  })

  test.each([
    ['empty text', { title: { _tag: 'Contains', text: '' } }],
    ['another kind', { title: { _tag: 'Range', min: 1, max: null } }],
    ['no option', { status: { _tag: 'OneOf', options: [] } }],
    ['an option the column lacks', { status: { _tag: 'OneOf', options: ['Gone'] } }],
    ['an option twice', { status: { _tag: 'OneOf', options: ['Open', 'Open'] } }],
    ['no bound', { hours: { _tag: 'Range', min: null, max: null } }],
    ['a bound past every number', { hours: { _tag: 'Range', min: Infinity, max: null } }],
    ['no day', { due: { _tag: 'Between', from: null, to: null } }],
    ['a day that is no day', { due: { _tag: 'Between', from: '2026-1-2', to: null } }],
  ])('refuses %s', (_, wrong) => {
    expect(() => decode({ ...none, ...wrong })).toThrow()
  })
})

describe('keeps', () => {
  // Typed for the status column, as an `Out.Filtered` carries it.
  const oneOf = (options: ReadonlyArray<Task['status']>): OneOf<Task['status']> => ({
    _tag: 'OneOf',
    options,
  })
  const tasks: ReadonlyArray<Task> = [
    {
      id: 'a',
      title: 'Fix the BOLT',
      status: 'Open',
      hours: 1,
      done: false,
      due: new Date(2026, 0, 2, 23, 30),
      code: '',
    },
    {
      id: 'b',
      title: 'Élan',
      status: 'Done',
      hours: 5,
      done: true,
      due: new Date(2026, 0, 3, 0, 30),
      code: '',
    },
    {
      id: 'c',
      title: 'élan bolt',
      status: 'Doing',
      hours: 3,
      done: false,
      due: new Date(Number.NaN),
      code: '',
    },
  ]
  const read = {
    title: (task: Task) => task.title,
    status: (task: Task) => task.status,
    hours: (task: Task) => task.hours,
    done: (task: Task) => task.done,
    due: (task: Task) => task.due,
  }
  const kept = (filters: Partial<typeof Grid.noFilters>) =>
    tasks.filter(Grid.keeps({ ...Grid.noFilters, ...filters }, read)).map(task => task.id)

  test('keeps every row with no filter', () => {
    expect(kept({})).toEqual(['a', 'b', 'c'])
  })
  test('contains folds ASCII case only, as Expr.contains does', () => {
    expect(kept({ title: Option.some(ColumnFilter.Contains({ text: 'bolt' })) })).toEqual([
      'a',
      'c',
    ])
    expect(kept({ title: Option.some(ColumnFilter.Contains({ text: 'élan' })) })).toEqual(['c'])
  })
  test('a range keeps its bounds', () => {
    expect(kept({ hours: Option.some(range(Option.some(3), fresh)) })).toEqual(['b', 'c'])
    expect(kept({ hours: Option.some(range(fresh, Option.some(3))) })).toEqual(['a', 'c'])
  })
  test('one of, is, and every filter at once', () => {
    expect(kept({ status: Option.some(oneOf(['Open', 'Doing'])) })).toEqual(['a', 'c'])
    expect(
      kept({
        status: Option.some(oneOf(['Open', 'Doing'])),
        done: Option.some(ColumnFilter.Is({ checked: false })),
        title: Option.some(ColumnFilter.Contains({ text: 'fix' })),
      }),
    ).toEqual(['a'])
  })
  test('is keeps the value it names', () => {
    expect(kept({ done: Option.some(ColumnFilter.Is({ checked: true })) })).toEqual(['b'])
  })
  test('a date by its local day, an invalid date by none', () => {
    const on = (day: string) =>
      kept({
        due: Option.some(ColumnFilter.Between({ from: Option.some(day), to: Option.some(day) })),
      })
    expect(on('2026-01-02')).toEqual(['a'])
    expect(on('2026-01-03')).toEqual(['b'])
    // From a day on, with no last day: still not an invalid date.
    expect(
      kept({
        due: Option.some(ColumnFilter.Between({ from: Option.some('2026-01-03'), to: fresh })),
      }),
    ).toEqual(['b'])
  })
  test('writes one change in', () => {
    const next = Grid.setFilter(Grid.noFilters, {
      column: 'done',
      filter: Option.some(ColumnFilter.Is({ checked: true })),
    })
    expect(next).toEqual({
      ...Grid.noFilters,
      done: Option.some(ColumnFilter.Is({ checked: true })),
    })
  })
})

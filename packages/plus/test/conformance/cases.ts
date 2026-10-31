/**
 * The cases every drawer is held to. Each is a small program over one kind
 * of thing a view can draw, and a script that changes it.
 */
import { Option, Schema } from 'effect'
import { createKeyedLazy, createLazy, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { defineView } from 'foldkit/submodel'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, RowModel } from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { DataGridView, GridSlots } from 'foldkit-mixins-data-grid'
import { Resume } from 'foldkit-ssr'
import { Step, type Case, type Probe, type Program, type Tagged } from './harness.js'

/** A case whose types are its own, held where every case is listed. */
export interface AnyCase {
  readonly name: string
  readonly run: <Result>(
    within: <Model, Message extends Tagged>(subject: Case<Model, Message>) => Result,
  ) => Result
}

const define = <Model, Message extends Tagged>(subject: Case<Model, Message>): AnyCase => ({
  name: subject.name,
  run: within => within(subject),
})

// Elements and attributes, by every route Foldkit has to the DOM:
// attributes, properties, classes, style, data and ARIA, and the state of
// fields, changed once by typing and once by a Message.

const FieldsModel = Schema.Struct({
  text: Schema.String,
  checked: Schema.Boolean,
  size: Schema.String,
  note: Schema.String,
})
const FieldsMessage = defineMessageUnion({
  Typed: { value: Schema.String },
  Toggled: {},
  Sized: { value: Schema.String },
  Noted: { value: Schema.String },
})
type FieldsMessage = typeof FieldsMessage.Type

const elements = define({
  name: 'elements and attributes',
  program: () => ({
    Model: FieldsModel,
    init: { text: 'hello', checked: true, size: 'm', note: 'first' },
    update: (model, message: FieldsMessage) =>
      FieldsMessage.match(message, {
        Typed: ({ value }) => ({ ...model, text: value }),
        Toggled: () => ({ ...model, checked: !model.checked }),
        Sized: ({ value }) => ({ ...model, size: value }),
        Noted: ({ value }) => ({ ...model, note: value }),
      }),
    view: (model, h) =>
      h.main(
        [h.Id('root'), h.Class('page wide'), h.Style({ color: 'red', marginTop: '4px' })],
        [
          h.a([h.Href('/next'), h.Title('Next'), h.DataAttribute('kind', 'link')], ['Next']),
          h.img([h.Src('/a.png'), h.Alt('A picture')]),
          h.button(
            [h.Type('button'), h.Disabled(model.checked), h.AriaLabel('Close'), h.Tabindex(2)],
            ['×'],
          ),
          h.div([h.Hidden(true), h.Role('note')], ['hidden']),
          h.label([h.For('text')], ['Text']),
          h.input([
            h.Id('text'),
            h.Type('text'),
            h.Value(model.text),
            h.Placeholder('Say something'),
            h.OnInput(value => FieldsMessage.Typed({ value })),
          ]),
          h.input([
            h.Id('check'),
            h.Type('checkbox'),
            h.Checked(model.checked),
            h.OnClick(FieldsMessage.Toggled()),
          ]),
          h.select(
            [
              h.Id('size'),
              h.Value(model.size),
              h.OnChange(value => FieldsMessage.Sized({ value })),
            ],
            ['s', 'm', 'l'].map(size => h.option([h.Value(size)], [size.toUpperCase()])),
          ),
          h.textarea([
            h.Id('note'),
            h.Value(model.note),
            h.OnInput(value => FieldsMessage.Noted({ value })),
          ]),
          h.p([h.Attribute('data-text', model.text)], [model.text]),
        ],
      ),
  }),
  script: [
    Step.Type({ target: '#text', value: 'typed' }),
    Step.Click({ target: '#check' }),
    Step.Send({ message: FieldsMessage.Sized({ value: 'l' }) }),
    Step.Type({ target: '#note', value: 'second' }),
  ],
})

// Text: adjacent strings, empty ones, whitespace a parser keeps or drops,
// characters a serializer must escape, and the newline a `pre` swallows.

const TextModel = Schema.Struct({ words: Schema.Array(Schema.String) })
const TextMessage = defineMessageUnion({ Said: { word: Schema.String } })
type TextMessage = typeof TextMessage.Type

const text = define({
  name: 'text and whitespace',
  program: () => ({
    Model: TextModel,
    init: { words: ['a', '', ' b '] },
    update: (model, message: TextMessage) => ({ words: [...model.words, message.word] }),
    view: (model, h) =>
      h.div(
        [],
        [
          h.p([], model.words),
          h.p([], ['  ', h.span([], ['x']), '  ', h.span([], ['y']), '  ']),
          h.p([], ['<b>&amp;</b> "quoted" \'single\'', ' é ✓ 😀']),
          h.pre([], ['\nleading newline\n  indented']),
          h.ul([], ['\n  ', h.li([], ['one']), '\n  ', h.li([], ['two']), '\n']),
        ],
      ),
  }),
  script: [Step.Send({ message: TextMessage.Said({ word: 'c' }) })],
})

// Tables: one a parser reads as written, and one it would not.

const TableModel = Schema.Struct({ rows: Schema.Number })
const TableMessage = defineMessageUnion({ Added: {} })
type TableMessage = typeof TableMessage.Type

const tableProgram = (withBody: boolean): Program<typeof TableModel.Type, TableMessage> => ({
  Model: TableModel,
  init: { rows: 2 },
  update: model => ({ rows: model.rows + 1 }),
  view: (model, h) => {
    const rows = Array.from({ length: model.rows }, (_, index) =>
      h.tr([], [h.td([h.Colspan(index + 1)], [`row ${index}`]), h.td([], [String(index)])]),
    )
    return h.table(
      [],
      [
        h.caption([], ['Rows']),
        h.thead([], [h.tr([], [h.th([], ['Name']), h.th([], ['Index'])])]),
        ...(withBody ? [h.tbody([], rows)] : rows),
      ],
    )
  },
})

const table = define({
  name: 'table',
  program: () => tableProgram(true),
  script: [Step.Send({ message: TableMessage.Added() })],
})

const tableWithoutBody = define({
  name: 'table rows outside a tbody',
  program: () => tableProgram(false),
  script: [Step.Send({ message: TableMessage.Added() })],
})

// A keyed list whose rows each hold a Mount: reordered, cut at the front,
// added to at the front. The runtime moves a row's element with its key, so
// a Mount ends only with its own row.

const ListModel = Schema.Struct({ ids: Schema.Array(Schema.String) })
const ListMessage = defineMessageUnion({
  Reversed: {},
  DroppedFirst: {},
  Prepended: { id: Schema.String },
  Watched: { id: Schema.String },
})
type ListMessage = typeof ListMessage.Type

const listUpdate = (model: typeof ListModel.Type, message: ListMessage): typeof ListModel.Type =>
  ListMessage.match(message, {
    Reversed: () => ({ ids: [...model.ids].reverse() }),
    DroppedFirst: () => ({ ids: model.ids.slice(1) }),
    Prepended: ({ id }) => ({ ids: [id, ...model.ids] }),
    Watched: () => model,
  })

const watchOf = (probe: Probe) =>
  Mount.define('Watch', {
    args: { id: Schema.String },
    messages: [ListMessage.Watched],
    execute: ({ id }) => probe.hold('Watch', { id }, ListMessage.Watched({ id })),
  })

const listScript: ReadonlyArray<Step<ListMessage>> = [
  Step.Click({ target: '#drop' }),
  Step.Click({ target: '#reverse' }),
  Step.Send({ message: ListMessage.Prepended({ id: 'z' }) }),
]

const listControls = (h: HtmlBuilder<ListMessage>): ReadonlyArray<Html> => [
  h.button([h.Id('reverse'), h.OnClick(ListMessage.Reversed())], ['Reverse']),
  h.button([h.Id('drop'), h.OnClick(ListMessage.DroppedFirst())], ['Drop first']),
]

const keyedList = define({
  name: 'keyed list with Mounts',
  program: (probe): Program<typeof ListModel.Type, ListMessage> => {
    const Watch = watchOf(probe)
    return {
      Model: ListModel,
      init: { ids: ['a', 'b', 'c'] },
      update: listUpdate,
      view: (model, h) =>
        h.div(
          [],
          [
            ...listControls(h),
            h.ul(
              [],
              model.ids.map(id =>
                h.keyed('li')(id, [h.DataAttribute('id', id), h.OnMount(Watch({ id }))], [id]),
              ),
            ),
          ],
        ),
    }
  },
  script: listScript,
  mounted: ({ args }) => Option.some(ListMessage.Watched({ id: String(args['id']) })),
  probed: ['Watch'],
})

// The same list without keys: elements are patched in place by position.
const positionalList = define({
  name: 'positional list with Mounts',
  program: (probe): Program<typeof ListModel.Type, ListMessage> => {
    const Watch = watchOf(probe)
    return {
      Model: ListModel,
      init: { ids: ['a', 'b', 'c'] },
      update: listUpdate,
      view: (model, h) =>
        h.div(
          [],
          [
            ...listControls(h),
            h.ul(
              [],
              model.ids.map(id =>
                h.li([h.DataAttribute('id', id), h.OnMount(Watch({ id }))], [id]),
              ),
            ),
          ],
        ),
    }
  },
  script: listScript,
  mounted: ({ args }) => Option.some(ListMessage.Watched({ id: String(args['id']) })),
  probed: ['Watch'],
})

// Lazy slots: a row drawn through `createKeyedLazy` and a panel through
// `createLazy`, each redrawn only when its arguments change.

const LazyModel = Schema.Struct({
  counts: Schema.Record(Schema.String, Schema.Number),
  title: Schema.String,
})
const LazyMessage = defineMessageUnion({
  Bumped: { id: Schema.String },
  Renamed: { title: Schema.String },
})
type LazyMessage = typeof LazyMessage.Type

const lazy = define({
  name: 'lazy slots',
  program: () => {
    const rowSlot = createKeyedLazy()
    const panelSlot = createLazy()
    const row = (h: HtmlBuilder<LazyMessage>, id: string, count: number): Html =>
      h.li(
        [],
        [
          h.button(
            [h.Id(`bump-${id}`), h.OnClick(LazyMessage.Bumped({ id }))],
            [`${id}: ${count}`],
          ),
        ],
      )
    const panel = (h: HtmlBuilder<LazyMessage>, title: string): Html => h.h2([], [title])
    return {
      Model: LazyModel,
      init: { counts: { a: 0, b: 0 }, title: 'Counts' },
      update: (model, message: LazyMessage) =>
        LazyMessage.match(message, {
          Bumped: ({ id }) => ({
            ...model,
            counts: { ...model.counts, [id]: (model.counts[id] ?? 0) + 1 },
          }),
          Renamed: ({ title }) => ({ ...model, title }),
        }),
      view: (model, h) =>
        h.div(
          [],
          [
            panelSlot(panel, [h, model.title]),
            h.ul(
              [],
              Object.entries(model.counts).map(([id, count]) => rowSlot(id, row, [h, id, count])),
            ),
          ],
        ),
    }
  },
  script: [
    Step.Click({ target: '#bump-a' }),
    Step.Click({ target: '#bump-a' }),
    Step.Send({ message: LazyMessage.Renamed({ title: 'Totals' }) }),
    Step.Click({ target: '#bump-b' }),
  ],
})

// A submodel: a child view whose Messages reach the parent wrapped.

const CounterMessage = defineMessageUnion({ Incremented: {} })
type CounterMessage = typeof CounterMessage.Type
const counterView = defineView<number, CounterMessage>((count, h) =>
  h.button([h.Class('increment'), h.OnClick(CounterMessage.Incremented())], [String(count)]),
)
const SubmodelModel = Schema.Struct({ left: Schema.Number, right: Schema.Number })
const SubmodelMessage = defineMessageUnion({
  GotLeft: { message: CounterMessage },
  GotRight: { message: CounterMessage },
})
type SubmodelMessage = typeof SubmodelMessage.Type

const submodel = define({
  name: 'submodels',
  program: () => ({
    Model: SubmodelModel,
    init: { left: 0, right: 10 },
    update: (model, message: SubmodelMessage) =>
      SubmodelMessage.match(message, {
        GotLeft: () => ({ ...model, left: model.left + 1 }),
        GotRight: () => ({ ...model, right: model.right + 1 }),
      }),
    view: (model, h) =>
      h.div(
        [],
        [
          h.section(
            [h.Id('left')],
            [
              h.submodel({
                slotId: 'left',
                model: model.left,
                view: counterView,
                toParentMessage: message => SubmodelMessage.GotLeft({ message }),
              }),
            ],
          ),
          h.section(
            [h.Id('right')],
            [
              h.submodel({
                slotId: 'right',
                model: model.right,
                view: counterView,
                toParentMessage: message => SubmodelMessage.GotRight({ message }),
              }),
            ],
          ),
        ],
      ),
  }),
  script: [
    Step.Click({ target: '#right .increment' }),
    Step.Click({ target: '#left .increment' }),
    Step.Click({ target: '#right .increment' }),
  ],
})

// Event handlers: a click on a child bubbles to a parent's handler, and a
// draw that adds and removes elements as the Model changes.

const EventsModel = Schema.Struct({
  log: Schema.Array(Schema.String),
  open: Schema.Boolean,
  picked: Schema.Option(Schema.String),
})
const EventsMessage = defineMessageUnion({
  ClickedInner: {},
  ClickedOuter: {},
  Toggled: {},
  Picked: { name: Schema.String },
})
type EventsMessage = typeof EventsMessage.Type

const events = define({
  name: 'event handlers',
  program: () => ({
    Model: EventsModel,
    init: { log: [], open: false, picked: Option.none() },
    update: (model, message: EventsMessage) =>
      EventsMessage.match(message, {
        ClickedInner: () => ({ ...model, log: [...model.log, 'inner'] }),
        ClickedOuter: () => ({ ...model, log: [...model.log, 'outer'] }),
        Toggled: () => ({ ...model, open: !model.open }),
        Picked: ({ name }) => ({ ...model, picked: Option.some(name) }),
      }),
    view: (model, h) =>
      h.div(
        [],
        [
          h.div(
            [h.Id('outer'), h.OnClick(EventsMessage.ClickedOuter())],
            [h.span([h.Id('inner'), h.OnClick(EventsMessage.ClickedInner())], ['inner'])],
          ),
          h.button(
            [h.Id('toggle'), h.OnClick(EventsMessage.Toggled())],
            [model.open ? 'Close' : 'Open'],
          ),
          model.open
            ? h.ul(
                [h.Id('menu')],
                ['one', 'two'].map(name =>
                  h.li(
                    [],
                    [
                      h.button(
                        [h.Id(`pick-${name}`), h.OnClick(EventsMessage.Picked({ name }))],
                        [name],
                      ),
                    ],
                  ),
                ),
              )
            : h.empty,
          h.output([], [Option.getOrElse(model.picked, () => 'nothing'), ...model.log]),
        ],
      ),
  }),
  script: [
    Step.Click({ target: '#inner' }),
    Step.Click({ target: '#toggle' }),
    Step.Click({ target: '#pick-two' }),
    Step.Click({ target: '#toggle' }),
  ],
})

// `KeepTyped`, from foldkit-ssr's resumable builder: outside a server
// render it marks the field and nothing else.

const KeepModel = Schema.Struct({ query: Schema.String })
const KeepMessage = defineMessageUnion({ ChangedQuery: { value: Schema.String } })
type KeepMessage = typeof KeepMessage.Type

const keepTyped = define({
  name: 'KeepTyped',
  program: () => ({
    Model: KeepModel,
    init: { query: 'at' },
    update: (_, message: KeepMessage) => ({ query: message.value }),
    view: (model, h) => {
      const rh = Resume.builder(h)
      return rh.form(
        [],
        [
          rh.input([
            rh.Id('query'),
            rh.Value(model.query),
            rh.OnInput(KeepMessage.ChangedQuery),
            rh.KeepTyped(),
          ]),
          rh.p([], [model.query]),
        ],
      )
    },
  }),
  script: [Step.Type({ target: '#query', value: 'atlas' })],
})

// The data grid, from foldkit-mixins-data-grid: two sortable columns,
// sorted by clicking a header's button, then a cell's editor opened from the
// keyboard and typed in. The grid measures its scroll container with a
// Mount, which Scene is told the result of: a browser lays the fixed box out
// at 400 by 100, and jsdom at nothing. The editor holds focus with another,
// which answers as it starts. The editor is left open: closing it moves focus
// back to the grid, which only the runtime does, so its blur would differ.

interface Item {
  readonly id: string
  readonly name: string
}
const items: ReadonlyArray<Item> = [
  { id: 'b', name: 'Bolt' },
  { id: 'a', name: 'Anchor' },
  { id: 'c', name: 'Clamp' },
]
const columns = Columns.define<Item>()({
  id: { header: 'Id', value: item => item.id, width: 100 },
  name: { header: 'Name', value: item => item.name, width: 100, edit: {} },
})
const Grid = DataGrid.make({ id: 'parts', columns })
const GridPlacement = Bundle.declare(Grid.bundle, 'grid')
const SortKey = Schema.Literals(['id', 'name'])
const GridModel = Schema.Struct({
  ...GridPlacement.fields,
  sort: Schema.Option(Schema.Struct({ key: SortKey, descending: Schema.Boolean })),
})
type GridModel = typeof GridModel.Type
const GridMessage = defineMessageUnion({
  ...GridPlacement.cases,
  Sorted: { key: SortKey },
})
type GridMessage = typeof GridMessage.Type
const gridApplication = Bundle.assemble<GridModel, GridMessage>()([
  Bundle.parent({ Model: GridModel, Message: GridMessage }).at(GridPlacement, {
    onOut: Bundle.ignore,
  }),
])
const gridUpdate = gridApplication.update()
const GridView = DataGridView<GridMessage>()
  .define(Grid)
  .pipe(
    Style.attach(
      Style.forSlots(GridSlots)({ root: Style.inline({ width: '400px', height: '100px' }) }),
    ),
  )
const laidOut = !navigator.userAgent.includes('jsdom')
const gridWrap = (message: typeof Grid.Message.Type) => GridPlacement.wrapper.make(message)
const gridMounts = [
  ...DataGridView<GridMessage>().resolveMounts(Grid, {
    wrap: gridWrap,
    viewport: { top: 0, left: 0, width: laidOut ? 400 : 0, height: laidOut ? 100 : 0 },
  }),
  ...DataGridView<GridMessage>().resolveOpened(Grid, { wrap: gridWrap, opened: 'editor' }),
]

const gridHeader = define({
  name: 'data grid',
  program: () => ({
    Model: GridModel,
    init: gridApplication.initial({ sort: Option.none() }).model,
    update: (model, message: GridMessage) => {
      if (message._tag === 'Sorted') {
        const descending = Option.match(model.sort, {
          onNone: () => false,
          onSome: sort => sort.key === message.key && !sort.descending,
        })
        return { ...model, sort: Option.some({ key: message.key, descending }) }
      }
      const step = gridUpdate(model, message)
      if ((step.commands ?? []).length > 0)
        throw new Error(`the grid asked for Commands on ${message._tag}`)
      return step.model
    },
    view: (model, h) => {
      const sorted = Option.match(model.sort, {
        onNone: () => items,
        onSome: ({ key, descending }) =>
          [...items].sort((a, b) => (a[key] < b[key] ? -1 : 1) * (descending ? -1 : 1)),
      })
      const direction = (key: 'id' | 'name') =>
        Option.match(
          Option.filter(model.sort, sort => sort.key === key),
          {
            onNone: () => undefined,
            onSome: sort => (sort.descending ? ('desc' as const) : ('asc' as const)),
          },
        )
      return GridView(
        {
          state: model.grid,
          rows: RowModel.fromArray(sorted, item => item.id),
          wrap: gridWrap,
          label: 'Parts',
          rowHeight: 20,
          headerHeight: 20,
          sort: {
            id: { direction: direction('id'), message: GridMessage.Sorted({ key: 'id' }) },
            name: { direction: direction('name'), message: GridMessage.Sorted({ key: 'name' }) },
          },
        },
        h,
      )
    },
  }),
  script: [
    // What a browser's layout reports, so jsdom's drawers draw the rows too.
    Step.Send({
      message: gridWrap(Grid.Message.Measured({ top: 0, left: 0, width: 400, height: 100 })),
    }),
    Step.Click({ target: '[aria-colindex="2"] button' }),
    Step.Click({ target: '[aria-colindex="2"] button' }),
    Step.Click({ target: '[aria-colindex="1"] button' }),
    Step.Key({ target: '[role="grid"]', key: 'ArrowRight' }),
    Step.Key({ target: '[role="grid"]', key: 'Enter' }),
    Step.Type({ target: 'input', value: 'Bolts' }),
  ],
  mounted: ({ name }) =>
    Option.map(
      Option.fromUndefinedOr(gridMounts.find(([mount]) => mount.name === name)),
      ([, message]) => message,
    ),
})

export const cases: ReadonlyArray<AnyCase> = [
  elements,
  text,
  table,
  tableWithoutBody,
  keyedList,
  positionalList,
  lazy,
  submodel,
  events,
  keepTyped,
  gridHeader,
]

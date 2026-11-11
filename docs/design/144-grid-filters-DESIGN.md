# Per-column filter controls for the data grid (#144)

Status: designed 2026-11-11; awaiting its independent review, not built. One of #144's leftovers
([data-grid-DESIGN.md](./data-grid-DESIGN.md), "The reference application
as built so far": "A filter control drawn by the grid, per column, is not
built").

## 1. The problem, and what exists

A grid shows a column's values; a person narrowing them wants to type "bolt"
over the descriptions, a price range, or tick two statuses, from the column
itself. Today nothing in the grid packages filters:

- `foldkit-data-grid` takes rows as a `RowModel` the application built
  (`RowModel.fromArray`, `GridCrud.rows`), already in its order. `rows.ts`
  says it: "a sorted or filtered result is the application's, not the
  grid's".
- Sorting is drawn by the grid and owned by the application: the view takes
  `sort?: { [K in Id]?: ColumnSort<Message> }`, a direction and the
  application's own Message per column (`mixins-data-grid/src/view.ts`,
  `ColumnSort`; `foldkit-crud`'s `Sort.inputs` builds them). Enter on a
  header, or a press on its `sort` button, sends that Message.
- `examples/registry` filters on the server: its Model holds `search`,
  `ProductsQuery`'s input carries it, and the body's `Expr.contains` is
  compiled by the Drizzle binding. `examples/data-grid` does not filter.
- `foldkit-crud` has no list filter of its own; a list's input is whatever
  its Query takes.
- `foldkit-entity`'s `Expr` already says every filter this note needs, over
  an input that may be null: `Expr.whenGiven(input.x, x => …)` filters only
  when given, with `Expr.contains`, `Expr.gte`/`lte` and `Expr.in`.

## 2. Who owns what

| Fact or transition | Owner | Why |
| --- | --- | --- |
| A column's filter value (the text, the bounds, the options ticked) | the application's Model | It is query input, as sort and search are (§17 and invariant 6 of the grid design: no hidden filter state in the grid). A Remote list keys its cache by that input; held rows are filtered by whoever holds them. |
| Applying it | the rows' owner | Held rows: the application, before `RowModel.fromArray`. Remote: the server, through the Query's body. |
| Which columns filter, and with which control | the column (`ColumnSpec.filter`) | Fixed with the grid, worked out once, as a column's editor is. |
| Whether a column's filter is open, and its form while open | the grid's Model | UI state like the column menu: no other part reads it. |

The grid never filters a row, never reads a filter back from its own Model
to draw rows, and holds no copy of the value outside an open form. The
application writes the value only from `Out.Filtered`, as it writes a cell
only from `Out.Edited`.

## 3. Options considered

**Where the value lives.**

- *The grid's Model* (as column state is). Rejected: then a search box
  outside the grid, a URL, or a saved view writes into the grid through grid
  Messages, and a Remote query's input reads the grid's internals. The grid
  design already decided sorting and filtering are query state.
- *The application's Model, changed by the application's own Message given
  per column* (as `sort` is: `{ value, message: (next) => Message }`).
  Rejected: a function nested in a view input breaks `h.submodel`
  (AGENTS.md: "A view input may hold no nested function"), and the
  application would rebuild a typed value from each keystroke itself.
- **Chosen: the application's Model, reported by the grid as
  `Out.Filtered({ column, filter })`**, the edit's route. The view takes the
  values as data (`filters`), the update reports each change, already typed.

**Where the control is drawn.**

- *A filter row* under the headers, a field per column. Rejected: the grid
  is one tab stop pointing at cells with `aria-activedescendant`; a row of
  live fields is a tab stop per column, or a second editing mode for header
  cells, and it costs a row's height on every grid.
- **Chosen: a popover from the header**, as the column menu is: a button on
  each filterable header, and Alt+ArrowDown on a focused header (Excel's key
  for its filter). It is drawn inside the header cell, takes focus, and
  closes when focus leaves it. With a column menu, Shift+F10 and the menu
  key still open the menu, and Alt+ArrowDown opens the menu only on a
  column that does not filter.

**Who keeps the form while it is open.**

- *Nothing: each field sends the whole filter, computed from what the view
  drew.* Rejected twice over. A number field drawn from the value loses what
  its number cannot keep (`1.` becomes `1` on the next frame, eating the
  point), and keys faster than a frame meet the last frame's view
  (AGENTS.md): a key in the minimum, Tab and a key in the maximum within
  one frame send a maximum computed from the old minimum, undoing it.
- **Chosen: the grid holds the open form** (`filtering.form`), seeded from
  the application's value when it opens (the view sends the value it drew,
  as a checkbox key sends `drawn`). Each field sends only its own change,
  applied in `update` to the form as it is now; a change that leaves a valid
  filter different from the last one is reported.

## 4. The shape

### 4.1 A column declares that it filters

```ts
interface ColumnSpec<Row, Value> {
  // …
  /**
   * Draws a filter control on the column's header. `true` reads the control
   * from `edit.schema` (`CellEditor`): text, a number range, a choice of its
   * literals, a checkbox, or a date range; a column without a schema filters
   * text. A `CellEditor` names it, for a column that does not edit.
   */
  readonly filter?: true | CellEditor
}

const columns = Columns.define<Product>()({
  description: { header: 'Description', value: p => p.description, filter: true },
  status: { header: 'Status', value: p => p.status, edit: { schema: Status }, filter: true },
  price: {
    header: 'Price',
    value: p => p.price.toFixed(2),
    filter: CellEditor.Number(),
  },
})
```

Reusing `CellEditor` is deliberate: a column's kind is one fact, already read
from its schema for editing, so filtering reads the same one. A choice's
options are its literals; `CellEditor.Choice({ options })` names them for a
column that does not edit.

### 4.2 The value

```ts
/** What one column is filtered by: the application's to hold and to apply. */
export const ColumnFilter = defineTaggedUnion({
  /** A text column: its text holds this, ignoring case. */
  Contains: { text: Schema.String },
  /** A number column: at least `min`, at most `max`, each when given. */
  Range: { min: Schema.OptionFromNullOr(Schema.Number), max: Schema.OptionFromNullOr(Schema.Number) },
  /** A choice: one of these literals. */
  OneOf: { options: Schema.Array(Schema.String) },
  /** A checkbox: checked, or not. */
  Is: { checked: Schema.Boolean },
  /** A date: on or after `from`, on or before `to`, each a local day `YYYY-MM-DD`. */
  Between: { from: Schema.OptionFromNullOr(Day), to: Schema.OptionFromNullOr(Day) },
})
```

One variant per kind: Text is `Contains`, Number `Range`, Choice `OneOf`,
Checkbox `Is`, Date `Between`. A filter that keeps every row is no filter,
so the grid reports none for an empty text, two absent bounds, no options
ticked, or "Any": the application never stores an empty filter and never has
to tell one from none. A Range or a Between whose bounds cross is reported
as it is and matches nothing (§6).

### 4.3 The grid

`DataGrid.make` adds, for the columns that filter:

```ts
const Grid = DataGrid.make({ id: 'products', columns })

Grid.filterFor('price')       // Option<CellEditor>: the control, none for a column that does not filter
Grid.Filters                  // Schema.Struct({ description: OptionFromNullOr(Contains), status: …OneOf, price: …Range })
Grid.noFilters                // every column none: the application's starting value
Grid.Out.Filtered({ column: 'price', filter: Option.some(ColumnFilter.Range({ min: Option.some(2), max: Option.none() })) })
```

`Filters` is the stored form: each column's field accepts only its own
variant (`ColumnFilter`'s `subset`), so a saved value naming a Range for a
text column fails to decode rather than drawing a control it does not fit.

The Model gains one field, and the Messages six:

```ts
filtering: Schema.OptionFromNullOr(Schema.Struct({ column: FilterColumn, form: FilterForm }))

FilterOpened: { column: FilterColumn, drawn: Schema.OptionFromNullOr(ColumnFilter) },
FilterTyped: { field: Schema.Literals(['text', 'min', 'max', 'from', 'to']), text: Schema.String },
FilterOptionToggled: { option: Schema.String },
FilterChecked: { state: Schema.Literals(['any', 'true', 'false']) },
FilterCleared: {},
FilterClosed: {},
```

`FilterForm` is the open form as typed: `{ text, min, max, options, checked,
from, to }`, every field text or a list, so a bound holds `1.` while it is
typed. Each kind reads its own fields. `update`:

- `FilterOpened` opens the form seeded from `drawn`, focuses the header
  (so closing returns there), and closes the menu and any edit, as
  `MenuOpened` does. It refuses (returns the Model it was given) a column
  that does not filter or is hidden, and a `drawn` of another kind.
- `FilterTyped`, `FilterOptionToggled` and `FilterChecked` change one field
  of the open form; a field another kind owns, or an option the column does
  not offer, is refused. When the form's filter is valid and differs
  (`Equal.equals`) from the form's filter before the change, the update
  reports `Out.Filtered`.
- `FilterCleared` empties the form, reporting none if it held a filter;
  `FilterClosed` drops the form. Hiding the column closes it too.

### 4.4 The view

```ts
Registry(
  {
    state: model.grid,
    rows: rowsOf(model),
    wrap: wrapGrid,
    label: 'Products',
    rowHeight: 32,
    headerHeight: 36,
    filters: model.filters, // required when a column filters
  },
  h,
)
```

`filters` is `{ readonly [K in FilterableId]: Option<ColumnFilter> }`,
required by the input's type when any column filters and refused when none
does, so declaring `filter` on a column and drawing the grid are one
decision.

Each filterable header draws a `filterButton` (`aria-haspopup="dialog"`,
`aria-expanded`, `aria-label` "Filter Price", out of the tab order like the
sort and menu buttons) and, while its column is filtered,
`data-filtered="true"` on the header and the button and an
`aria-description` ("Filtered") on the header, which is what the grid's
`aria-activedescendant` names. The open form is a `filter` Slot, a
non-modal `role="dialog"` named "Filter Price", inside the header cell,
holding native controls:

| Kind | Controls |
| --- | --- |
| Text | one `input` labelled "Contains" |
| Number | two `input inputmode="decimal"`, "At least" and "At most"; a bound that is not a number is `aria-invalid` and described by "Not a number" |
| Choice | a `role="group"` of native checkboxes, one per literal |
| Checkbox | a `role="radiogroup"` of native radios: Any, Checked, Unchecked |
| Date | two `input type="date"`, "From" and "To" |

and a `filterClear` button while a filter holds. Every word is in
`words.filters`.

### 4.5 Wiring it

Held rows (`examples/data-grid`): store the value, filter before building the
row model, and memoize by the inputs' identity, since 100,000 rows filtered
on every render would also miss the projection's cache.

```ts
// onOut
Filtered: ({ column, filter }) => ({
  model: modifyFields(model, { filters: filters => ({ ...filters, [column]: filter }) }),
}),

// A column with no filter keeps every row.
const passes = (filter: Option.Option<ColumnFilter>, value: string | number) =>
  Option.match(filter, { onNone: () => true, onSome: f => matchesFilter(f, value) })

const kept = (products: ReadonlyArray<Product>, filters: typeof Grid.Filters.Type) =>
  products.filter(
    product =>
      passes(filters.description, product.description) &&
      passes(filters.price, product.price) &&
      passes(filters.status, product.status),
  )
```

`matchesFilter(filter, value)` is the held-rows reading of each variant:
`Contains` lower-cases both sides, `Range` compares a number, `OneOf` a
string, `Is` a boolean, `Between` a `Date` by its local day. It throws on a
value of another type (a `Range` given text): the column's `value` is what
the cell shows (`price.toFixed(2)`), so the application names its own field,
and a wrong one is a programming error, not a row to drop.

Remote (`examples/registry`): the value becomes the query's input, and the
body filters only what is given.

```ts
export const ProductsQuery = Query.define(
  'Products',
  {
    sort: ProductSort.Schema,
    search: Schema.String,
    statuses: Schema.NullOr(Schema.Array(Status)),
    minCents: Schema.NullOr(Schema.Int),
    maxCents: Schema.NullOr(Schema.Int),
  },
  ({ input }) =>
    Query.from(Registry.Product).pipe(
      Query.where(
        Expr.whenGiven(input.statuses, statuses => Expr.in(fields.status, statuses)),
        Expr.whenGiven(input.minCents, min => Expr.gte(fields.cents, min)),
        Expr.whenGiven(input.maxCents, max => Expr.lte(fields.cents, max)),
      ),
    ),
)
```

The page's `input` maps `model.filters` onto those fields (dollars typed, so
`Math.round(min * 100)`). A Remote list is keyed by its input, so each filter
is a list of its own, cached, and refetching is recovery.

## 5. Keyboard and ARIA

- On a focused header of a filterable column, Alt+ArrowDown opens the
  filter. With `columnMenu`, Shift+F10 and the menu key open the menu, and
  Alt+ArrowDown opens it on a column that does not filter.
- The form's first control takes focus (`HoldFocus`): the text, the
  minimum, the first option, the checked radio, or From. Tab moves through
  its controls natively; focus leaving the form's header closes it; Escape
  closes it and focus returns to the grid, whose header is focused.
- A filter applies as it is typed; there is no Apply button, so a filter is
  never typed and silently unapplied.
- While the form is open the grid's clipboard handlers are off, so copy and
  paste in its fields are the fields' own, as they are in an editor.
- A press inside the form is the form's: the header row's drag listener
  ignores it, as it ignores the menu.

## 6. Failure semantics

- **A bound that is not a number** (`1e`, `abc`): the form keeps the text,
  the field is `aria-invalid` with "Not a number", and nothing is reported,
  so the rows stay filtered by the last filter that held. Fixing or clearing
  the text reports again.
- **Crossed bounds** (`min > max`, `from > to`) are reported as they are and
  match nothing. Refusing them would leave the rows filtered by a stale
  range while the form shows the new one, and the next keystroke usually
  uncrosses them.
- **A value of another kind** in `filters` cannot come from the grid: only
  a hand-built value can be one. `Grid.Filters` refuses it on decode;
  `FilterOpened` with it is refused, so the button does nothing, and the
  header reads it as no filter.
- **A Remote read that fails** for a filter is the list's failure, shown as
  any failed read is (`GridCrud.status`); the filter stays, and Retry asks
  for the same input.
- **A stale form.** The form is seeded when it opens. A change the
  application makes to the value while the form is open (none of the
  examples does: pressing anything outside it closes it) is overwritten by
  the form's next report, as an edit's commit is judged from the text it
  began from.

## 7. Migration

Additive. A grid with no `filter` column draws nothing new and its input
type refuses `filters`. The grid's Model gains `filtering` (none at
`init`), so a whole grid Model stored before this fails to decode, as it did
when `menu` and `filling` were added; nothing here stores one (the examples
store the column state, which is unchanged).

## 8. Left out

- **Operators beyond these five** (starts with, equals, not, empty, regex):
  each is one more variant and one more control; `Contains` covers the
  common text case and an application can filter more outside the grid.
- **Combining filters other than "and"** across columns, and more than one
  condition per column.
- **A filter row**, and a filter drawn outside the grid (a facet panel): the
  value is the application's, so it can draw one itself and pass the same
  `filters`.
- **Debouncing** a Remote filter as it is typed: Remote keys a read by its
  input and keeps every list loaded, so each keystroke is a read; an
  application that wants fewer can hold the text and set the input on a
  timer. Not built here.
- **Counts per option**, and options read from the data rather than the
  schema.
- **`GridCrud` deriving filters from a list's Query**: the Query's input is
  the application's to declare; this note shows the mapping by hand.

# Per-column filter controls for the data grid (#144)

Status: designed 2026-11-11, revised after review round 1 the same day; not
built. One of #144's leftovers ([data-grid-DESIGN.md](./data-grid-DESIGN.md),
"The reference application as built so far": "A filter control drawn by the
grid, per column, is not built").

Everything named in §4 is **planned API**: it does not exist yet. Its
signatures and every snippet in §4 and §5 were checked with `tsc -b` against
declarations of those signatures, in temporary `*.test-d.ts` files in
`examples/data-grid` (the grid's types) and `examples/registry` (the Remote
query). A deliberate error showed each file was checked, and the files were
deleted afterwards.

## 1. The problem, and what exists

People want to narrow a column from the column itself: type "bolt" over the
descriptions, give a price range, or tick two statuses. Today nothing in the
grid packages filters:

- `foldkit-data-grid` takes rows as a `RowModel` the application built
  (`RowModel.fromArray`, `GridCrud.rows`), already in its order. `rows.ts`
  says "a sorted or filtered result is the application's, not the grid's".
- Sorting is drawn by the grid and owned by the application. The view takes
  `sort?: { [K in Id]?: ColumnSort<Message> }`, a direction and the
  application's own Message per column (`mixins-data-grid/src/view.ts`;
  `foldkit-crud`'s `Sort.inputs` builds them).
- `examples/registry` filters on the server. Its Model holds `search`,
  `ProductsQuery`'s input carries it, and the body's `Expr.contains` is
  compiled by the Drizzle binding. `examples/data-grid` does not filter.
- `foldkit-crud` has no list filter of its own.
- `foldkit-entity`'s `Expr` already covers each filter here.
  `Expr.contains` folds ASCII case on every backend
  (`remote-drizzle/src/compile.ts`, `Contains`). `Expr.in` with an empty
  list matches no row (`compile.ts`, `In`). `Expr.whenGiven(input.x, …)`
  filters only when the input is not null. `Expr.gte` and `Expr.lte` give
  bounds.
- A column's kind is already read from its schema for editing
  (`columns.ts`, `editorOf` → `CellEditor`).

## 2. Who owns what

| Fact or transition | Owner | Why |
| --- | --- | --- |
| A column's filter value (the text, the bounds, the options ticked) | the application's Model | It is query input, as sort and search are. §17 and invariant 6 of the grid design say there is no hidden filter state in the grid. A Remote list keys its cache by that input; held rows are filtered by whoever holds them. |
| Applying it | the rows' owner | For held rows, the application, before `RowModel.fromArray` (`Grid.keeps` reads each variant). For Remote, the server, through the Query's body. |
| Which columns filter, and with which control | the column (`ColumnSpec.filter`) | It is fixed with the grid and worked out once, as a column's editor is. |
| Whether a column's filter form is open, and the form | the grid's Model | UI state, like the column menu. Nothing outside the form reads it. |

The grid never filters a row. Apart from what an open form was seeded with,
it holds no copy of the value. The application writes the value only from
`Out.Filtered`, as it writes a cell only from `Out.Edited`.

## 3. Options considered

**Where the value lives.**

- *In the grid's Model*, as column state does. Rejected: a search box
  outside the grid, a URL or a saved view would then write into the grid
  through grid Messages, and a Remote query's input would read the grid's
  internals. The grid design already decided that sorting and filtering are
  query state.
- *In the application's Model, changed by an application Message given per
  column* (`{ value, message: next => Message }`, as `sort` gives its
  Message). Rejected: a function nested in a view input breaks
  `h.submodel` (AGENTS.md, "A view input may hold no nested function").
- **Chosen: in the application's Model, reported by the grid as
  `Out.Filtered({ column, filter })`**, the same route as an edit. The view
  takes the values as data (`filters`), and the update reports each change,
  typed per column.

**Where the control is drawn.**

- *A filter row* under the headers. Rejected: the grid is one tab stop that
  points at cells with `aria-activedescendant`. A row of live fields adds a
  tab stop per column, or needs a second editing mode for header cells, and
  it costs a row's height on every grid.
- **Chosen: a popover from the header**, as the column menu is.
  - It is reached from a button on each filterable header, or with
    Alt+ArrowDown on a focused header (Excel's key for its filter).
  - It is drawn in the header cell, takes focus, and closes when focus
    leaves it.

**Who keeps the form while it is open.**

- *Nothing: each field sends the whole filter, computed from what the view
  drew.* Rejected for two reasons.
  - A number field drawn from its value loses what the number cannot keep:
    `1.` becomes `1` on the next frame.
  - Keys faster than a frame meet the last frame's view (AGENTS.md). A key
    in the minimum, then Tab and a key in the maximum within one frame,
    sends a maximum computed from the old minimum and undoes the first key.
- **Chosen: the grid holds the open form.** The form is seeded when it opens
  from the value the view drew, as a checkbox key sends `drawn`. Each field
  sends only its own change, applied in `update` to the form as it is now.

**How the value is typed.** A single `ColumnFilter` union for every column
let a Range reach a text column and forced a held-rows reader to throw on a
wrong value. Instead, each column's filter type is derived from its spec
(§4.2), as `matchEdit` types each column's value. A wrong variant or a wrong
field is then a compile error.

## 4. The shape (planned)

### 4.1 A column declares that it filters

`ColumnSpec` gains one optional field:

```ts
interface ColumnSpec<Row, Value> {
  // … as today
  /**
   * Draws a filter control on the column's header. `true` reads the kind
   * from `edit.schema`'s decoded side: a boolean is a checkbox, a `Date` a
   * date range, a number a range, a union of string literals a choice of
   * them, anything else text. A column without a schema filters text. A
   * `CellEditor` names the kind for a column that does not edit
   * (`CellEditor.Number()`, `CellEditor.Choice({ options })`).
   */
  readonly filter?: true | CellEditor
}
```

The field has to be declared, not only read. Without it, `filter: true`
widens to `boolean` in `Columns.define`'s inference, and the per-column type
is lost. The check showed this.

The kind is read from the **decoded** side, unlike the editor. `editorOf`
reads a choice from the encoded side, because that is the text typed. A
filter compares decoded values, the application's own fields. So `true`
uses `filterKindOf(schema)`, a sibling of `editorOf` with the same order of
checks (checkbox first), over `SchemaAST.toType`. The type-level `FilterKind`
below follows the same rule, so the runtime and the types agree for any
schema: a literal text decoding to numbers is a Number range on both sides.

```ts
const columns = Columns.define<Product>()({
  description: { header: 'Description', value: p => p.description, filter: true },
  status: { header: 'Status', value: p => p.status, edit: { schema: Status }, filter: true },
  price: { header: 'Price', value: p => p.price.toFixed(2), filter: CellEditor.Number() },
  stocked: {
    header: 'Stocked',
    value: p => p.stocked,
    edit: { schema: Columns.checkbox },
    filter: true,
  },
})
```

### 4.2 The value, typed per column

```ts
type Contains = { readonly _tag: 'Contains'; readonly text: string }
type Range = {
  readonly _tag: 'Range'
  readonly min: Option.Option<number>
  readonly max: Option.Option<number>
}
type OneOf<V extends string> = { readonly _tag: 'OneOf'; readonly options: ReadonlyArray<V> }
type Is = { readonly _tag: 'Is'; readonly checked: boolean }
/** Local calendar days, `YYYY-MM-DD`, as a date input reads them. */
type Between = {
  readonly _tag: 'Between'
  readonly from: Option.Option<string>
  readonly to: Option.Option<string>
}
/** `ColumnFilter`: the union, and its constructors (a `defineTaggedUnion`). */
type ColumnFilter = Contains | Range | OneOf<string> | Is | Between

type KindOfValue<V> = [V] extends [boolean]
  ? 'Checkbox'
  : [V] extends [Date]
    ? 'Date'
    : [V] extends [number]
      ? 'Number'
      : string extends V
        ? 'Text'
        : [V] extends [string]
          ? 'Choice'
          : 'Text'
/** A column's filter kind, as `filterKindOf` reads it at run time. */
type FilterKind<Spec> = Spec extends { readonly filter: infer F }
  ? F extends true
    ? Spec extends { readonly edit: { readonly schema: Schema.Codec<infer V, string> } }
      ? KindOfValue<V>
      : 'Text'
    : F extends { readonly _tag: infer T }
      ? T
      : never
  : never
type ChoiceOf<Spec> = Spec extends {
  readonly filter: true
  readonly edit: { readonly schema: Schema.Codec<infer V, string> }
}
  ? V & string
  : string
export type FilterOf<Spec> = {
  Text: Contains
  Number: Range
  Choice: OneOf<ChoiceOf<Spec>>
  Checkbox: Is
  Date: Between
}[FilterKind<Spec> & ('Text' | 'Number' | 'Choice' | 'Checkbox' | 'Date')]
/** What `keeps` reads from a row for a filter: a Range a number, a Between a Date. */
export type FilterValue<F> = F extends Contains
  ? string
  : F extends Range
    ? number
    : F extends OneOf<infer V>
      ? V
      : F extends Is
        ? boolean
        : F extends Between
          ? Date
          : never
export type FilterableId<Specs> = {
  [K in keyof Specs]: Specs[K] extends { readonly filter: true | CellEditor } ? K : never
}[keyof Specs] &
  string
export type Filters<Specs> = {
  readonly [K in FilterableId<Specs>]: Option.Option<FilterOf<Specs[K]>>
}
```

Kind to variant: Text is `Contains`, Number `Range`, Choice `OneOf`,
Checkbox `Is`, and Date `Between`.

**No empty variant.** A filter that keeps every row is no filter. The grid
reports none for:

- empty text;
- two absent bounds;
- no options ticked;
- "Any".

`Grid.Filters` refuses such a value on decode (§4.4). So the application never
stores an empty filter, and an empty `OneOf` never reaches `Expr.in`, where
it would match no row.

**"No options ticked" means no filter, not "all ticked".** Ticking narrows:
an untouched form ticks nothing and filters nothing, so opening a filter and
ticking Active means "only Active". With "all ticked" as the empty state,
the form would have to draw every option ticked for a column with no filter,
and a value could not be told from no filter by looking. All options ticked
is a real filter (`OneOf` of every literal). It keeps every row with a
value, which differs from no filter only for a nullable column.

### 4.3 The grid

`DataGrid.make` adds these members for the columns that filter:

```ts
interface GridFilters<Row, Specs> {
  /** The column's filter kind; none for a column that does not filter. */
  readonly filterFor: (column: keyof Specs & string) => Option.Option<CellEditor>
  /** The stored form of `Filters`: `null` for none, each column its own variant only. */
  readonly Filters: Schema.Codec<Filters<Specs>, unknown>
  /** Every column none: the application's starting value. */
  readonly noFilters: Filters<Specs>
  /** `filters` with one `Out.Filtered` written in: the only way the value changes. */
  readonly setFilter: (filters: Filters<Specs>, filtered: Filtered<Specs>) => Filters<Specs>
  /**
   * A predicate over held rows that keeps a row every given filter keeps. `read`
   * names the application's own field per column, typed by its variant. Built
   * once per `filters`; memoize it by that value's identity.
   */
  readonly keeps: (
    filters: Filters<Specs>,
    read: { readonly [K in FilterableId<Specs>]: (row: Row) => FilterValue<FilterOf<Specs[K]>> },
  ) => (row: Row) => boolean
}

/** `Out.Filtered`, one case per filterable column, its filter its own variant. */
type Filtered<Specs> = {
  [K in FilterableId<Specs>]: {
    readonly _tag: 'Filtered'
    readonly column: K
    readonly filter: Option.Option<FilterOf<Specs[K]>>
  }
}[FilterableId<Specs>]
```

**The schemas** are built per column at `make`:

- `Contains`: text of at least one character.
- `Range`: `Schema.Finite` bounds, at least one given. `1e999` decodes to
  `Infinity` under `Schema.Number`, JSON writes `Infinity` as `null`, and
  `whenGiven` would then read the bound as not given.
- `OneOf`: a non-empty list of the column's own literals, each once, so a
  stale option in a saved view is refused rather than drawn as a box that
  cannot be unticked.
- `Between`: `YYYY-MM-DD` days, at least one given.

`Filters` is a `Struct` of `OptionFromNullOr` of those, with
`onExcessProperty: 'error'` at its decode, the boundary a URL or a saved view
crosses. Its declared type is `Filters<Specs>`, which the runtime schema
enforces column by column (the one cast in the module, said beside it).
`Out.Filtered`'s schema is the union of those column schemas, so a
`Filtered` the update builds is checked by the same rules.

**`keeps`** reads each variant:

- `Contains`: the value holds the text, folding ASCII case only, as
  `Expr.contains` does on every backend, so held rows and a server agree.
- `Range`: the value is at least `min` and at most `max`.
- `OneOf`: one of the options, compared through a `Set` built once.
- `Is`: equal to `checked`.
- `Between`: the `Date`'s local calendar day, as `draftOf` writes a date, is
  in the range of days.

It reads the application's own field, never the column's `value`, which is
display text (`price.toFixed(2)`); the type makes the wrong one an error. A
column with no filter costs nothing per row.

**The Model** gains one field:

```ts
filtering: Schema.OptionFromNullOr(
  Schema.Struct({
    column: FilterColumn, // Schema.Literals of the filterable ids
    form: FilterForm,
    /** What the application had when the form opened, then each filter reported since. */
    reported: Schema.OptionFromNullOr(ColumnFilterOf), // that column's variant
  }),
)
/** The form as typed: a bound holds `1.` while it is typed. Each kind reads its own fields. */
FilterForm = Schema.Struct({
  text: Schema.String,
  min: Schema.String,
  max: Schema.String,
  options: Schema.Array(Schema.String),
  checked: Schema.Literals(['any', 'true', 'false']),
  from: Schema.String,
  to: Schema.String,
})
```

**The Messages** are six:

```ts
FilterOpened: { column: FilterColumn, drawn: Schema.OptionFromNullOr(ColumnFilter) },
FilterTyped: { field: Schema.Literals(['text', 'min', 'max', 'from', 'to']), text: Schema.String },
FilterOptionToggled: { option: Schema.String },
FilterChecked: { state: Schema.Literals(['any', 'true', 'false']) },
FilterCleared: {},
FilterClosed: {},
```

**`update`:**

- `FilterOpened`:
  - It seeds the form and `reported` from `drawn`.
  - It focuses the header, so closing returns there.
  - It closes the menu and any edit, as `MenuOpened` does.
  - It refuses (returns the Model it was given) a column that does not
    filter or is hidden, and a `drawn` that the column's schema refuses.
- `FilterTyped`, `FilterOptionToggled` and `FilterChecked` each change one
  field of the open form.
  - A field another kind owns is refused, and so is an option the column
    does not offer.
  - When the form reads as a valid filter (or none) that differs from
    `reported` (`Equal.equals`), the update reports
    `Out.Filtered` and sets `reported` to it.
  - Comparing with `reported`, not with the form's previous reading, matters
    when the form passes through an invalid state. Take min `1` (reported),
    then `1x` (invalid, not reported), then empty: that is none against a
    reported `1`, so it is reported. A comparison with the previous reading
    would see none twice and leave the rows filtered by `1`.
- `FilterCleared` empties the form, and reports none if `reported` was a
  filter.
- `FilterClosed` drops the form.
- These drop `filtering` too: `MenuOpened`, `Focused`, `CellPressed`,
  `EditStarted`, `FillStarted`, and `ColumnHidden` of its column.
- While the form is open, `Pasted`, `FillRequested`, `UndoRequested` and
  `RedoRequested` are refused, as `UndoRequested` already is during an edit.
  Ctrl+X in a filter field otherwise fires the root's `OnCutText`
  (`view.ts`, `clipboard`), which sends `Pasted` with the focused cells
  cleared, losing data.

### 4.4 The view

The view input gains `filters`, required by the input's type when a column
filters and refused when none does:

```ts
type FiltersInput<Specs> = [FilterableId<Specs>] extends [never]
  ? { readonly filters?: never }
  : { readonly filters: Filters<Specs> }

Registry(
  {
    state: model.grid,
    rows: rowsOf(model),
    wrap: wrapGrid,
    label: 'Products',
    rowHeight: 32,
    headerHeight: 36,
    filters: model.filters,
  },
  h,
)
```

**Each filterable header** draws a `filterButton`:

- `aria-haspopup="dialog"`, `aria-expanded`, and an `aria-label` such as
  "Filter Price";
- out of the tab order, like the sort and menu buttons.

While its column is filtered, the header and the button carry
`data-filtered="true"`, and the header carries an `aria-description`
("Filtered"). The header is what the grid's `aria-activedescendant` names,
so a screen reader hears it. The header also gets
`aria-keyshortcuts="Alt+ArrowDown"`.

**The header's accessible name.** A header's name comes from its content
today, which already includes the menu button's label. With the form drawn
inside the header cell, the form's labels would join it too. Each header is
therefore labelled by its own text (`aria-labelledby` its label), which the
build checks in Chrome's accessibility tree, as the checkbox test does.

**The open form** is a `filter` Slot: a non-modal `role="dialog"` named
"Filter Price", with `tabindex="-1"`, inside the header cell. The tabindex
matters because Safari does not focus a clicked checkbox, so a press on one
would otherwise move focus out of the form and close it. It holds native
controls:

| Kind | Controls |
| --- | --- |
| Text | one `input`, "Contains" |
| Number | two `input inputmode="decimal"`, "At least" and "At most" |
| Choice | a `role="group"` of native checkboxes, one per literal |
| Checkbox | a `role="radiogroup"` of native radios: Any, Checked, Unchecked |
| Date | two `input type="date"`, "From" and "To" |

While a filter holds, the form also has a `filterClear` button.

- **Invalid or crossed bounds.** A bound that is not a number is
  `aria-invalid` and described by "Not a number". Crossed bounds are
  reported, and the upper field is `aria-invalid` and described by "Above
  the upper bound", so a person sees why no row shows (§6).
- **Words.** Every word is in `words.filters`.
- **Slots.** The new Slots are `filterButton`, `filter`, `filterField`,
  `filterOption`, `filterError` and `filterClear`, so no markup is drawn
  outside a Slot.
- **Look.** `GridStyle` gives the form the menu's stacking (`zIndex: 4`, the
  menu's surface and border) and starts it at the header's start edge. Like
  the menu, it is clipped by the root's `overflow: auto` in a grid too short
  to hold it (§8).

## 5. Wiring it

**Held rows** (`examples/data-grid`):

- store the value;
- build the predicate once per value;
- filter before building the row model, memoized by the products' and the
  filters' identity. Filtering 100,000 rows on every render would also miss
  the projection's cache, which is keyed by the row model.

```ts
// onOut
Filtered: filtered => ({
  model: modifyFields(model, { filters: filters => Grid.setFilter(filters, filtered) }),
}),

const keep = Grid.keeps(model.filters, {
  description: p => p.description,
  status: p => p.status,
  price: p => p.price, // a number: `p => p.price.toFixed(2)` does not compile
  stocked: p => p.stocked,
})
```

**Remote** (`examples/registry`): each filter becomes a field of the
query's input, and the body filters only what is given. Everything the
query has today stays:

```ts
export const FilteredProducts = Query.define(
  'FilteredProducts',
  {
    sort: ProductSort.Schema,
    search: Schema.String,
    // Contains: '' is everything (Expr.contains), so the input is text, not null.
    line: Schema.String,
    // OneOf: at most every status, each once.
    statuses: Schema.NullOr(Schema.Array(Status).check(Schema.isMaxLength(3))),
    minCents: Schema.NullOr(Schema.Int),
    maxCents: Schema.NullOr(Schema.Int),
  },
  ({ input }) =>
    Query.from(Registry.Product).pipe(
      Query.where(
        Expr.contains(fields.description, input.search),
        Expr.contains(fields.line, input.line),
        Expr.whenGiven(input.statuses, statuses => Expr.in(fields.status, statuses)),
        Expr.whenGiven(input.minCents, min => Expr.gte(fields.cents, min)),
        Expr.whenGiven(input.maxCents, max => Expr.lte(fields.cents, max)),
      ),
      Query.orderBy(
        Order.chosen(input.sort, {
          upc: fields.upc,
          description: fields.description,
          line: fields.line,
          status: fields.status,
          cents: fields.cents,
        }),
      ),
    ),
)
```

- **The query's input.** The page's `input` maps `model.filters` onto these
  fields. Prices are typed in dollars, so a bound becomes
  `Math.round(bound * 100)`.
- **Dates.** A `Between` maps the same way, onto `Expr.gte` and `Expr.lte`
  over a date field stored as ISO text with `Collation.binary`, as
  `Expr.lt`'s documentation says. The registry has no date column.
- **Caching.** A Remote list is keyed by its input, so each filter is a list
  of its own, cached, and refetching it is recovery.

## 6. Keyboard and ARIA

- **Opening.** Alt+ArrowDown on the focused header of a filterable column
  opens its filter. With `columnMenu`, Shift+F10 and the menu key open the
  menu, and Alt+ArrowDown opens it on a column that does not filter. The
  `columnMenu` documentation (`view.ts`, `GridInput.columnMenu`) changes to
  say this.
- **Focus.** The form's first control takes focus through `HoldFocus`: the
  text, the minimum, the first option, the checked radio, or From.
  `HoldFocus`'s unguarded `setSelectionRange` throws on date, checkbox and
  radio inputs. It is being fixed separately; this work depends on that fix.
- **Moving and closing.**
  - Tab moves through the controls natively.
  - Focus leaving the header cell closes the form. The leave is on the
    header, not the form, so a press on the filter button while the form is
    open stays inside and toggles it.
  - Escape in the form closes it. Focus returns to the grid with its header
    focused.
- **Keys typed before the field has focus.** Keys between Alt+ArrowDown and
  the field mounting reach the grid's root, on the header. Printable keys
  there do nothing, so they are dropped, not carried into the field. Escape
  at the root while the form is open closes it, as Escape cancels a drag.
  Carrying typed keys, as `EditTyped` does for a cell, is left out (§8).
- **Applying.** A filter applies as it is typed. There is no Apply button,
  so a filter is never typed and left unapplied.
- **Clipboard.** While the form is open, the clipboard box is none
  (`view.ts`, `clipboardBox`), as during an edit, so copy, cut and paste in
  its fields are the fields' own. The update's refusals (§4.3) cover a
  Message that arrives anyway.
- **Presses.** A press inside the form belongs to the form.
  `HeaderPress` ignores `[role="dialog"]` beside `[role="menu"]`
  (`headerPress.ts`).

## 7. Failure semantics

- **A bound that is not a number** (`1e`, `abc`): the form keeps the text,
  the field says "Not a number", and nothing is reported. The rows stay
  filtered by `reported`, the last filter that held. Fixing or clearing the
  text is compared with `reported` and reported.
- **Crossed bounds** (`min > max`, `from > to`) are reported as they are,
  match nothing, and are marked on the form. Refusing them would leave the
  rows filtered by a stale range while the form shows the new one.
- **A stored value the column does not accept** has the wrong variant, is
  empty, holds an option the column lacks, or holds a bound that is not
  finite. `Grid.Filters` refuses it on decode. A hand-built one does not
  compile against `Filters<Specs>`. A cast one is refused by `FilterOpened`,
  so the form does not open.
- **A Remote read that fails** for a filter is the list's failure, shown as
  any failed read is (`GridCrud.status`). The filter stays, and Retry asks
  for the same input.
- **A stale form.** The form is seeded when it opens. An application that
  changes a filter while its form may be open, from a URL or from history,
  sends `FilterClosed` through the grid's wrapper first. Otherwise the
  form's next report is judged against the old `reported` and overwrites the
  change, as an edit's commit is judged from the text it began from. No
  example does this: a press anywhere else closes the form.
- **A hidden column still filters.** The value is the application's, so
  hiding a column does not clear its filter, and the grid draws no header
  that could say so. The application decides whether hiding clears a
  filter, and should show the filters in force elsewhere when it lets a
  filtered column be hidden.

## 8. Build plan

In small commits, with tests that can fail:

1. **`foldkit-data-grid`:**
   - `ColumnSpec.filter`;
   - `filterKindOf`;
   - the `ColumnFilter` union and the types of §4.2;
   - `filterFor`, `Filters`, `noFilters`, `setFilter` and `keeps`;
   - the Model field, the Messages and `update` of §4.3, including the
     refusals while filtering (`grid.ts`, `Pasted`, `FillRequested`,
     `UndoRequested`, `RedoRequested`).
2. **Tests for step 1:**
   - unit tests of the update and of the decode boundary;
   - `@ts-expect-error` negatives for a wrong variant, a wrong `keeps`
     field, a stale option, and `filters` given to a grid that does not
     filter;
   - a mutation spec.
3. **`foldkit-mixins-data-grid`:**
   - the Slots, the `filters` input, and the header button and form;
   - `clipboardBox` off while filtering;
   - `HeaderPress` ignoring `[role="dialog"]`;
   - the header labelled by its text;
   - `GridStyle` for the new Slots, through `Theme.ref` tokens.
4. **Browser tests** of keyboard, focus and ARIA, checked against Chrome's
   accessibility tree, with a mutation spec.
5. **The examples.** `examples/data-grid` adopts it over held rows, and
   `examples/registry` over the query, if it fits.
6. **Docs:**
   - both package READMEs;
   - `skills/foldkit-plus/references/` for the data grid, with snippets
     compiled in a temporary `*.test-d.ts`;
   - `CHANGELOG.md` under Unreleased `### Added`;
   - the grid design note's leftovers.

## 9. Migration

The change is additive.

- A grid with no `filter` column draws nothing new, and its input type
  refuses `filters`.
- The grid's Model gains `filtering`, none at `init`. A whole grid Model
  stored before this fails to decode, as it did when `menu` and `filling`
  were added. Nothing here stores one: the examples store only the column
  state, which is unchanged.

## 10. Left out

- **Operators beyond these five** (starts with, equals, not, empty, regex).
  Each is one more variant and one more control. `Contains` covers the
  common text case.
- **Conditions other than "and" across columns**, and more than one
  condition per column.
- **A filter row, or a filter panel outside the grid.** The value is the
  application's, so it can draw one and pass the same `filters`.
- **Debouncing a Remote filter as it is typed.** Remote keys a read by its
  input, so each keystroke is a read. An application that wants fewer can
  hold the text and set the input on a timer.
- **Carrying keys typed before the form's field has focus** (§6).
- **A form drawn outside the grid's scroll box** (a portal), so a short grid
  does not clip it. The menu has the same limit, and upstream's portal trap
  (AGENTS.md, "anchor portals by default") argues against it here.
- **Counts per option**, and options read from the data rather than the
  schema.
- **`GridCrud` deriving filters from a list's Query.** The Query's input is
  the application's to declare.

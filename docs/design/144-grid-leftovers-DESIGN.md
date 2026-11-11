# The data grid's last leftovers: HTML clipboard, multi-range copy, fill series (#144)

Status: decided 2026-11-11, nothing built. The three items are the rest of
#144's leftovers ([data-grid-DESIGN.md](./data-grid-DESIGN.md), "Phase 8 as
built so far": "Not built: HTML clipboard data, multi-range copy", and "dates
and custom strategies are not built"). Nobody has asked for any of them, so
this note decides whether each is worth building, and in what shape.

Every signature in §5 is **planned**: none exists, and none was type-checked.
Prior-art claims are marked *checked* (read in source or documentation, with
where) or *recalled* (from memory, not verified).

## 1. Verdicts

| Item | Verdict | Why |
| --- | --- | --- |
| Copy as `text/html` | When an adopter asks, after an upstream builder | Spreadsheets already read today's TSV. HTML only helps when pasting into a document or an email. Foldkit's clipboard builders write `text/plain` alone. |
| Paste `text/html` | Not at all, unless a source that writes no `text/plain` is shown | Every source in §3 writes TSV beside its HTML (Glide checked, Excel and Sheets recalled). Parsing untrusted markup is risk with no gain. |
| Multi-range copy | Not at all for now | The grid has no multi-range selection. Building one collides with Ctrl+click's row toggle, and the copy itself has three incompatible precedents. |
| Date fill series | When an adopter asks; first in line | Small, and contained in `fill.ts`. A Date column's fill text is already an ISO day. |
| Custom fill series | When an adopter asks | One optional column field. It has no design question, only no caller. |

## 2. What exists today

**Clipboard.** `Clipboard` in `packages/data-grid/src/clipboard.ts` is pure
TSV:

- `toTsv` and `parseTsv` (`:24`, `:32`) quote cells that hold tabs, line
  breaks or quotes, as spreadsheets do.
- `copy` (`:78`) writes one `CellBox`.
- `pasteAt` (`:102`) lays a matrix from one anchor.

The view wires it in `packages/mixins-data-grid/src/view.ts:992-1043`. It
uses Foldkit's `h.OnCopyText`, `h.OnCutText` and `h.OnPastePreventDefault`,
and builds the copied text once per projection and box (`:252-263`). Those
three builders in Foldkit 0.170
(`foldkit/dist/html/index.js:581-607`) only ever call
`setData('text/plain', …)` and `getData('text/plain')`. No builder
writes or reads another type, so HTML is not one line away.

In this repository, only `richtext-dom` writes `text/html`
(`packages/richtext-dom/src/events.ts:701-707`). It does so from its own
listeners, and parses pasted HTML with `DOMParser`
(`packages/richtext-dom/src/html.ts:457`).

**Selection.** There is one cell range:

- The Model holds `selection.cells: Option<Range>`
  (`packages/data-grid/src/grid.ts:143`), and `CellRange` in
  `selection.ts:86` is one `{ anchor, focus }`.
- A Shift press grows that range (`grid.ts:468-482`).
- Ctrl or Meta with a press toggles a row when the grid selects rows
  (`grid.ts:499-501`). Otherwise it is a plain press that clears the range
  (`grid.ts:483`).
- `press.ts:79-92` reports the modifier as `toggleKey`.

Nothing can add a second range, so there is nothing to copy as several.

**Fill.**

- `Fill.plan` (`fill.ts:57`) picks one axis.
- `Fill.cells` (`fill.ts:101`) carries each lane on through `Fill.series`
  (`fill.ts:32`). A lane is a column when filling down or up, and a row when
  filling right or left.
- `series` continues two or more numbers a constant step apart
  (`number` at `fill.ts:23`), keeping the most precise one's decimals. It
  repeats anything else, a single number included.
- Each text is the cell's draft (`grid.ts:1401` reads `draftOf`). For a
  column whose schema decodes to a `Date`, the default draft is the local
  calendar day `YYYY-MM-DD` (`grid.ts:1359-1376`), which is what the date
  editor reads (`columns.ts:63`, `view.ts:962`).
- What a fill writes goes through the column's schema, as a paste's cells do
  (`judged`, `grid.ts:639`). A text the column refuses is reported in
  `refused`.

## 3. Prior art

**Clipboard formats.**

- *Recalled:* **Excel** puts `text/plain` (TSV) and `text/html` on the
  clipboard, along with native formats a browser does not see. Its HTML is a
  `<table>` with `mso-` styles. *Checked* (Microsoft support, KB 214080):
  copying non-adjacent ranges works only when they share the same rows or the
  same columns, and they paste as one rectangle. Any other multi-selection is
  refused with "That command cannot be used on multiple selections".
- *Recalled:* **Google Sheets** writes TSV and an HTML table marked
  `google-sheets-html-origin`, and reads HTML tables on paste. I do not
  reliably recall what it does with a multi-range copy.
- *Checked* (ag-grid.com, "Clipboard"): **AG Grid** documents only tab-separated
  text (`clipboardDelimiter`). With `cellSelection`, several ranges are
  copied "stacked vertically in the clipboard", so where they sat is lost.
- *Checked* (`@glideapps/glide-data-grid@6.0.3` source):
  - **Glide** writes both `text/plain` and `text/html`, a `<table>` that
    carries Excel's `mso-data-placement:same-cell` for line breaks
    (`src/data-editor/copy-paste.ts:178`, `data-editor-fns.ts:182-200`).
  - Its copy takes only `gridSelection.current.range`, not its `rangeStack`
    (`data-editor.tsx:3515`). So a multi-rect selection copies one rectangle.
  - On paste it prefers `text/html` (`data-editor.tsx:3375-3403`). It parses
    that HTML by setting `innerHTML` on an element of the live document
    (`copy-paste.ts:236-238`).

**Fill series.**

- *Recalled:* **Excel** copies a single number unless Ctrl is held. It steps
  a single date by one day. From two or more cells it infers a linear step,
  in days, months or years for dates. It also continues text with a trailing
  number ("Item 1") and built-in or user-defined lists (weekdays, months).
- *Recalled:* **Google Sheets** behaves much like Excel for numbers, dates,
  weekdays and months.
- *Checked* (ag-grid.com, "Fill Handle"): **AG Grid** copies a single value,
  and with Alt steps a single number by one. It continues several numbers as
  a linear progression and repeats strings or mixed values. The documentation
  says nothing about dates. A custom series is `cellSelection.handle.setFillValue`:
  a callback per cell, given `FillOperationParams` (`values`,
  `currentIndex`, `direction`, `column`, `rowNode`), that answers through
  `useValue`, `skipCell` or `useDefault`.
- *Checked* (Glide source, `data-editor.tsx:2101-2140`): **Glide** repeats the
  source pattern and infers no series. `onFillPattern` lets an application
  cancel the fill and do its own.

Today's grid sits between AG Grid and Glide, and needs no change to match
them.

## 4. Ownership

The application owns every value: the grid holds no rows. This note changes
none of that.

- **Clipboard text.** Copied text is drawn from `Columns.textOf` and the
  cell's value, as today. Pasted text is a matrix of strings that `pasteAt`
  lays and the columns' schemas judge (`Out.Pasted { accepted, refused }`).
- **Fill series.** A series yields *texts*, never values. They take the same
  path as a fill's cells today: `Grid.fill` judges them, and the application
  writes what it accepts.
- **Multi-range selection.** It would be grid-owned interaction state, as the
  single range is now.

## 5. Shapes, if built

### 5.1 HTML copy

```ts
// Planned, in clipboard.ts beside toTsv: a <table> of the same matrix.
// Each cell is HTML-escaped (& < > "), and a line break becomes <br>.
// Nothing an application supplies is written as markup.
const toHtml: (rows: ReadonlyArray<ReadonlyArray<string>>) => string
```

**Options considered.**

- **A Mount on the cells' container that writes both types.** Rejected.
  That element already holds the press Mount (`press.ts`), and an element
  holds one Mount. A Mount's arguments are also read once at insert, while
  the copied range changes with every selection.
- **`navigator.clipboard.write` from a Command.** Rejected. It is
  asynchronous, may ask for permission, and runs after the copy event has
  already ended.
- **An upstream Foldkit builder.** Chosen. Propose
  `h.OnCopyData({ 'text/plain': tsv, 'text/html': html })` and its cut twin,
  each setting every type while the event runs.

Until that builder exists, this item waits.

**Failure semantics.** The HTML is built from the same matrix as the TSV, so
a cell cannot appear in one and not the other. A target that ignores HTML
reads the TSV.

### 5.2 HTML paste (recommended against)

If a source that writes only `text/html` is ever shown, the rules are these:

- Read HTML only when `text/plain` is empty.
- Parse with `DOMParser.parseFromString(html, 'text/html')`, never with
  `innerHTML` on an element of the live document. Glide does the latter. An
  element made by the page's document can load an `<img>` and run its
  `onerror` while detached, which a `DOMParser` document does not. This is
  *recalled* browser behaviour: a test pasting `<img src=x onerror=…>` must
  prove it before anything is built.
- Read the first `<table>`'s rows and cells as `textContent`, with `<br>` as
  a line break and `colspan` padded with empty cells. Keep no attribute, no
  markup and no link.
- The result is the same string matrix `pasteAt` takes, so the columns'
  schemas still judge every cell, and nothing parsed is ever inserted into
  the page.

It also needs Foldkit's paste builder to hand over more than `text/plain`.

### 5.3 Multi-range copy

This first needs a multi-range selection:

```ts
// Planned: selection.cells as a list, the last range the active one.
cells: ReadonlyArray<CellRange<Id>>
```

That selection has its own problems:

- Ctrl+press already toggles a row (`grid.ts:499`), so adding a range needs
  another gesture or must give up the toggle in grids that select cells.
- Every range operation must define what it does with several ranges: Shift
  growth, cut, Delete, paste and fill.

If it is built, copy follows Excel's rule, the only precedent that keeps
positions:

- Ranges that span the same columns join top to bottom in row order.
- Ranges that span the same rows join side by side.
- Anything else is refused, and the clipboard is left as it was. The view
  draws no copy handler for such a selection, so the refusal is visible as
  "nothing copied". Saying why needs a live region, which the grid does not
  draw today; it would be part of that work.

AG Grid's stacking and Glide's last-range-only were rejected: each copies
something other than what is shown. Cut, paste and fill over several ranges
are refused, as Excel refuses them.

### 5.4 Date series

`Fill.series` keeps its signature. After numbers, it also continues texts
that are all calendar days, `YYYY-MM-DD`:

- **A day step.** Two or more days a constant number of days apart continue
  that step.
- **A month step.** Days on the same day of the month, a constant number of
  months apart, continue by months. Each is counted from the source's day,
  so a 31st clamps to a shorter month and comes back after it: Jan 31,
  Feb 28, Mar 31. This is *recalled* as Excel's month fill.
- **Anything else** repeats, as today. A single day repeats too, as a single
  number does. The behaviour stays uniform, and that is why this departs
  from Excel's +1 day.

The arithmetic is on the calendar date alone (UTC fields of `Date.UTC(y, m,
d)`), so no time zone moves a day. The inference reads text, not the
column, so any column whose drafts are ISO days gets it. The column's schema
still judges each result.

This changes a published function's behaviour. Its build updates the
README's `Fill.series` line, the skill's data-grid reference and the
changelog.

### 5.5 Custom series

```ts
// Planned: an optional field of a column spec.
/** Continues a lane of this column's drafts for `count` cells; none uses Fill.series. */
readonly fill?: (
  source: ReadonlyArray<string>,
  count: number,
  backward: boolean,
) => Option.Option<ReadonlyArray<string>>
```

- **Scope.** It applies only to fills down or up, where a lane is one column.
  A fill right or left crosses columns, so it keeps `Fill.series`.
- **Why one call per lane.** AG Grid calls back once per cell. One call per
  lane gives the function the whole source, which is what series inference
  needs, and returning `Option.none()` defers to the default.
- **Failure semantics.** The returned texts are judged like any fill, and a
  refused text lands in `refused`. Returning a length other than `count` is
  a programming error: `Grid.fill` throws, naming the column, rather than
  padding or cutting quietly.

## 6. What this leaves out

- Formula and reference adjustment.
- Text with a trailing number ("Item 1").
- Built-in weekday or month lists. A custom series can supply them.
- Fill with a modifier that switches between copy and series.
- Formats other than TSV and HTML, and rich styling in copied HTML.

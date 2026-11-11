# The data grid's last leftovers: HTML clipboard, multi-range copy, fill series (#144)

Status: decided 2026-11-11 and revised after review the same day; nothing built. The three items are the rest of
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
| Copy as `text/html` | When an adopter asks | Spreadsheets already read today's TSV. HTML only helps when pasting into a document or an email. Foldkit's builders write `text/plain` alone, but a second listener in the same copy event can add the HTML (probed in Chromium, §5.1). |
| Paste `text/html` | Not at all, unless a source that writes no `text/plain` is shown | Every source in §3 that writes HTML also writes TSV beside it: checked for Glide, recalled for Excel and Sheets. Parsing untrusted markup is risk with no gain. |
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

**Chosen: a second listener in the same dispatch.** The grid already
mounts its own Mount, `CellPress` (`press.ts:55`), on the cells' container
inside the grid. When it starts, it can also add `copy` and `cut` listeners
to the grid root. The view's `OnCopyText` and `OnCutText` sit on that root
(`view.ts:1723`), and the root is the copy event's target, since it holds
focus.

The new listener does nothing unless `event.defaultPrevented`, which means
`OnCopyText` handled the event and a field's own copy is left alone. It then
reads the TSV back with `clipboardData.getData('text/plain')` and adds
`setData('text/html', Clipboard.toHtml(Clipboard.parseTsv(tsv)))`. Its
arguments never go stale, because the text comes from the event and not from
the Mount. The HTML is derived from the TSV, so the two cannot disagree.

The listener must go on the root (or the document), not on the container
`CellPress` is drawn on. A copy aimed at the focused root never reaches a
descendant.

**Probed** on 2026-11-11 in Chromium (headless shell 1243, through
Playwright, keyboard Ctrl+C on a focused `role="grid"` root; a scratch
script, since deleted):

- A second `copy` listener on the root ran after the first, which had set
  `text/plain` and called `preventDefault`. Its `getData('text/plain')`
  returned the TSV. Its `setData('text/html', …)` took effect, and `types`
  read `["text/plain","text/html"]`.
- A listener on the `document` saw both types.
- A listener on a descendant of the root never ran.
- A following Ctrl+V into a textarea read both the TSV and the HTML.

Firefox and WebKit were not probed. That is the first step of the build,
together with whether Foldkit's listener on the root is registered before a
Mount's, which a `document` listener would make irrelevant.

**Options rejected.**

- **`navigator.clipboard.write` from a Command.** It is asynchronous, may
  ask for permission, and runs after the copy event has ended.
- **An upstream Foldkit builder,**
  `h.OnCopyData({ 'text/plain': tsv, 'text/html': html })` with a cut twin.
  It would be tidier, but it is not a prerequisite. If upstream adds one, the
  listener above goes.

So this item waits for an adopter, not for upstream.

**Failure semantics.** A target that ignores HTML reads the TSV. If the
listener does not run, for instance in a browser where the order differs,
the copy is today's: TSV alone.

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
- Anything else is refused. The view draws no copy handler for such a
  selection, so the browser does its default copy: whatever page text is
  selected, usually nothing in a grid, which leaves the clipboard as it was.
  To refuse explicitly, the view would draw a handler that prevents the
  default and writes nothing. Saying why needs a live region, which the grid
  does not draw today; it would be part of that work.

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
- **Both fit, month wins.** Sources that fit a day step and a month step
  (Feb 1, Mar 1 in a common year: 28 days, one month) continue by months.
- **Already clamped.** Sources that are not on one day of the month
  (Jan 31, Feb 28) are not a month step. They continue by their day step:
  28 days, so Mar 28.
- **Anything else** repeats, as today. A single day repeats too, as a single
  number does. The behaviour stays uniform, and that is why this departs
  from Excel's +1 day.

**Not a day.** A text matching the pattern but naming no real day
(`2024-02-30`) is not a day, so its lane repeats. The check runs before
`Date.UTC`, which would silently normalize that text to March 1.

The arithmetic is on the calendar date alone (UTC fields of `Date.UTC(y, m,
d)`), so no time zone moves a day. The column's schema still judges each
result.

**A behaviour change, for the changelog.** The inference reads text, not the
column. A plain text column whose cells look like ISO days (a SKU column
holding `2026-01-05` and `2026-01-06`, say) would step where it repeats
today. This changes a published function, `Fill.series`. Its build updates
the README's `Fill.series` line, the skill's data-grid reference and the
changelog's entry, and it runs the Jev review.

### 5.5 Custom series

```ts
// Planned: in ColumnEdit, beside `draft`, since only an editable column fills.
export interface FillLane {
  /** The source's drafts in this column, top to bottom. */
  readonly source: ReadonlyArray<string>
  /** How many cells the fill writes beyond the source. */
  readonly count: number
  readonly toward: 'down' | 'up'
}

/**
 * The texts a fill writes in this column, the first next to the source;
 * none uses `Fill.series`.
 */
readonly fill?: (lane: FillLane) => Option.Option<ReadonlyArray<string>>
```

- **Scope.** It applies only to fills down or up, where a lane is one column.
  A fill right or left crosses columns, so it keeps `Fill.series`.
- **Why one call per lane.** AG Grid calls back once per cell. One call per
  lane gives the function the whole source, which is what series inference
  needs, and returning `Option.none()` defers to the default.
- **Failure semantics.**
  - `Grid.fill` runs in the application's `update`, so nothing here throws.
  - The returned texts are judged like any fill, and a text the schema
    refuses lands in `refused`.
  - Of a longer answer, the first `count` texts are taken.
  - A shorter answer leaves the cells past its end refused, each with an
    empty `text` and the error "The column's series gave no text here", in
    the existing `refused` list. The fault is visible per cell; it is neither
    a crash nor a silent repeat.

## 6. What this leaves out

- Formula and reference adjustment.
- Text with a trailing number ("Item 1").
- Built-in weekday or month lists. A custom series can supply them.
- Fill with a modifier that switches between copy and series.
- Formats other than TSV and HTML, and rich styling in copied HTML.

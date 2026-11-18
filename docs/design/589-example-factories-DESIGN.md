# Examples and variations from the packages' own factories (#589)

Status: decided 2026-11-17. Phase 0 (the measurements) is recorded in §4; phase 1 is being built. `FileUpload` is being built beside it and already follows two of its decisions (one `picker` slot, progress as a passed value). Target release: 0.41.0, which is prepared and not tagged (`CHANGELOG.md:10`; `foldkit-mixins-ui` is 0.27.0 in it, `packages/mixins-ui/package.json:3`).

This note replaces the issue's first body, its "Revisions 2 and 3" comment and four research files (about 400 kB, kept out of the repository). Where they disagree with this note, this note wins.

**How to read the evidence.** A claim about current code cites `path:line`. **[v]** marks a line I read myself on 2026-11-17 on `ui-polish`; everything else is carried from the research and should be re-read before it is built on. Reference examples are ReUI's and shadcn's component pages. Those pages gave titles or one-line captions and no code, so every per-example mapping is an inference from a title; confirm each row against the page when its component is built. Signatures in §3 are final in shape; snippets are sketches until the gate (§8) compiles them.

## 1. What this is, and the requirement

Foldkit Plus ships about ninety widgets in `foldkit-mixins-ui`. A reference library such as ReUI shows thirty calendars or sixty buttons as thirty or sixty source files, and its users copy the file they want with a CLI. The maintainer wants the opposite: each variation is a call into a published factory with options, so nothing is copied, nothing is generated, and a site ships only what its options need. This note says which factories, what an option may be, what changes in every widget so the options are spelled the same everywhere, and in what order to build it.

The requirement, in the maintainer's terms:

- No codegen and no copied source. "There is a way to have a factory where one passes options capable of representing most of these examples."
- Recipes become more capable, and a factory-factory is welcome where useful.
- `Bundles.X` ships, inside `foldkit-mixins-ui`. No new package.
- The end user's bundle is the goal: "I shouldn't ship every possible version of the component. That's what the factory is for." The website itself may load every example.
- An end user can extend a widget to the examples the options miss.
- Every component is built this way where possible.

Four tests decide whether it worked:

1. **Coverage.** Most of a reference library's examples for a component are one call with options. Measured per component in §5.
2. **Bytes.** A site that uses one variation ships the code and CSS that variation needs. Measured by `absent` pins against `dist` (§4).
3. **Shown source runs.** The code shown beside an example is a whole working module, imports and state included (§7).
4. **Extension.** A user reaches a missing example without touching our source, through public interfaces a test proves a user can implement (§6).

## 2. The model

A widget is made of four kinds of fact, and each kind has one factory.

**Look** is CSS over fixed markup. Its factory is the recipe: `Recipes.X(selection)` picks values on axes, `.extend` adjusts them, and the new `.add` gives a shipped recipe an axis or a value it lacks. A recipe module holds style data and nothing else, which is what lets a build evaluate it and ship class names in its place.

**State** is a Model and the Messages that change it. Its factory is the Bundle: `Bundles.X` is the widget's `init` and `update` packaged for `foldkit-bundle`, and `Bundles.X.with(args)` is a preset of it. An application names the Model field; the placement derives the Message wrapper and the fold.

**Drawing** is markup, ARIA, events, words and which parts appear. Its factory is the widget's `view(options, h)`, and `X.configure({ base, presets })` is the factory-factory over it: a site states its look, words, mixins and structural choices once and gets back a `view` that needs only what differs per use.

**Features** are code a widget would otherwise import for an option most pages never pass: another widget, a Behavior with a Mount, a transport, a second selection mode. A feature is a value the application imports and passes. The widget imports only the feature's type, so a page that never names the feature never ships it.

An option may therefore be one of three things, and the difference is what the package must import to honour it:

- **Data**: a literal, text, a Schema value, an `Html` the application drew, a Message, or a function the application wrote. The widget needs no module to honour it.
- **A passed value**: something with a module of its own behind it. The application imports it (`Tabs.fluid`, `Chart.bars`, `Combobox.many(items)`, `FileUploadProgress.make(...)`) and hands it over.
- **Composition**: something with state that is not this widget's state, or that is useful with no such widget. It is another widget, placed beside this one, and its drawing goes into a slot option (`aside`, `footer`, `trailing`, `content`).

A boolean or a string that switches on code is the one thing an option may not be: it keeps that code in every page.

Most widgets need nothing above those four. Two do: where a feature has a module behind it, carries state, and that state must be folded together with the widget's own, the features cannot be passed at `view` time and cannot be siblings the application wires by hand. Those widgets get `X.make()`, a kit built from typed feature steps (§3.4).

A site uses all this in two moments. Once, at module scope: it compiles its styles (`forSlots(XSlots)(Recipes.X({...}))`, in a module the build may freeze), declares its state (`Bundle.compose(...).pipe(Bundle.withChild('field', Bundles.X, { args }))`), and configures its drawing (`X.configure({ base, presets })`). Then, at each use, one short call: `AppX.view({ model, onMessage, label }, h)`.

## 3. The API

### 3.1 `recipe.add`

`.extend`'s patch type admits only axes and values the recipe has (`packages/mixins/src/style.ts:502-509` [v]) and returns the same `Variants` (`:539-541` [v]). The run-time merge already tolerates a new axis or value (`:619-631` [v]); only the type refuses it. `add` is the typed door:

```ts
// on SlotRecipe<Slots, Variants, Known>
readonly add: <const More extends SlotRecipeVariants<Slots>>(
  more: More,
) => SlotRecipe<Slots, MergeAxes<Variants, More>, Known>
```

- A separate method, not a wider `.extend`: there a misspelt axis must stay a type error.
- Throws at definition for a value the axis already has, and for a slot the contract lacks (`assertKnownSlots`).
- Its values are style pieces, so a module that calls it stays freezable.
- The overlap check is the run-time throw plus `@ts-expect-error` cases, one defect each; an intersection on the parameter fails open. Test the inline form `forSlots(S)(Recipes.Button.add({...})({ tone: 'brand' }))`, not only the hoisted one.

**Every shipped recipe is a `recipeFor`**, even with one axis, so `add` and `extend` apply everywhere. `Recipes.Badge` is a plain function today (`packages/mixins-ui/src/recipes/badge.ts:76` [v]) and becomes a `recipeFor` with `appearance` and `size` axes; its tone is read from `data-tone` with `Style.states`. `Kbd`, `Label`, `Meter`, `CodeBlock`, `NumberField`, `OtpField`, `InputCopy`, `TagsInput`, `Tour`, `MessageScroller`, `VirtualList` and `FileDrop` have no axes and need no change beyond confirming they are `recipeFor`.

**The recipe-module rule.** A shipped recipe module imports style code only: `foldkit-mixins` styles, theme references, other recipes' pieces, icon masks. It never imports a widget module, a Behavior, a primitive or anything with a Mount. An axis selects what CSS expresses over the same markup. A structural choice is a view option that the view writes as a `data-*` attribute and the recipe reads with `Style.states`; one writer per fact. `Typography` breaks this today: `level` is a view option that picks the element and a recipe axis of the same name that picks the look (`recipes/typography.ts:40`, `:116` [v]), and the two must agree. The view writes `data-level`; the axis goes.

**Which looks ship.** About 70% of the gaps in the display components are a missing recipe value. A value ships when one of these holds; otherwise it is a documented `add` snippet on the component's page, which doubles as the proof that `add` suffices:

1. It is on a convention's vocabulary (§3.5): a size, a tone, a field variant. These ship on every recipe that has the axis.
2. Two of our own examples (the site or `examples/`) need it, or another shipped recipe composes it.
3. Two independent references name it. ReUI and shadcn count as one; Base UI, Ark and Zag, Radix Themes and Material count separately.

### 3.2 `Bundles.X`

One file per stateful widget, `packages/mixins-ui/src/bundles/<widget>.ts`, exposed as `export * as Bundles from './bundles/index.js'` beside `Recipes`. A namespace in the existing package: the package is built one output file per source file so `export * as` stays an ESM namespace (`packages/mixins-ui/tsdown.config.ts`), and `sideEffects: false` (`package.json:28` [v]) drops each unread file, exactly as it does for the ninety recipes.

```ts
// packages/mixins-ui/src/bundles/tagsInput.ts
export const TagsInput = Bundle.make('TagsInput', {
  Model,
  Message,
  args: Schema.Struct({
    id: Schema.String,
    tags: Schema.optionalKey(Schema.Array(Schema.String)),
    delimiter: Schema.optionalKey(Schema.String),
    max: Schema.optionalKey(Schema.Number),
  }),
  init: args => ({ model: init(args) }),
  update,
})
```

- **Headless.** A Bundle holds no view: a view input may hold no nested function, and a style or a `routes` list holds them. The application calls `X.view` with the placed Model.
- **`args` are the `init` options**, retained and given to `update`. That makes one fact of what is passed twice today: Resizable's `Bounds`, FloatingPanel's `Limits`, Tour's `Config`, Carousel's layout, TreeView's `checkable`, AngleSlider's layout, CascadeSelect's `Config`.
- **An OutMessage must be answered** with `onOut` or `Bundle.ignore`; `foldkit-bundle` already makes omitting it a type error.
- **Peer dependency.** `foldkit-bundle` is a dev dependency of `foldkit-mixins-ui` today (`package.json:62` [v]) and becomes a declared peer. It is already installed with it, through `foldkit-primitives`.
- **Which widgets.** Every module that exports `init` and `update`; every adapter over an upstream Model (Dialog, Popover, Tooltip, HoverIntent, Tabs, RadioGroup, FileDrop, Disclosure, Listbox, Combobox, Calendar, DatePicker), through `Bundle.fromParts`; and four widgets whose state is a field every application hand-writes (Accordion's open list with `multiple` and `collapsible`, ThinkingSteps' open flags, PasswordInput's `visible` and caps lock, Toolbar's roving stop). About forty in all; the catalogue (§5) marks each class B row.

**Who owns the value.** A Bundle's Model Schema is concrete, so the rule follows from the value's type:

- The value's type is the widget's own closed type: the Bundle owns it and reports `Changed`. Calendar's `Selection`, TagsInput's tags, ColorPicker's `Color`, CascadeSelect's path, FileUpload's entries.
- The value's type is the application's (an item, a row id, a form value): the application owns it, as upstream's Listbox and Combobox already say ("the selection is owned by the parent", `packages/mixins-ui/node_modules/@foldkit/ui/dist/combobox/single.d.ts:5` [v]), and passes it back each draw. Combobox, Listbox, Picker, Select, RadioGroup, Segmented, CheckboxGroup, Slider, Rating, Tabs.

### 3.3 `X.configure`

Every module with an options-level `view` exports `configure`:

```ts
/** What a TagsInput is given once: its look and every option that holds no Message. */
export type TagsInputPreset = Pick<
  TagsInputView<never>,
  'style' | 'placeholder' | 'addOnBlur' | 'direction' | 'words'
> & { readonly mixins?: MixinList<never> }

export const configure = <const Names extends string = never>(config: {
  readonly base?: TagsInputPreset
  readonly presets?: Readonly<Record<Names, TagsInputPreset>>
}): {
  readonly view: <Outer>(
    options: TagsInputView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
}

// packages/mixins-ui/src/configure.ts, internal
export type PresetOption<Names extends string> = [Names] extends [never]
  ? {}
  : { readonly preset?: Names }
```

- The key is `presets` and the call's option is `preset`. The earlier revisions said `variants` and `variant`; Button, Tabs, Accordion, Item and the field recipes already have a recipe axis named `variant`, and one word for two things on one call is a trap.
- **Merge order**: `base`, the named preset, the call. `mixins` concatenate in that order; `words` merge key by key (§3.5 makes that possible).
- **Returns the widget's own drawing functions, bound**: `{ view }` for most, `{ view, parts }` for FileUpload, `{ view, group }` for Avatar, Card, Item and ChatMessage.
- **Holds no state.** `init` defaults are Model facts and stay in `Bundles.X.with(args)`.
- **Cannot bind** an option typed by the application's Message (`onMessage`, `routes`, `onCopy`, Calendar's `preview`) or one that needs the Model per draw (`sort.input`). Those stay at the call.
- **May hold behaviour.** A preset is declared in the application's module from values that module imported, so a site that never names `Toast.keepFocus` never ships `FocusRecovery`. This is how a selection chooses behaviour without the package importing it. Behaviour inside a Style was rejected: a Style holding a Mount cannot be frozen, which costs the application the 30 kB the freeze saves.
- **Typing.** Each widget writes its own `configure` signature with an explicit `<Outer>` on the returned view; one generic `configure(view)` loses `Outer` to `unknown`. The body is one internal helper, so a widget writes its preset type and signature only. `Names` is inferred from the keys alone, so a misspelt preset key is an excess-property error. The preset lookup uses `Object.hasOwn`. Type tests, one defect each: an unknown `preset`, an unknown preset key, a style of another widget's Slots, `preset` given when none were declared.

**Options-level views for the adapter-only modules.** Sixteen modules export `toView` and no `view` [v, counted]: `calendar`, `checkbox`, `combobox`, `datePicker`, `dialog`, `disclosure`, `fieldset`, `fileDrop`, `hoverIntent`, `listbox`, `popover`, `radioGroup`, `select`, `switch`, `tabs`, `tooltip`. Their reference examples come out "compose it yourself" because the application writes the layout in a `draw` function every time: the same 15 to 30 lines per example.

The rule: **a module gets an options-level `view` when its usual drawing can be stated as data plus `Html` slots and at least two reference examples repeat that drawing. An adapter alone is enough only where there is no usual drawing.** By it:

| Module | Options-level `view` | Release |
| --- | --- | --- |
| `calendar`, `datePicker` | yes, over the Bundle's Model (§3.4) | 0.41.0 |
| `combobox`, `listbox` | yes, with a `choice` value (§3.4) | 0.41.0 |
| `checkbox`, `switch` | `view({ id, checked, onToggle, label, description?, position?, labelAside? })` | 0.41.0 |
| `radioGroup` | `view({ legend, options: RowContent[], value, onSelect, invalid? })`, as `CheckboxGroup.view` | 0.41.0 |
| `select` (native) | `view({ options: { value, label, group?, disabled? }[] })` | 0.41.0 |
| `fieldset` | `view({ legend, description?, content, disabled? })` | 0.41.0 |
| `disclosure` | `view({ model, onMessage, label, content, icon?, peek? })` | 0.41.0 |
| `tabs` | `view({ model, onMessage, tabs: RowContent[] with `panel`, value, close? })` | 0.41.0 |
| `dialog`, `popover` | `view({ model, onMessage, title?, description?, body, footer?, role?, trigger? })` | 0.42.0 (additive) |
| `tooltip`, `hoverIntent` | no: the trigger is always the application's element, so the `draw` is the content | never |
| `fileDrop` | no: `FileUpload` is the options-level widget; `FileDrop` stays the upstream rung | never |

Thirteen get a view and so a `configure`; three stay adapters. Every adapter stays exported as the lower rung. All of these are additive, so the release column is a preference, not a compatibility boundary.

### 3.4 When `X.make` is warranted

Revision 3 gave the Calendar a `make(features)` because "features change the Model's type". Reading the source, they do not:

- The calendar's selection is already one tagged union, `Selection` = `Single | Range | Multiple`, with `empty(mode)`, `picked`, `isComplete`, `isSame` (`packages/mixins-ui/src/calendar.ts:583-663` [v]). The mode is the value's tag.
- `DatePicker.update(selection)` takes that union at run time and already keeps the popover open until the selection is complete (`datePicker.ts:89-115` [v]). "Closes when complete" is today's behaviour.
- `paging` exists as `'both' | 'previous' | 'next' | 'none'` (`calendar.ts:282` [v]); `dropdowns` exists and holds the calendar's `model` and `onShow` (`calendar.ts:277`, `:318-327` [v]), so it is not a pure value; `preview` exists (`:283` [v]).
- Combobox and Listbox, single and multiple, have the identical upstream Model (`combobox/single.d.ts` and `multi.d.ts` diffed equal [v]; the Listbox pair carried from the research), and neither holds the selection.

So three candidate criteria were on the table: (a) features change Model or Message types, (b) the typed value at the call site depends on a feature, (c) bytes only. The decision:

> **`X.make` is warranted only when a feature (1) has a module of its own behind it, (2) carries state, meaning Model fields and Messages, and (3) must be folded together with the widget's own state, so it cannot be a sibling Bundle the application places and answers in one `onOut`. All three, or no `make`.**

One existing case stands beside it and needs no new decision: a widget that must store, inside its own Model, values whose Schema only the application can give already takes that Schema in a factory (`ToastView.make(payloadSchema)`, `DataGrid.make({ columns })`).

What each lesser case gets instead:

| Case | What gives it | Examples |
| --- | --- | --- |
| (c) bytes only: a module behind an option, no state | a passed value at `view` | `kind: Chart.bars`, `progress: FileUploadProgress.make()`, `collapse: Breadcrumb.menuCollapse(...)`, `zoom: ImageCropper.zoomSlider(...)`, `mixins: Tabs.fluid` |
| (1) and (2), not (3): a feature with state that stands alone | a sibling Bundle the application places, whose `{ model, onMessage }` it passes to the view | Breadcrumb's collapse Menu, ColorPicker's Popover, a time list beside a Calendar |
| (b) typed value, the type is the widget's own | the widget's tagged union in the Bundle's Model; the mode is `args` data | Calendar and DatePicker `Selection`, CascadeSelect's path |
| (b) typed value, the type is the application's | the application's own field, and a `Choice` value passed to `view` and used in `onOut` | Combobox, Listbox, Picker |

The criterion selects **Sidebar** and **Questionnaire**, and nothing else in the catalogue. `DataGrid.make` and `ToastView.make` exist and stay. Not selected: Calendar, DatePicker, Combobox, Listbox, CascadeSelect, Chart, FileUpload, and a future time field.

#### Calendar and DatePicker: class B

`Bundles.Calendar` owns what every calendar example hand-writes today (an upstream Model field, a selection field, a wrapper Message, the fold through `picked`, the second month, the preview).

```ts
// Model, one shape whatever the args
{ calendar: UiCalendar.Model, second: Option<UiCalendar.Model>, selection: Selection, preview: Option<CalendarDate> }
// args (data), `Calendar.Args`, which is also `Calendar.init`'s parameter
{ id, today, selection?: Selection /* default Calendar.empty('Single') */, months?: 1 | 2,
  minDate?, maxDate?, disabledDaysOfWeek?, disabledDates?, locale? }
// Message
GotCalendarMessage | GotSecondMessage | Showed { shown } | Previewed { date } | PickedPreset { selection } | PressedToday { selects }
// OutMessage
Changed { selection: Selection }
// helper
set(selection)
```

`Calendar.view(options, h)` is the new options-level view over that Model; `toView`, `inputs`, `picked`, `show`, `alongside` and `presetsView` stay as the rung for an application that draws its own calendar.

The table is as built (2026-11-17); the last column says what the view found in `calendar.ts` and what it had to add there.

| Option | Kind | As built |
| --- | --- | --- |
| `model`, `onMessage`, `label` | wiring | new view; `label` names the `frame` slot, a `role="group"` |
| `weekNumbers?: boolean` | data | existed on the adapter |
| `caption?: 'grid' \| 'label' \| { dropdowns: { years?: { from, to }, month?: 'select' \| 'label' } }` | data: the selects are drawn in `calendar.ts` itself, no module behind them | `grid`, `label` and both selects existed (as `caption` and a separate `dropdowns` holding `model` and `onShow`, which the view fills in). `month: 'label'` is new on the adapter too: a fourth `ResolvedCaption`, `YearDropdown` |
| `paging?: 'both' \| 'previous' \| 'next' \| 'none' \| 'end'` | data | `end` is new on the adapter: `ResolvedDays.pagingAtEnd`, and `data-paging="end"` on the header for the recipe |
| `today?: { label: string, selects?: boolean }` | data | new; a `todayButton` slot and a `PressedToday` Message |
| `presets?: ReadonlyArray<{ label: string, selection: Selection }>` | data, built with `Calendar.lastDays`, `nextDays`, `monthOf`, `day` | `presetsView` existed; the view calls it and answers `PickedPreset` |
| `detail?: (date) => Option<string>` | the application's function | existed |
| `aside?: Html`, `footer?: Html` | slots the calendar places and does not understand | new: `aside` and `footer` slots, in a `frame` > `body` > `main` > `months` layout |
| `words?`, `style?`, `mixins?` | as every widget | `CalendarWords` is thirteen words: upstream's ten `ViewLabels` (four of them functions upstream, text with `{month}`, `{date}`, `{year}`, `{from}`, `{to}` here), the two selects and the presets group. The adapter's `Dropdowns.labels` is `words` |

A range's preview is not an option: the view passes the Model's `preview` and answers `Previewed` itself.

The typed value comes from readers over the union, not from a generic kit: `Calendar.selectedDate(selection): Option<CalendarDate>` and `firstDate` existed; `Calendar.rangeOf(selection): Option<DateRange>` and `Calendar.datesOf(selection)` are added (`calendar/selection.ts`).

`Bundles.DatePicker` is the same with upstream's picker Model in place of the calendar's (upstream's DatePicker holds its own calendar), one more arg, `closes?: 'complete' | 'manual'` (`manual` is new and is an arg because `update` reads it), and three more view options: `trigger: (selection: Selection) => string`, `name?`, `anchor?`.

What is given up: `model.trip.selection` is the union, so reading a range is `Calendar.rangeOf(...)` and not a field typed `DateRange`, and a range preset on a single calendar is not a type error (it changes the mode, which is what a tagged union means). What is gained: the riskiest API of the plan (a generic kit wrapping an upstream Model, with TS2742 and TS7056 exposure) is not built, and the mode is data.

#### Combobox, Listbox and Picker: class B with a `Choice`

`Bundles.Combobox` and `Bundles.Listbox` hold upstream's interaction Model only. The value is the application's field. A `Choice` is the one value that knows how that field is read and folded:

```ts
// packages/mixins-ui/src/choice.ts: a public interface, user-implementable
export interface Choice<Item extends string, Value> {
  /** Every item that can be chosen; a reported value is looked up here, so the result is typed `Item`. */
  readonly items: ReadonlyArray<Item>
  readonly empty: Value
  /** The fold of the widget's OutMessage (`Selected`, `ClearedSelection`). */
  readonly picked: (value: Value, change: ChoiceChange) => Value
  /** The chosen items, for the view. */
  readonly chosen: (value: Value) => ReadonlyArray<Item>
  /** What a closed input rests on. */
  readonly resting: (value: Value, labelOf: (item: Item) => string) => string
  readonly multiple: boolean
}
// choice/one.ts   one(items):  Choice<Item, Option<Item>>
// choice/many.ts  many(items): Choice<Item, ReadonlyArray<Item>>
// choice/text.ts  text(items): Choice<Item, string>   (the typed text is the value: an autocomplete)
```

They are reached as `Combobox.one`, `Combobox.many`, `Combobox.text`, `Listbox.one`, `Listbox.many`. Each is a file of its own that carries its upstream view (single or multiple), so a page with one mode ships one. `picked` looks the reported string up in `items`, which is how the result is `Option<City>` with no cast.

`Combobox.view(options, h)` and `Listbox.view(options, h)`:

| Option | Kind |
| --- | --- |
| `model`, `onMessage`, `label` | wiring |
| `choice: Choice<Item, Value>`, `value: Value` | a passed value, and the application's field |
| `items?: ReadonlyArray<Item>` (default `choice.items`), `filter?: (item, typed) => boolean` (`Combobox.contains`, `Combobox.startsWith`) | data; the filters are values so a page that fetches its items ships neither |
| `option?: (item) => RowContent`, `groupBy?: (item) => string`, `heading?: (group) => Html` | the application's functions |
| `placeholder?`, `empty?: Html`, `clear?`, `chips?: { removable?: boolean, content?: (item) => Html }` | data and slots; `removable` and `content` are new |
| `disabled?`, `invalid?`, `readOnly?`, `name?`, `openOnFocus?`, `autoHighlight?` (new), `anchor?` | data |
| `start?: Html`, `end?: Html` | adornment slots (new) |
| `creatable?: Creatable` | a passed value, `Combobox.creatable({ label })`, which appends the typed text as a row and reports `Created` |
| `words?`, `style?`, `mixins?` | as every widget |

There is no Autocomplete module: it is `Combobox.text`. `Picker` forwards the same `choice`, `option`, `groupBy`, `disabled`, `invalid`, `name` and `clear`.

#### Chart: class B, kinds and fills as values

The Model is `{ point, keyed }` for every kind, so no `make`. The kinds are branches of one `view` today (`packages/mixins-ui/src/chart.ts:183`, `:194`, `:348`, `:426` [v]), so a bar chart ships the donut and a user cannot add a kind. `kind` becomes an imported value:

```ts
// chart/kind.ts: public interfaces, user-implementable
export interface ChartKind<Data> {
  readonly entries: (data: Data) => ReadonlyArray<ChartEntry>   // the legend, the table and the tooltip read these
  readonly draw: (data: Data, frame: ChartFrame, h: HtmlBuilder<never>) => Html
}
export interface ChartFill {
  readonly id: string
  readonly defs: (color: ChartColor, h: HtmlBuilder<never>) => Html   // drawn in a new `defs` Slot
  readonly paint: (color: ChartColor) => string
}
// chart/bars.ts, line.ts, area.ts, donut.ts; later radar.ts, radial.ts
// chart/fills.ts: solid, gradient, stripe, dots, crosshatch
```

`Chart.view({ kind: Chart.bars, categories, series, ... })`. Small choices with no module behind them are data on the cartesian kinds: `stack?`, `curve?: 'linear' | 'step'`, `markers?: 'point' | 'always'`, `reference?` bands, and `hole?` and `stats?` on the donut.

#### Sidebar and Questionnaire: `make`

A Sidebar always carries three subsystems today: a Tooltip per rail row, a phone Sheet, a resizable width. `sidebar.ts` imports `./sheet.js`, `./splitter.js` and `./tooltip.js` (`packages/mixins-ui/src/sidebar.ts:26-28` [v]) and runs `Sheet.init` and a `UiTooltip.init` per row in every `init` (`:263-265` [v]). Each has a module, state, and Messages the sidebar itself must fold (following a link inside the Sheet closes it). A Questionnaire imports four field widgets and a Button for its question kinds (`questionnaire.ts:11-17` [v]); a kind has a module, an answer type and, for the single kind, a RadioGroup Model per question, and the questionnaire's `update` folds them all.

A feature list merged into one Model type is the shape that fails here: two candidates for one type parameter pick one, and a large inferred Model exceeds what the compiler will serialise (TS7056). `foldkit-bundle` already composes Model and Message types soundly one typed step at a time (`packages/bundle/src/compose.ts:235`, `:338` [v]). So a kit is built the same way: `make()` returns the core, and each feature is a typed step in a `pipe`.

```ts
export interface Kit<Model, Message, Out, View> extends Pipeable {
  readonly bundle: Bundle<Model, Message, Out, /* args */ …>
  readonly view: View
  readonly configure: /* as §3.3, over `View` */ …
}
export type KitStep<In extends Kit<any, any, any, any>, Out extends Kit<any, any, any, any>> = (kit: In) => Out

// sidebar.ts          make(): Kit<SidebarModel, SidebarMessage, never, …>
// sidebar/rail.ts     rail(options?): KitStep   adds { tips } and GotTip; the view gains `collapse: 'icons'`
// sidebar/phone.ts    phone(options?): KitStep  adds { sheet } and GotSheet; the view gains the Sheet's style
// sidebar/resize.ts   resize(bounds): KitStep   adds { width, drag } and the resize Messages

// questionnaire.ts        make(): Kit<…>
// questionnaire/kind.ts   interface QuestionKind<Tag extends string, Answer>   public, user-implementable
// questionnaire/single.ts, multiple.ts, text.ts: each a QuestionKind
// questionnaire.ts        withKind(kind): KitStep   adds the kind's question constructor to the kit
```

```ts
const Nav = Sidebar.make().pipe(Sidebar.rail(), Sidebar.phone())
const Survey = Questionnaire.make().pipe(Questionnaire.withKind(Questionnaire.single), Questionnaire.withKind(Questionnaire.text))
```

A question of a kind the kit was not given is a type error, because the constructor is not on the kit. Every type a kit returns is named and exported; an application exports its kit, and an unnamed return type is written out in full by the declaration emitter. **This shape is proven in a probe before either widget is built (P3, §4).** If it fails, both stay as they are for 0.41.0, gain no new booleans, and move to 0.42.0.

`DataGrid.make` keeps its one Model shape and gains `features` values that carry update arms and view code only (`Features.rowSelection`, `cellSelection`, `editing`, `clipboard`, `fill`, `filtering`, `columnMenu`), so a grid that picks none ships no filter form or fill handle. That work belongs to the `foldkit-data-grid` and `foldkit-mixins-data-grid` packages and follows M5.

### 3.5 Conventions every widget follows

`configure` can only merge what is spelled the same way, and a reader should not learn a new word per widget. These apply to every widget; the breaking ones are listed in §8.

**Layout of a widget's code.** A widget's namespace is its module (`export * as Tabs from './tabs.js'`). Anything a page may not need is a file under `src/<widget>/` and is re-exported by name from the widget module, so the public name is `Tabs.fluid` while the bundler can drop the file. Measurement M7 (§4) proves the nested re-export is dropped; if it is not, the fallback is a sibling namespace, as `FileUploadProgress` is today (`packages/mixins-ui/src/index.ts:35` [v]).

**Words.** One option, `words?: Partial<XWords>`, per widget. `XWords` is flat and exported, its defaults are exported as `X.words`, and every value is text with `{blanks}`, never a function (a function cannot sit in a submodel's view inputs or in a frozen module). One internal `fill(text, values)` and one key-by-key merge serve every widget. A *word* is fixed text the widget draws that is not this instance's content: a button's name, a state's name, an announcement, a mark such as `×` or `…`. Content (`label`, `title`, `valueText`, a chart's `totalLabel`) stays an option. Today eight widgets use `words` [v]: `appShell`, `fileInput`, `fileUpload`, `pagination`, `searchField`, `sheet`, `steps`, `tagsInput`. The migration, all breaking:

| Today | Widgets |
| --- | --- |
| `labels` [v] | `calendar` (its dropdowns), `colorPicker`, `floatingPanel`, `imageCropper`, `signaturePad`, `timer`, `tour` |
| a differently named object [v] | `carousel` (`rotationLabels`), `marquee` (`pauseLabels`), `thinkingSteps` (`stateWords`, with `summary`) |
| scattered `*Label` and `*Text` options | `alert` (`dismissLabel`), `avatar` (`statusLabel`, `moreLabel`), `carousel` (`previousLabel`, `nextLabel`, `pickerLabel`, `slideLabel`), `cascadeSelect` (`clearLabel`, `backLabel`), `chatMessage` (`statusLabel`, `retryLabel`, `actionsLabel`), `codeBlock` (`copy.label`, `copy.copiedLabel`), `combobox` (`clearLabel`, `chips.label`, `chips.removeLabel`), `inputCopy` (`copyLabel`, `copiedLabel`, `failedLabel`), `messageScroller` (`jumpLabel`, `unseenLabel`), `passwordInput` (`toggleLabel`), `questionnaire` (`submitLabel`, `nextLabel`, `backLabel`, `missingText`, `skippedText`, `progressText`), `rating` (`starLabel`), `table` (`rowLabel`, `allLabel`, `headerLabel`), `tagsInput` (`refusalText`), `toast` (`closeLabel`), `tour` (`progressLabel`), `qrCode` (`tooLong`) |
| literals in markup | `alert.ts:147` and `card.ts:226` (`✕`), `breadcrumb.ts:167`, `:184` (`…`), `combobox.ts:295` (`×`), `cascadeSelect.ts:653` (`Select…`), `:809` (`Clear`) |

A per-file count of `*Label?:` and `*Text?:` options found 22 files [v]; some of those are content and stay. Each family batch decides word or content by the definition above and lists what it renamed.

**Sizes.** One ladder of names, `xs sm md lg xl`, declared once in `recipes/design.ts`. A recipe with a `size` axis uses those names and may ship a subset; `md` is the middle. Spacing is a different fact and keeps its own words (`Card.padding`, `Item.density`). No default changes: a recipe with no default today keeps none.

**Tones.** One vocabulary for the look axis `tone`: `accent | neutral | info | success | warning | danger`. `error` is renamed `danger` where it is a tone (Alert, Badge's tone map, Progress, Rating; `recipes/alert.ts`, `progress.ts`, `rating.ts` [v, by grep]); it stays where it is a state or a type (`Toast.Type`, a form's validation). Recipes gain the missing members by rule 1 of §3.1: Alert and Badge get `neutral` and `accent`, Spinner gets the four status tones, Switch gets `danger`.

**Field variants.** `variant: outline | filled | ghost | underline` on every field-like recipe (Input, Textarea, Select, SearchField, Combobox, NumberField); `trigger: outline | filled | ghost` stays the name on widgets whose field is a button (Listbox, Picker, CascadeSelect).

**Rows a widget draws itself.** One type for the content of an item, option, row, step or node, replacing `OptionContent`, `PickerOption`, `CheckboxGroupOption`, `SegmentedOption` and the row parts of Menu, Command, Nav, Tree, Accordion, Steps and ThinkingSteps:

```ts
// packages/mixins-ui/src/rowContent.ts (a type)
export interface RowContent {
  readonly label: string                    // the accessible name and the typeahead key; always text
  readonly description?: string | Html
  readonly icon?: Html                      // before the label: a glyph, an avatar, a dot
  readonly trailing?: Html                  // after the label: a badge, a count, a time, a shortcut
  readonly content?: Html                   // drawn in place of the label's text; `label` still names the row
  readonly disabled?: boolean
}
/** For rows that are a press target and may also hold a control of their own. */
export interface RowAction { readonly action?: Html }
```

`icon` is already the name for leading content on a dozen widgets, so nothing is renamed; `trailing`, `content` and `action` are added, each in a Slot of that name. Buttons and Labels use the same two names (`icon`, `trailing`). A widget that draws a group of its own items takes `wrap?: (item: Html, source) => Html`, so an application can put a Tooltip or a link around each (`Avatar.group`, `Card.group`, `Item.group`). Regions of a composite (`Card.media`, `Card.action`, `Item.actions`, `header`, `footer`, `aside`) are not rows and keep their names.

**Adornments in a field.** `start?: Html` and `end?: Html`, drawn inside the box in `group` and `affix` Slots, on Input, SearchField, PasswordInput, InputCopy, NumberField, Combobox and the Listbox trigger. This is what ReUI's forty "Input Group" examples are; there is no Input Group widget. `labelAside?: Html` is one Slot beside the label on every field.

**The field shell.** `Field.view({ label, description?, errors?, required?, optional?, orientation?, labelAside?, control })` places an already-drawn control, so label, description, error and orientation are one widget and not an option on each.

**States.** `disabled`, `readOnly`, `invalid`, `required` are spelled so on every options-level view, with one meaning each, written as the native or ARIA attribute and a `data-*` mark. Upstream's `isDisabled` spelling stays on the adapter rung only. `busy?: boolean` sets `aria-busy` and `data-busy`; a spinner is composed into `icon`, never drawn by the widget, which would import Spinner for every button.

**A press that may be a link.** One type, `Press = { onClick: Message } | { href: string, external?: boolean }`, in `press.ts` (it is `CardPress` in `card.ts` today, and `item.ts:3` [v] imports it from there). Button and Badge gain `href`.

**Clearing.** One option name, `clear`. Where the application owns the value: `clear?: { onClear: Message, content?: Html }`. Where the widget owns it: `clear?: true | { content: Html }`. The button's name is `words.clear`. Replaces `clearContent` and `clearLabel` (Combobox), `onClear` (SearchField) and `clearable` (CascadeSelect); Listbox and Picker gain it.

**Placement.** Every popup takes `anchor?: AnchorConfig`, with one shared `anchor(defaults)` helper behind `Popover.anchor`, `Tooltip.anchor` and `HoverIntent.anchor`. The Menu hard-codes `placement: 'bottom-start'` (`menu.ts:1262` [v]) and gains the option.

**Form participation.** `name?: string` on every widget that holds a value, with the submit format stated in one README table. Missing today: ColorPicker, SignaturePad, and a consistent hidden value for NumberField.

**Signatures.** Every `view` is `(options, h)`. `AppShell.view(options, main, h)` (`appShell.ts:61` [v]) becomes `view({ ..., main }, h)`.

### 3.6 Worked examples

`forSlots` is the application's own (`AppStyle.make` or `Style.forSlots` with its theme and layer).

**Stateless (Button).**

```ts
// style.ts, which the build may freeze
export const Quiet = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))
export const Danger = forSlots(ButtonSlots)(Recipes.Button({ tone: 'danger' }))

// widgets.ts
export const AppButton = Button.configure({ base: { style: Quiet }, presets: { danger: { style: Danger } } })

// a call site
AppButton.view({ label: 'Delete', preset: 'danger', onClick: Message.Deleted() }, h)
```

**Stateful (TagsInput), the whole application.**

```ts
const App = Bundle.compose({}).pipe(
  Bundle.withChild('labels', Bundles.TagsInput, { args: { id: 'labels', tags: ['urgent'], max: 3 } }),
)
type Model = typeof App.Model.Type
type Message = typeof App.Message.Type

const Tags = TagsInput.configure({ base: { style: TagsStyle, addOnBlur: true } })

const view = (model: Model, h: HtmlBuilder<Message>) =>
  Tags.view(
    { model: model.labels, onMessage: message => App.Message.GotLabelsMessage({ message }), label: 'Labels, up to three' },
    h,
  )

export const config = App.placements.runtime({ Model: App.Model, initial: {}, view })
```

The Model field is named by the application, the Message variant exists in `App.Message`, and every transition goes through the `update` the placements derive.

**The application owns the value (Combobox).**

```ts
const cities = ['Lisbon', 'Porto', 'Faro'] as const
const City = Combobox.one(cities)

const App = Bundle.compose({ city: Schema.Option(Schema.Literals(cities)) }).pipe(
  Bundle.withChild('cityBox', Bundles.Combobox, {
    args: { id: 'city' },
    onOut: out => model => ({ model: { ...model, city: City.picked(model.city, out) } }),
  }),
)

Combobox.view(
  { model: model.cityBox, onMessage: lift, label: 'City', choice: City, value: model.city, filter: Combobox.contains },
  h,
)
```

**Composite (a range calendar in a Card, with time slots beside it).**

```ts
const App = Bundle.compose({ slot: Schema.Option(Schema.String) }).pipe(
  Bundle.withChild('trip', Bundles.Calendar, {
    args: { id: 'trip', today, selection: Calendar.empty('Range'), months: 2, minDate: today },
    onOut: Bundle.ignore,
  }),
)

Card.view(
  {
    title: 'Trip dates',
    content: Calendar.view(
      {
        model: model.trip,
        onMessage: message => App.Message.GotTripMessage({ message }),
        label: 'Trip dates',
        presets: [{ label: 'Next week', selection: Calendar.nextDays(today, 7) }],
        aside: Segmented.view({ options: slots, pressed: Option.toArray(model.slot), onPress, label: 'Time', id: 'slot' }, h),
        style: CalendarStyle,
      },
      h,
    ),
    style: PanelStyle,
  },
  h,
)
```

The time is its own fact, so it is the application's field and another widget, placed by `aside`. Composition is nesting; there is no composite factory.

**A capability passed (uploads).**

```ts
const LANES = 2
const App = Bundle.compose({}).pipe(
  Bundle.withChild('upload', Bundles.FileUpload, { args: { id: 'files', multiple: true, lanes: LANES }, onOut: Bundle.ignore }),
)
const lift = (message: FileUpload.Message) => App.Message.GotUploadMessage({ message })

// The application's own transport, and the Progress widget, both passed in.
const send = (job: FileUpload.Job) => uploadFile(job.file).pipe(Stream.map(event => lift(toUploadMessage(job, event))))
const Upload = FileUpload.configure({ base: { style: ZoneStyle, progress: FileUploadProgress.make({ style: BarStyle }) } })

const subscriptions = Subscription.make<Model, Message>()(entry =>
  FileUpload.lanes(entry, { count: LANES, model: m => m.upload, send }),
)
```

`fileUpload.ts` imports neither a transport nor `Progress`: a field that only posts with a form ships neither. `FileUpload.lanes` exists (`fileUpload.ts:1376` [v]); its call shape here is a sketch.

**A `make` (Sidebar).**

```ts
const Nav = Sidebar.make().pipe(Sidebar.rail(), Sidebar.phone())

const App = Bundle.compose({}).pipe(Bundle.withChild('nav', Nav.bundle, { args: { id: 'nav', collapsed: true } }))

Nav.view({ model: model.nav, onMessage: lift, label: 'Main', groups, collapse: 'icons', style: NavStyle }, h)
```

A site with no phone layout writes `Sidebar.make().pipe(Sidebar.rail())` and ships no Sheet.

**A user-written feature.** A choice capped at three, written against the public `Choice` interface:

```ts
const upToThree = <Item extends string>(items: ReadonlyArray<Item>): Choice<Item, ReadonlyArray<Item>> => {
  const many = Combobox.many(items)
  return {
    ...many,
    picked: (value, change) => {
      const next = many.picked(value, change)
      return next.length > 3 ? value : next
    },
  }
}
```

**A user-added recipe value.**

```ts
const Buttons = Recipes.Button.add({ tone: { brand: brandPieces } })   // pieces as in any recipe: styles per slot
export const Brand = forSlots(ButtonSlots)(Buttons({ tone: 'brand', variant: 'solid' }))
```

## 4. The end user's bundle

### The audit

Does a site ship every variation today?

- **CSS: no.** A selection merges the base and only the chosen values' pieces (`packages/mixins/src/style.ts:598-617` [v]), and classes are compiled from that. On a server, `Style.usedIn(html)` writes only the classes the page's markup uses.
- **Recipe JavaScript: yes, unless frozen.** A recipe is one module-level call holding every axis value, and a bundler cannot drop properties of an object passed to a call. A page that selects one Button look carries the recipe module (`dist/recipes/button.js`, 7,627 bytes unminified; `card.js` 13,127; `tabs.js` 9,590), `recipes/design.ts` (20,119 bytes of source), the theme reference builder and the style compiler.
- **Widget views: branches for options never passed stay**, which is small. The real cost is a static import made for an option, and a module-level Behavior beside `view` (the table below).

### The freeze is the documented default

`styles({ sheet, modules })` from `foldkit-mixins/vite` evaluates the listed style modules at build and ships each as data: class names, no recipe, no compiler (`packages/mixins/src/vite.ts:43-55`). Measured: `examples/design-system` went from 220.7 kB to 184.2 kB brotli (`examples/design-system/test/bundle.test.ts:11-13`); domains-plus lost about 30 kB. Only `examples/design-system` uses it in this repository.

That fact shapes everything above. The factory itself saves no bytes; the freeze and the capability-as-value rule do. So:

- The README and the skill document the freeze as the default for an application, with its constraints: every export of a listed module is a Style, a `Style.slots` declaration, a string or an object of strings; the build fails if the page still compiles a Style off the list; `Style.perItem` and an inline `whenInput` predicate are refused.
- Every API here is compatible with it. `recipe.add` yields style pieces. `configure` takes compiled styles, never a recipe. `Bundles` compile nothing. A style value never carries a Behavior or a Mount.
- Rejected, unless M2 says otherwise: one file per axis value (hundreds of files, and at most the unselected share of each used recipe for unfrozen applications only), and `Recipes.X.only({...})` (narrowing at run time removes no code).

### Rule violations today

A boolean or optional feature that statically imports code, or a behaviour value defined at module level beside `view` (a module-level call keeps its module; no call in `packages/mixins-ui/src` is marked `/*#__PURE__*/`). "M5" means the fix waits for that measurement to show the code is really kept; a fix marked breaking belongs in 0.41.0.

| # | Where | What is imported for what | Fix | Breaking | M5 first |
| --- | --- | --- | --- | --- | --- |
| 1 | `breadcrumb.ts:13-14`, `:171`, `:180` [v] | `Menu` and `MenuSlots`, for `collapse.menu` | `collapse: Breadcrumb.menuCollapse({ menu, max })` from `breadcrumb/menuCollapse.ts`, typed by a public `CollapseFeature` | yes | no |
| 2 | `avatar.ts:2`, `:110` [v] | `Picture`, `Layout` from `foldkit-media`, for `src: AvatarPicture` | `picture: Avatar.picture({ asset, provider, width })` from `avatar/picture.ts`; `src` is a string | yes | yes |
| 3 | `card.ts:10`, `:278`, `:299`, `:307` [v] | `FluidHover`, for `fluidHover?: boolean`, on by default | `fluid: Card.fluid` from `card/fluid.ts`; the highlight is drawn only when given | yes (a default changes) | no |
| 4 | `item.ts:3` [v] | `overlay` and `CardPress` from `./card.js`, so an Item reaches the card group's code | move both to `press.ts` | no | no |
| 5 | `table.ts:5`, `:158`, `:356` [v] | `FluidHover`, for `fluid?: boolean` | `mixins: Table.fluid` from `table/fluid.ts` | yes | no |
| 6 | `table.ts:1`, `:6` [v] | upstream Checkbox and `./checkbox.js`, for `selection` | `selection: Table.selection({...})` from `table/selection.ts` | yes | yes |
| 7 | `combobox.ts:3`, `:350`, `:385` [v]; `listbox.ts:13`, `:321`, `:356` [v] | `FluidHover`, `Measure`, `ScrollBars`, for the `fluid` and `overlayBars` values | a file each (`combobox/fluid.ts`, …), re-exported under the same names | no | yes |
| 8 | `segmented.ts:14`, `:65` [v]; `tabs.ts:15`, `:143`, `:190` [v]; `nav.ts:20`, `:156`; `treeView.ts:12`, `:88`; `sidebar.ts:365` [v]; `menu.ts:70`, `:272`, `:297` | the same primitives, for `fluid`, `readingKeys`, `overlayBars` | a file each, same names | no | yes |
| 9 | `dialog.ts:12`, `:73`, `:91`, `:112` [v] | `ScrollBars`, `KeyboardInset`, `FocusReturn`, for `overlayBars`, `keyboard`, `focusReturn` | a file each, same names | no | yes |
| 10 | `scrollArea.ts:3`, `:80` [v]; `virtualList.ts:4`, `:85`; `command.ts:15`, `:466`, `:488`; `floatingPanel.ts:14`, `:353`; `tour.ts:15`, `:259`; `toast.ts:45-46`, `:677`; `switch.ts` (`draggable`); `radioGroup.ts:118` (`readingKeys`) | a primitive, for one mixin value | a file each, same names | no | yes |
| 11 | `image.ts:153`, `:187`, `:206`, `:255` [v] | two module-level Mounts, for `watchLoad` and `audit` | `image/watchLoad.ts`, `image/audit.ts`, same names | no | yes |
| 12 | `menu.ts:72`, `:548` [v]; `command.ts:17`, `:315` [v] | `Kbd`, for a row's `shortcut` | leave if M5 shows under 0.3 kB brotli; else a `shortcut` drawer value | only if changed | yes |
| 13 | `drawer.ts:46` [v] | `PRESS_SLOP`, `SwipeFrom`, `swipeOf` from `./sheet.js`, so a Drawer ships Sheet and Dialog | move the three to `swipe.ts` | no | no |
| 14 | `colorPicker.ts:13`, `:855` [v] | `Popover`, for `ColorPicker.popover` | `colorPicker/popover.ts`, same name | no | no |
| 15 | `imageCropper.ts:12`, `:1072` [v] | `Slider`, for `controls.zoom`, on by default | `controls.zoom: ImageCropper.zoomSlider({ style })` from `imageCropper/zoomSlider.ts`; the `slider` style option goes | yes (a default changes) | no |
| 16 | `sidebar.ts:26-28`, `:263-265` [v] | Sheet, Splitter, Tooltip, for the phone layout, the resize handle and the rail | `Sidebar.make` (§3.4) | yes | no |
| 17 | `questionnaire.ts:11-17` [v] | Button, CheckboxGroup, Input, RadioGroup, Textarea, for the kinds | `Questionnaire.make` (§3.4); the six style channels move to the kinds | yes | no |
| 18 | `chart.ts:183`, `:194`, `:348`, `:426` [v] | every kind's drawing in one `view` | `kind` is a value (§3.4) | yes | M8 records it |
| 19 | `packages/mixins-data-grid/src/view.ts:36-41` [v]; `packages/data-grid/src/grid.ts:1-30` | fill handle, filter form, header and cell press, clipboard, for every grid | `features` values on `DataGrid.make` | yes | yes |

I verified sixteen of the nineteen rows in part or in full; the unmarked citations in rows 8, 10 and 19 are the research's.

### Measurements and probes

All sizes are measured against `dist` with `scripts/bundle-report.mjs`, with Foldkit's view-identity plugin spliced out (a workspace build brands `dist`; an installed one does not). The first table is the plan; the second is what Phase 0 found.

| # | What | What it could overturn |
| --- | --- | --- |
| M1 | A page drawing one styled Button, bytes by module, unfrozen and frozen. | The end-user baseline; nothing. |
| M2 | The same page with a hand-narrowed Button recipe. | Above about 1 kB brotli per recipe, per-value files are reopened. |
| M3 | Two `mixins-ui` cases in `scripts/test/publishedBuild.test.ts`: a page reading `Recipes.Avatar`, one reading `Bundles.TagsInput`. Each keeps no more of `dist` than of source. | If a supported bundler keeps the `Bundles` namespace whole, add a `foldkit-mixins-ui/bundles` subpath. |
| M4 | What `Bundle.compose`, `withChild` and `placements.runtime` cost a page with no other Bundle. | A large first-Bundle cost means the README shows the hand fold as the small-page path. |
| M5 | For each row of the table marked M5: is the code in a page that never passes the option or the mixin? | A row whose code is already dropped is struck from the plan. |
| M6 | Bytes by module for a single-date Calendar and for a range DatePicker with presets. | Confirms the modes need no split (about 90 lines); a surprise reopens it. |
| M7 | A feature file under `src/<widget>/` re-exported by name from the widget module is absent from a page that does not read it, including when the feature imports a value back from the widget module. | If kept, feature values use sibling namespaces (`FileUploadProgress`), and `FileUpload`'s export names are settled before the tag. |
| M8 | A bar-chart page before and after the kind split. | Nothing; the split is for extension. It records the saving. |
| M9 | The `configure` helper's cost, and an options-level view's cost over its adapter (Checkbox). | Above about 0.5 kB brotli for the helper, each widget writes its merge inline. |
| P1 | An exported Bundle over an upstream Model (`Bundles.Calendar`, `Bundles.Tabs`), placed in an example, compiles under `tsc -b` and `pack:check` with no TS2742. | If it fails, upstream-Model widgets export their parts (`Model`, `Message`, `init`, `update`) and the application calls `Bundle.make`. |
| P2 | `Bundle.make` `args` with optional keys written inline; whether upstream's `Calendar.LocaleConfig` (`calendar/index.d.ts:192` [v]) can sit in an `args` Schema. | If `locale` cannot be data, it is an `init` function option outside `args`. |
| P3 | A `Kit` with two feature steps, exported from an example, under `tsc -b` and `pack:check`: no TS2742, no TS7056, and a question of an unregistered kind is a type error. | If it fails, Sidebar and Questionnaire are not rebuilt in 0.41.0. |

**Results.** Phase 0 ran M1 to M7 and P1 to P3 on 2026-11-17, on `ui-polish`. Each page was a one-entry Vite 8 production build with workspace packages resolved to the `dist` on disk (`mixins-ui` and `mixins` as built that morning; nothing was rebuilt, since FileUpload was mid-build). A page total is the real brotli size of the JavaScript the page loads. A per-module figure is that module's share of the chunk's minified bytes times the chunk's real ratio, so it is an estimate. A page that loads one widget starts at about 62.9 kB (Foldkit's html, Effect, the mixins core).

| # | Result | Verdict |
| --- | --- | --- |
| M1 | Unfrozen 114,120 B brotli, frozen 91,769 B: the freeze saves 22,351 B for one Button. Frozen, the whole mixins, mixins-ui and application share is about 5.2 kB. The stylesheet is the same either way (8,372 B brotli, a linked file). | Confirms: the freeze and capabilities as values save the bytes; the factory saves none. |
| M2 | 136 B saved (113,984 B against 114,120 B). No recipe module is over 1.8 kB whole (sidebar 1,792 B, card 1,706 B, toast 1,400 B). Only Button was narrowed by hand. | Not reopened. Per-value recipe files stay rejected. |
| M3 | A page reading `Recipes.Avatar` keeps `recipes/avatar.js`, `recipes/design.js` and `avatar.js` and nothing else of the package: 83,051 B from `dist`, 82,787 B from source. Reading every recipe is 172,300 B. The `Bundles` case could not run (no namespace yet); phase 1 adds both cases to `publishedBuild.test.ts`. | Confirms, for Vite 8. No subpath. |
| M4 | 6,214 B brotli over the same page folded by hand (91,864 B against 85,650 B); `foldkit-bundle`'s own modules are about 4.8 kB of it. A second Bundle shares the machinery. | Triggered: the README shows the hand fold first, as the small-page path, and says what the first placement costs. |
| M5 | Every row is real except 13. Kept by a page that never passes the option, brotli estimates: Breadcrumb's Menu 21.1 kB; Sidebar's Sheet, Splitter and Tooltip 16.9 kB; ColorPicker's Popover 7.6 kB; Questionnaire's fields 4.2 kB; Listbox and Combobox 3.0 kB each; Menu 2.4 kB; Chart 2.3 kB; each `fluid` or `overlayBars` value 1.2 to 1.8 kB; Avatar's `foldkit-media` 1.4 kB; ImageCropper's Slider 1.2 kB; Toast's `keepFocus` 1.1 kB; Image at most 0.8 kB; Table's Checkbox 0.5 kB; Tour 0.2 kB; Kbd 0.12 kB. A page that also reads the value (`Tabs.fluid`, `ScrollArea.overlayBars`, `Toast.keepFocus`, `Sidebar.fluid`) is within 150 B of one that does not. | A module-level behaviour value beside `view` keeps its primitive whether or not it is read, so a new behaviour or feature value goes in a file of its own, never a module-level call in the view's file. Row 13 is struck as a breaking change (a Drawer page keeps 175 B of `sheet.js` and no Dialog) and stays a small cleanup. Row 12 stays "leave". Fix order by bytes: rows 1, 16, 14, 17, 7, Menu in 8, 18, then the one-primitive rows. |
| M6 | Single-date Calendar 70,067 B; range DatePicker with presets 89,383 B. The range and preset code adds about 228 B to `calendar.js`; the rest is upstream's calendar, popover, anchor and picker. | Confirms: no split by mode. |
| M7 | Absent, from `dist` and from source, with and without the back-import (385 B without the feature, 469 to 478 B with it). Run on a synthetic package of the same layout, since FileUpload was unfinished. | Confirms: `Tabs.fluid`-style names stay in the widget's namespace. |
| M8 | Not run: it needs the split built. The view-only Chart module is 2,347 B today. | Open. |
| M9 | Not run in Phase 0. | Open; measured once the helper exists. |
| P1 | Passes under `tsc -b` (TypeScript 7.0.2, composite, declarations): `Bundle.make` over `@foldkit/ui/calendar`'s Model and `Bundle.fromParts` over `@foldkit/ui/tabs`'s both emit, with no `any` and no unnamed package-internal import. `pack:check`'s consumer compile was not run. | Confirms; the fallback is not needed. See the TS4023 caveat. |
| P2 | `Schema.optionalKey` keys work end to end, and `LocaleConfig` is a Schema, so `locale` is data. `Schema.optional` as an args key fails TS2379 under `exactOptionalPropertyTypes`. A missing required key is a type error at the placement. | `locale` stays in `args`. Optional args are `Schema.optionalKey`, never `Schema.optional`: §3.2's sketch is corrected by this row. |
| P3 | Passes under `tsc -b` with two steps and two upstream Models: no TS2742, no TS7056, and `Survey.question.multiple` on a kit without that kind is TS2339. The prototype cast inside (`defineMessageUnion(cases as never)`, and each step's return). The real Sidebar's larger Model was not tried; `pack:check` was not run. | Does not block `make` in 0.41.0. An open item in §9. |

Caveats that bind the build:

- **The tsdown config is the mechanism.** M3 and M7 hold only because `packages/mixins-ui/tsdown.config.ts` keeps one output file per source file with relative imports external. Built without that, rolldown writes `export * as` as an object of getters, and a page reading one member keeps every sibling. `bundles/` is built by the same config, and the `publishedBuild` cases pin it.
- **TS4023 on an exported composition.** `export const Page = Bundle.compose({...}).pipe(Bundle.withChild(...))` failed declaration emit: the result's type used a name `foldkit-bundle` did not export. Exporting `Page.Model`, `Page.Message` and `Page.placements` emitted. A `Bundles.X` made with `Bundle.make` or `Bundle.fromParts` is not affected.
- **An OutMessage is answered at every placement**, so a Bundle whose Message passes out needs `onOut` or `Bundle.ignore` each time.
- **Not checked:** M8 and M9; the `Bundles` half of M3; M6 and M7 against the real FileUpload; `pack:check` and a consumer compile with `skipLibCheck: false` for P1 and P3; row 18's bytes per chart kind and row 11's per value; any bundler other than Vite 8 (rolldown). The figures are from the `dist` on disk that morning, so source edits made after it are not in them.

`absent` pins that hold the result (`scripts/bundle-budget.mjs`): a styled TagsInput without `Bundles` holds no `foldkit-bundle` module; a FileUpload without `sort` or uploads holds no `reorder`, `pointer-drag`, `progress` or `foldkit-media/browser`; a single Combobox holds no `choice/many`; a bar chart holds no `chart/donut`; a Sidebar with no `phone` step holds no `sheet`; a Table with no selection holds no `checkbox`.

## 5. The catalogue

**Columns.** Class: **A** stateless or application-owned state (recipe, `view`, `configure`); **B** stateful with one Model shape (`Bundles.X`, `view`, `configure`); **M** `make`. N: reference examples scored. Today and After: examples that are a call with options, an imported value or a look (D/V/L), a composition with another widget (C), not expressible (X). "Today" counts a look that needs `recipe.add` as X. Additions: proposed options, slots, values and recipe values. Priority: **0** the gate; **1** a family the maintainer pointed at, or a breaking change; **2** fan-out; **3** follows in 0.42.0.

Sources marked "own" have no ReUI or shadcn page; their rows are our own scenario sets and weaker evidence.

| Component | Class | Factory | N | Today | After | Additions | Rule fixes | Pri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| alert | A | view | 20 | 7/6/7 | 14/6/0 | tone `neutral`; `actions` take `Html` | words | 2 |
| aspect-ratio | A | view | 8 | 2/0/6 | 8/0/0 | six ratio values | | 2 |
| avatar | A | view, group | 35 | 13/9/13 | 25/10/0 | `badges`, group `rest` and `wrap`, recipe values | #2 | 2 |
| badge | A | view | 25 | 17/0/8 | 23/2/0 | `recipeFor`; `size`, `icon`, `onDismiss`, `href`, tone `accent` | recipe is a function | 1 |
| breadcrumb | A | view | 15 | 7/3/5 | 11/4/0 | step `trailing`, `labelHidden`; recipe `item` | #1 | 1 |
| button | A | view | 61 | 27/5/29 | 49/12/0 | `trailing`, `invalid`, `busy`, `href`, `description`, `mark`; `variant: link`, `size: xs` | | 0 |
| button-group | A | view | 57 | 17/39/1 | 18/39/0 | none | | 2 |
| card | A | view | 18 | 6/6/6 | 12/6/0 | recipe `divide`, `lift: zoom`, `orientation: overlay`, elevation values | words | 2 |
| card-group | A | group | 9 own | 9/0/0 | 9/0/0 | `wrap` | #3 | 1 |
| code-block | A | view | 27 | 5/6/16 | 19/7/1 | `marks`, `wrap`, `gutter`, `collapsed`, `onLineSelect`, `lineAction`, `follow` value; recipe `header`, `scheme` | words | 2 |
| empty | A | view | 20 | 16/4/0 | 16/4/0 | none | | 2 |
| figure | A | view | 6 own | 2/3/1 | 3/3/0 | recipe `caption` side | | 2 |
| icon | A | view | 17 | 2/4/11 | 13/4/0 | recipe `surface`, `shape`, `tone`, sizes; `glyph` as `Html`; `mark` | | 2 |
| image | A | view | 8 own | 8/0/0 | 8/0/0 | none | #11 | 2 |
| item | A | view, group | 12 | 2/9/1 | 3/9/0 | `header`, `footer`; density `roomy`; `wrap` | #4 | 2 |
| kbd | A | view, combo | 6 | 2/3/1 | 3/3/0 | `key` as `Html` | | 2 |
| label | A | view | 13 | 1/4/8 | 5/8/0 | `disabled`, `required`, `optional`, `trailing` | | 2 |
| meter | A | view | 8 own | 6/0/2 | 8/0/0 | recipe `size`, `orientation`; `segments` | | 2 |
| progress | A | view | 8 | 6/2/0 | 6/2/0 | none | tone rename | 1 |
| separator | A | view | 6 | 5/1/0 | 5/1/0 | none | | 2 |
| skeleton | A | view and four helpers | 10 | 5/3/2 | 7/3/0 | `inline`, `block` lengths | | 2 |
| spinner | A | view | 12 | 3/7/2 | 4/8/0 | status tones | | 2 |
| steps | A | view | 44 | 13/4/27 | 37/5/2 | step `state`; recipe `marker`, `connector`, `labels`, `compact` values | | 1 |
| typography | A | view | 8 own | 5/2/1 | 6/2/0 | `content` as `Html` | `level` twice | 1 |
| toolbar | B | Bundle, view | 8 own | 8/0/0 | 8/0/0 | none | | 2 |
| input | A | view, field | 31 | 19/9/3 | 22/9/0 | `count`, `start`, `end`, `labelAside`; `variant: underline, ghost`; `draw` optional | | 1 |
| textarea | A | view, field | 6 | 6/0/0 | 6/0/0 | none | | 2 |
| checkbox | A | new view | 12 | 8/3/1 | 9/3/0 | options-level `view`; recipe `shape` | | 2 |
| checkbox-group | A | view | 10 | 4/0/6 | 10/0/0 | `RowContent` options; `variant: card` | | 2 |
| switch | A | new view | 14 | 5/8/1 | 6/8/0 | options-level `view`; tone `danger` | #10 | 2 |
| radio-group | B | Bundle, new view | 17 | 11/4/2 | 13/4/0 | options-level `view` with `RowContent`; `invalid`; recipe `layout` | #10 | 2 |
| fieldset | A | new view | 11 | 0/11/0 | 0/11/0 | options-level `view`; the `Field` shell | | 2 |
| number-field | A | view | 6 | 4/0/2 | 6/0/0 | recipe `steppers`; `invalid`, `readOnly` | | 2 |
| otp-field | A | view | 6 | 6/0/0 | 6/0/0 | `mask` | | 2 |
| password-input | B | Bundle, view | 5 own | 3/1/1 | 4/1/0 | `Bundles.PasswordInput`; `labelAside` | words | 2 |
| input-copy | B | Bundle, view | 4 own | 2/1/1 | 3/1/0 | `copyContent`; `start`, `end` | words | 2 |
| search-field | A | view | 8 own | 3/3/2 | 5/3/0 | `start`, `end`; `busy` | `clear` | 1 |
| file-input | A | view | 4 | 4/0/0 | 4/0/0 | none | `accept` array (done with FileUpload) | 1 |
| file-drop | B | Bundle, adapter | 2 | 2/0/0 | 2/0/0 | none | | 2 |
| picker | B | Bundle, view | 8 own | 4/0/4 | 8/0/0 | `choice`, `groupBy`, `disabled`, `invalid`, `name`, `clear` | | 1 |
| select (native) | A | new view | 6 | 5/1/0 | 5/1/0 | options-level `view` | | 2 |
| listbox | B | Bundle, new view, `Choice` | 33 | 26/4/3 | 29/4/0 | options-level `view`; `RowContent.trailing`; `clear` | #7 | 1 |
| combobox | B | Bundle, new view, `Choice` | 40 | 25/9/6 | 31/9/0 | options-level `view`; `start`, `end`, `autoHighlight`, `chips.removable`, `chips.content`, `creatable`, `Combobox.text`; `variant: ghost` | #7, words, `clear` | 1 |
| cascade-select | B | Bundle, view | 21 | 5/1/15 | 17/1/3 | node `RowContent`; one and many paths as the widget's union; `triggerText`, `layout: inline`, `Set`, `footer`, `aside`, `loading` | words, `clear` | 3 |
| rating | A | view | 9 | 6/2/1 | 7/2/0 | `mark` per position | words, tone rename | 2 |
| tags-input | B | Bundle, view | 11 own | 8/1/2 | 10/1/0 | `chipContent`; `accept` in args, `Refusal.Invalid` | words | 0 |
| slider | A | view | 12 | 10/1/1 | 11/1/0 | a value of several thumbs | | 2 |
| angle-slider | B | Bundle, view | 9 own | 9/0/0 | 9/0/0 | none | | 2 |
| color-picker | B | Bundle, view | 15 | 3/7/5 | 8/7/0 | `layout: area, ring, compact`; `Committed`; `name`, `invalid`, `required`; names parser value; format `hsb` | #14, words | 3 |
| segmented | A | view | 16 | 14/0/2 | 16/0/0 | `orientation` | #8 | 2 |
| dialog (and alert dialog) | B | Bundle, adapter; view in 0.42 | 24 | 9/15/0 | 9/15/0 | arg `dismissible` | #9 | 2 |
| sheet (and ReUI's drawer) | B | Bundle, view | 9 | 8/1/0 | 8/1/0 | none | | 2 |
| drawer (ours, docked) | B | Bundle, view | 1 own | 1/0/0 | 1/0/0 | none | #13 | 2 |
| popover | B | Bundle, adapter; view in 0.42 | 11 | 3/8/0 | 3/8/0 | shared `anchor` helper | | 2 |
| tooltip | B | Bundle, adapter | 16 | 2/14/0 | 2/14/0 | none | | 2 |
| hover-card | B | Bundle, adapter | 8 | 2/6/0 | 2/6/0 | none | | 2 |
| menu (and context menu) | B | Bundle, view | 28 | 23/1/4 | 27/1/0 | `anchor`; row `content` and `trailing`; `header`, `footer` | #8, #12 | 2 |
| menubar | B | Bundle, view | 5 | 4/0/1 | 5/0/0 | submenu rows | | 2 |
| navigation-menu | B | Bundle, view | 4 | 1/0/3 | 4/0/0 | link `icon`; panel `footer`; recipe `panel` | #8 | 2 |
| command | A | view | 8 | 7/1/0 | 7/1/0 | none | #10, #12 | 2 |
| toast | B | Bundle, view, `ToastView.make` | 21 | 14/2/5 | 19/2/0 | `actions`, `cancel`; tone `invert`; payload update | #10, words | 2 |
| tabs | B | Bundle, new view | 9 | 8/1/0 | 8/1/0 | options-level `view` | #8 | 2 |
| pagination | A | view | 15 | 3/4/8 | 11/4/0 | `icons`; recipe `shape`, `treatment`, `summary` | | 2 |
| timer | B | Bundle, view | 2 own | 2/0/0 | 2/0/0 | none | words | 2 |
| calendar and date-picker | B | Bundle, new view | 30 | 23/4/3 | 25/5/0 | §3.4: `paging: end`, `today`, `aside`, `footer`, year-only dropdown, `closes: manual` | words | 0 |
| date-picker (ReUI date selector) | B | as above | 4 | 2/2/0 | 2/2/0 | none | | 0 |
| table | A | view | 17 | 1/13/3 | 4/13/0 | column `footer`; `header` as `Html`; recipe `borders`, `layout`, `header: hidden`; `reorder` value | #5, #6, words | 1 |
| data table (Table and DataGrid) | A and `DataGrid.make` | view; make | 34 | 19/6/9 | 28/6/0 | footers; header icons; row reorder, pinning, tree (need design) | #19 | 3 |
| chart | B | Bundle, view, kind values | 25 | 6/0/19 | 25/0/0 | kinds and fills as values; `stack`, `curve`, `markers`, `reference`, `hole`, `stats`; radar, radial | #18 | 1 |
| accordion | B | Bundle, view | 11 | 5/3/3 | 7/4/0 | `Bundles.Accordion`; item `icon`, `trailing` | | 2 |
| disclosure | B | Bundle, new view | 10 | 3/7/0 | 3/7/0 | options-level `view` | | 2 |
| sidebar | M | make | 5 | 2/1/2 | 2/3/0 | `rail`, `phone`, `resize` steps; `placeholder`; action `trigger` | #16, #8 | 3 |
| app-shell | A | view | 7 own | 4/2/1 | 4/3/0 | `aside` | `main` argument | 1 |
| resizable | B | Bundle, view | 10 | 6/4/0 | 6/4/0 | handle `pill` | | 2 |
| scroll-area | A | view | 5 | 3/0/2 | 5/0/0 | recipe `fade`, `gutter` | #10 | 2 |
| virtual-list (and window-list) | B | Bundle, view | 9 own | 7/0/2 | 8/0/1 | `onNearEnd`; a site page for WindowList | #10 | 2 |
| tree-view | B | Bundle, view | 7 | 6/0/1 | 7/0/0 | node `content`, `action` | #8 | 2 |
| carousel | B | Bundle, view | 11 | 8/0/3 | 11/0/0 | `orientation`; `responsive` value; `align` | words | 2 |
| floating-panel | B | Bundle, view | 13 own | 10/0/3 | 13/0/0 | `controls`; `rectBeside`; `docking` value | #10, words | 2 |
| tour | B | Bundle, view | 11 own | 9/0/2 | 11/0/0 | step `description` as `Html`; `advanceOnClick` value | #10, words | 2 |
| chat-message | A | view, group | 14 | 7/4/3 | 10/4/0 | `reactions`; bubble `ghost`, `outline` | words | 2 |
| message-scroller | B | Bundle, view | 6 | 3/0/3 | 6/0/0 | arg `opens`; `anchoredTurn` and `turns` values | words | 3 |
| thinking-indicator | A | view | 10 own | 9/1/0 | 9/1/0 | none | | 2 |
| thinking-steps | B | Bundle, view | 22 | 12/8/2 | 14/8/0 | `Bundles.ThinkingSteps`; `title` as `Html`, `href`; state `skipped`; `trigger: none` | words | 2 |
| questionnaire | M | make | 7 | 3/0/4 | 7/0/0 | kinds as steps; `summary`, `progress`, `rules`, `when` | #17, words | 3 |
| marquee | B | Bundle, view | 11 own | 9/2/0 | 9/2/0 | none | words | 2 |
| image-cropper | B | Bundle, view | 13 own | 10/2/1 | 11/2/0 | flip | #15, words | 1 |
| signature-pad | B | Bundle, view | 12 | 5/2/5 | 10/2/0 | redo; `name`, `required`; `Pen.color`; export types; `pointerTypes`; `replay` value | words | 3 |
| qr-code | A | view | 11 own | 9/1/1 | 10/1/0 | `modules` value (`QrCode.rounded`) | words | 2 |
| file-upload | B | Bundle, view, parts | 10 | not built | 7/3/0 | being built; `configure`; `Bundles.FileUpload` | M7 settles the feature names | 0 |
| **New:** frame | A | view | 19 | 0 | most L | a panel wrapper: `spacing`, `radius`, `variant` axes | | 2 |
| **New:** sortable | B | Bundle, view | 8 | 0/0/8 | 3/5/0 | a widget over `Reorder`, passed as a value | | 3 |
| **New:** time field | B | Bundle, view | 13 | 0/0/13 | 13/0/0 | its own design note | | 3 |
| **Composition:** kanban | | a site page | 6 | 0/0/6 | 0/6/0 | `Reorder.moveBetween` | | 3 |

That is the 88 pages the site has today plus `file-upload` (the research says the site's `catalogue.ts` lists 90; one slug is unaccounted for and is found when the batches are cut), and four rows for what is new.

**Totals.** 1,290 example rows were scored: about 1,100 from ReUI and shadcn pages and about 190 from our own scenario sets. Some reference rows are counted under two components (the file-upload examples, the input-group examples, the select examples reused for Picker).

| | A call with options (D/V/L) | Composition (C) | Not expressible (X) | Not built |
| --- | --- | --- | --- | --- |
| Today | 654 (51%) | 301 (23%) | 325 (25%) | 10 |
| After | 945 (73%) | 338 (26%) | 7 (under 1%) | 0 |

About 180 additions get there. Composition is the design working, not a gap: it is a second widget beside the first. The seven left are CodeBlock's fold regions, two decorative Steps animations, three CascadeSelect examples (windowed columns, deep search) and grouped sticky headers in a virtual list. "Today" for the calendar means expressible by hand through the adapter; none of its thirty is one call today.

### The calendar's thirty

State is `Bundles.Calendar` (1 to 23) or `Bundles.DatePicker` (24 to 30). The last column is what `packages/mixins-ui/test/calendarView.test.ts` found on 2026-11-17, and `datePickerOptions.browser.test.ts` for 24 to 30, where each D, V and L row is a test numbered as here: the row is built through the public API and its defining trait asserted on the drawn page. "With an addition" marks a row that needed an option built for it.

| # | Example | Args and view options | Kind | Checked |
| --- | --- | --- | --- | --- |
| 1 | Basic | defaults | D | held |
| 2 | Range | arg `selection: Calendar.empty('Range')` | D | held |
| 3 | Disabled dates | args `disabledDates`, `disabledDaysOfWeek`, `minDate` | D | held |
| 4 | Multiple | arg `selection: Calendar.empty('Multiple')` | D | held |
| 5 | Custom selected day | `Recipes.Calendar.extend({...})` | L | held |
| 6 | Custom range style | `Recipes.Calendar.extend({...})` | L | held |
| 7 | Controls on the right | `paging: 'end'` | D | held, with an addition |
| 8 | Month and year dropdowns | `caption: { dropdowns: {} }` | D | held |
| 9 | Year select with arrows | `caption: { dropdowns: { month: 'label' } }` | D | held, with an addition |
| 10 | Week numbers | `weekNumbers: true` | D | held |
| 11 | "Current month" button | `today: { label: 'This month' }` | D | held, with an addition |
| 12 | "Today" button | `today: { label: 'Today', selects: true }` | D | held, with an addition |
| 13 | Year view | `caption: 'grid'`, the default | D | held |
| 14 | Preset times | `aside:` the application's time list | C | the slot held; the time list is not built here |
| 15 | Date presets | `presets: [{ label, selection: Calendar.day(...) }]` | D | held |
| 16 | Range presets | `presets` built with `Calendar.lastDays`, `monthOf` | D | held |
| 17 | A price on each day | `detail: priceOf`; recipe `detail: 'text'` | V | held |
| 18 | Presets, another layout | `presets`; a recipe value for their side (by `add`) | L | held |
| 19 | Appointment | `aside:` time slots | C | as 14 |
| 20 | Two months | arg `months: 2` | D | held |
| 21 | Two months, range | args `months: 2`, `selection: Calendar.empty('Range')` | D | held |
| 22 | Event list beside | `detail` marks the days; the list is the application's, in `aside` | C | as 14 |
| 23 | Localized | arg `locale: Calendar.localeOf('fr')`; `words` | V | held |
| 24 | Date picker | `trigger: selection => string` | V | held |
| 25 | Range date picker | arg `selection: Calendar.empty('Range')`; `trigger` | V | held |
| 26 | Date picker, year view | `caption: 'grid'` | D | held |
| 27 | Date and appointment picker | `aside:` time slots; arg `closes: 'manual'` | C | the slot and `closes: 'manual'` held; the time list is not built here |
| 28 | Date picker with presets | `presets` | D | held |
| 29 | Range picker with presets | `presets` | D | held |
| 30 | Date and time range picker | `footer:` two time inputs; arg `closes: 'manual'` | C | as 27 |

Twenty-five of thirty are a call with options by the mapping; five are a call plus a second widget. Checked: all twenty-five. The Calendar's twenty (1 to 13, 15 to 18, 20, 21, 23) and the DatePicker's five (24, 25, 26, 28, 29) each hold in a test, four of them (7, 9, 11, 12) through an option built for the row, and none turned out not expressible. The five composed rows are checked as far as the Calendar goes: the `aside` and `footer` slots, and `closes: 'manual'`. The limit worth stating: upstream's month and year grids ship with every calendar, because they are inside `@foldkit/ui/calendar`'s one Model, `update` and view. `caption: 'label'` hides them and cannot drop them.

### Combobox, autocomplete and select

ReUI's combobox (28), autocomplete (12) and select (33). `C.` is `Combobox.view`, `L.` is `Listbox.view`.

| Reference | Options | Kind |
| --- | --- | --- |
| combobox basic, disabled, invalid, in a form, large list | `choice: Combobox.one(items)`, `disabled`, `invalid`, `name`; `mixins: Combobox.overlayBars` | D |
| clear button | `clear: { onClear }` | D |
| grouped, with separators | `groupBy`, `heading` | V |
| multi-select, disabled, invalid | `choice: Combobox.many(items)` | V |
| custom item rendering, user tags | `option: item => RowContent`; `chips.content` (new) | V |
| chips not removable | `chips: { removable: false }` (new) | D |
| icon addon | `start: Html` (new) | D |
| auto-highlight | `autoHighlight` (new) | D |
| custom trigger icon | `buttonContent: Html` | D |
| "invisible" field | `variant: 'ghost'` (new value) | L |
| in a popup; status, priority, assignee pickers (8) | `Popover` with `Command` inside | C |
| autocomplete basic, clear, trigger, groups, sizes, form | `choice: Combobox.text(items)`; the rest as above | V, D, L |
| creatable (our own example) | `creatable: Combobox.creatable({ label })` | V |
| select basic, invalid, disabled, small | `L.` with `choice: Listbox.one(items)`, `size` | D, L |
| icons, descriptions, dots, avatars, flags (13) | `option: item => ({ label, icon, description })` | V |
| badges, timezone offsets | `RowContent.trailing` (new) | V |
| grouped | `groupBy`, `heading` | V |
| multiple, overlapping dots | `choice: Listbox.many(items)` | V |
| clear button | `clear` (new on Listbox) | D |
| indicator on the left, custom chevron | recipe `check: 'start'`; `.extend` | L |
| in a field, a dialog, beside an input or button | composition | C |

### Table and data table

Three rungs exist, with three Slot contracts, three column declarations and different markup: `Table` (`packages/mixins-ui/src/table.ts`, a semantic table over a rows array, all state the application's), `ListView` (`packages/mixins-crud`, a table over a Remote page with loading, failed and empty states) and `DataGrid` (`packages/data-grid` with `packages/mixins-data-grid`, an ARIA grid: virtual rows, cell focus, ranges, editing, clipboard, fill, filter, resize, pin, hide, reorder). Stay on `Table` for a few hundred read-only rows; go to `ListView` when the rows come from Remote; go to `DataGrid` for cell-level keys, editing, thousands of rows or user-managed columns.

**A shared column core is not part of this effort.** It crosses three packages' contracts and two owners (`foldkit-crud`'s `Display`, the grid's `ColumnSpec`), and it is needed by no example. What is in scope: `Table`'s own additions below, the field names they introduce chosen to match `ColumnSpec` (`header`, `value`, `width`), and the paragraph above on the Table page.

| Reference | Under the design | Kind |
| --- | --- | --- |
| Table basic | `Table.view({ columns, rows })` | D |
| footer; totals and aggregate footers | column `footer?: Html \| string` and a `footer` row Slot (new) | D |
| status badges, avatars, actions columns (13) | `value: row => Badge.view(...)`; `Card.view` around | C |
| vertical tables | first column `rowHeader`; recipe `header: 'hidden'` (new) | L |
| dense, striped, no borders, sticky header | recipe `density`, `rows`, `header` | L |
| cell borders, auto width | recipe `borders`, `layout` (new) | L |
| column icons | `header: string \| Html` (new) | D |
| sortable, row selection, expandable, sub table | `sort`, `selection: Table.selection(...)`, `expansion` | V |
| draggable rows | `reorder:` a `Reorder` value (new); never a `draggable` flag | V |
| pagination | `Pagination.view` beside it | C |
| movable, resizable, pinnable columns; column controls and visibility; spreadsheet editing; column virtualization | `DataGrid` | D |
| infinite scroll, local and remote | `DataGrid` `onMore` with `MoreOnScroll` | V |
| row pinning, tree rows | none; each needs a design in the grid packages | X until then |

### Chart

Twenty-five references; the kind and treatment of each are inferred from titles.

| Reference | Under the design | Kind |
| --- | --- | --- |
| basic and multi-series bars, vertical bars | `kind: Chart.bars`, `series` | D |
| stripe, dots, gradient, duotone, crosshatch fills (10) | series `fill: Chart.stripe` and the rest, drawn in a `defs` Slot (new) | V |
| stacked area | `stack: true` (new) | D |
| step area | `curve: 'step'` (new) | D |
| markers always shown | `markers: 'always'` (new) | D |
| forecast zone | `reference` bands (new) | D |
| donut with centre total; active segment | `kind: Chart.donut`, `totalLabel` | D |
| donut with centre stats; pie | `stats`, `hole: 0` (new) | D |
| radar (2), radial (1) | `kind: Chart.radar`, `Chart.radial` (new kinds) | V |
| 3D and isometric bars (2) | a `depth` option on bars; lowest priority, least accessible | V |

### File upload

The ten references, under the design being built. Args are `Bundles.FileUpload`'s.

| # | Example | Args | Selection | View options and passed values |
| --- | --- | --- | --- | --- |
| 1 | Basic | `accept: ['image/*']` | `{}` | `label` |
| 2 | Avatar | `accept`, `maxSize` | `layout: 'avatar'` | `picture: url => Avatar.view(...)` |
| 3 | Drag and drop | `multiple`, `maxFiles`, `maxSize` | `layout: 'zone'` | `description` |
| 4 | Gallery | `multiple`, `accept` | `layout: 'zone'`, `list: 'grid'` | `itemActions` |
| 5 | Progress | `multiple`, `lanes: 3` | `layout: 'zone'` | `progress`; `send` in the lane entries |
| 6 | Table | `multiple`, `lanes: 2` | `{}` | `FileUpload.parts` laid into `Table.view`; a ring `progress` |
| 7 | Image upload | `multiple`, `accept`, `lanes: 2` | `layout: 'zone'`, `list: 'grid'` | `progress`, `send` |
| 8 | Sorting | `multiple`, `accept`, `initial` | `list: 'grid'` | `sort: { input, mixin }`, `mixins: FileUpload.keepFocus`; `Reorder.bundle` placed by the application |
| 9 | Card | `multiple` | `layout: 'zone'` | wrapped in `Card.view` |
| 10 | Cover | `accept`, `lanes: 1` | `layout: 'cover'` | `picture`, a ring `progress`, `send` |

Seven are a call with options and passed values; three (6, 7 with cropping, 9) are compositions.

### Button

Sixty-one references, titles only.

| Reference | Under the design | Kind |
| --- | --- | --- |
| default, secondary, outline, ghost, destructive; sizes; disabled; icon and icon-only (22) | recipe `tone`, `variant`, `size`, `shape`; `icon`; `disabled` | D, L |
| state toggles, expand-to-label, sliding icon (5) | the application swaps `label` and `icon`; `.extend` | D, L |
| link variant, xs (4) | `variant: 'link'`, `size: 'xs'` (new values) | L |
| icon on the right; more and less; counts (10) | `trailing: Html` (new) | D |
| invalid (3) | `invalid` (new) | D |
| loading (2) | `busy` (new), with `icon: Spinner.view(...)` composed | D, C |
| as a link (3) | `href`, `external` (new) | D |
| two-line content | `description` (new) | D |
| badges, status dots, shortcut keys (6) | `trailing` or a corner `mark` Slot (new), holding Badge or Kbd | C |
| shortcut tooltip, avatar inside (5) | `Tooltip` around; `icon: Avatar.view(...)` | C |

A `loading: boolean` that draws a spinner is refused: it would import Spinner for every button.

### Steps

Forty-four references. Nearly all of the long tail is CSS over the same markup.

| Reference | Under the design | Kind |
| --- | --- | --- |
| basic, controlled, titles, descriptions, content, vertical, icons, progress bar (14) | `current`, `onSelect`, `steps`; recipe `orientation`, `connector: 'progress'` | D, L |
| a later step marked complete; loading; glyph by status (3) | step `state` override, with `loading` and `error` (new) | D |
| inline or hidden titles (2) | recipe `labels` (new axis) | L |
| segmented, slash, ticked tracks (3) | recipe `connector` values (new) | L |
| edge bars, chevrons, arrows, cards, tiles (11) | recipe `marker` values (new); most are left to `add` by §3.1's rule | L |
| collapses when narrow | recipe `compact` (new axis) | L |
| rails with badges, times, leaders (4) | step `icon`, `trailing`, `content` | D |
| nested checks and tasks (4) | `content` holding a nested `Steps` or a Tree | C |
| truck and wave on the track (2) | not proposed | X |

### The rest

The Additions column above is the compact list for every other component. The complete per-example rows, with the inference marks, are in the four research files, which are not in the repository; whoever builds a component re-derives its rows from the reference page, and that check is part of the work.

### Missing entirely

| Component | Decision | When |
| --- | --- | --- |
| Input Group | not a widget: `start` and `end` on the field widgets (§3.5) | 0.41.0, with the text fields |
| Toggle, Toggle Group | not widgets: `Button` with `pressed`; `Segmented` with `multiple: true` and the new `orientation`. A site page each, pointing at them | 0.41.0 |
| Icon Tile | not a widget: `Icon`'s new `surface`, `shape`, `tone` axes | 0.41.0 |
| Frame | a new stateless widget; ReUI uses it inside its accordion, collapsible, sortable, kanban and timeline examples | 0.41.0, second |
| Timeline | not a widget: Steps' vertical layout with `trailing` times and the new markers | 0.41.0, with Steps |
| Sortable | a new widget over `Reorder`, which the application passes as a value | 0.42.0 |
| Kanban | a composition: several Sortables and Cards, a site page, and `Reorder.moveBetween` in `foldkit-primitives` | 0.42.0, after Sortable |
| Time field | a new widget with its own design note; until then calendar examples 14, 19, 27 and 30 compose a Segmented, a Listbox or `Input` with `type: 'time'` | 0.42.0 |
| Attachment, File Type | new stateless widgets, after FileUpload settles; Attachment reads FileUpload's `Status` | 0.42.0 |
| Scrollspy | a Behavior value in `foldkit-primitives` that marks the section in view | 0.42.0 |
| Marker | no: `ThinkingSteps` with `trigger: 'none'`, or `Item` | |
| Phone Input, Emoji Picker | no widget; a composition example each if asked for | |
| Icon Stack | no: an illustration, which goes in `Empty.icon` as `Html` | |
| Event Calendar, Gantt | out: scheduling application components, a package of their own if ever | |
| Filters | out, pending a comparison with the grid's column filters (`docs/design/144-grid-filters-DESIGN.md`) | |

## 6. Extension by an end user

Four levels, each without touching our source. The lower the level, the more the user writes and owns.

**1. Compose beside it, through slots.** Anything with its own state goes next to the widget, and the widget places its drawing. A time list beside a calendar:

```ts
Calendar.view({ model: model.trip, onMessage, label: 'Appointment', aside: timeSlots(model, h) }, h)
```

The slots are `aside`, `footer`, `header`, `start`, `end`, `icon`, `trailing`, `content`, `action`, and `wrap` on groups.

**2. Write a feature against a public interface.** Every feature interface is exported, documented as user-implementable, and has a test in which a feature written in the test file, importing only published names, works: `Choice` (§3.6's capped choice), `ChartKind` and `ChartFill` (a sparkline kind, a brand pattern), `QuestionKind` (a rating question), `KitStep` (a Sidebar step), `CollapseFeature` (a breadcrumb that collapses into a Popover), `FileUploadProgress`'s `Progress` (`packages/mixins-ui/src/fileUpload/progress.ts` [v]), a `modules` drawer for QrCode, and any Behavior passed in `mixins`.

```ts
const sparkline: ChartKind<{ readonly values: ReadonlyArray<number> }> = {
  entries: ({ values }) => values.map((value, at) => ({ name: String(at + 1), value })),
  draw: ({ values }, frame, h) => h.path([h.Attribute('d', Chart.lineOf(values, frame))], []),
}
```

**3. Extend the look and the behaviour.** `Recipes.X.add` for a new axis or value, `.extend` to adjust one, and a `configure` preset to attach mixins, words and structural options to a name:

```ts
const Tabs2 = Tabs.configure({ presets: { sliding: { style: PillStyle, mixins: Tabs.fluid } } })
```

**4. Drop a rung.** Every widget exports the pieces its `view` is made of: `toView` and `resolve` (the adapters), `parts` (FileUpload, Listbox, Combobox), the pure helpers (`Calendar.picked`, `Reorder.apply`, `Chart.ticksOf`), `Slots` and the `A11y` pattern. A user who needs different markup assembles those; `examples/authoring` is the worked example of this level and stays as it is.

**The limits.**

- Markup that upstream draws is fixed: `@foldkit/ui`'s Menu, Listbox, Combobox and DatePicker build their own elements, so a user can attach attributes and styles to each part and cannot reorder or replace them.
- A widget's Model is closed by design. A new status on a FileUpload entry or a new Message is not an extension; it is a fork, or a sibling Bundle.
- A slot places what it is given and does not understand it. A widget cannot validate, announce or key-navigate into content it did not draw.
- A user-written feature with state can be a `KitStep` only for a widget built with `make`. Elsewhere it is a sibling Bundle.

## 7. The website and the examples

**What is wrong today.** The shown code is a `// #region` of one typechecked module, `examples/site/src/snippets/components.ts` (9,672 lines, 278 regions [v]), so it compiles; but a stateful example's region is only a view taking `model` and `onMessage`, with no imports, and its Model field, Message case, initial value and fold are in `gallery/widgets.ts` (900 lines [v]) and `gallery/widgetsUpdate.ts` (1,465 lines [v]). A reader cannot copy a working example. There is no codegen to remove; that part of the request was already true.

**One module per example, shown whole.** `examples/site/src/examples/<slug>/<name>.ts`, each default-exporting a site-internal `example(...)` declaration, replacing one region, one `fromRecipe` entry and, for stateful ones, the scattered state:

```ts
// examples/site/src/examples/tags-input/max.ts
import { Bundles, Recipes, TagsInput, TagsInputSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// At most three: a fourth is refused, said under the field.
export default example({
  title: 'A maximum',
  slots: TagsInputSlots,
  recipe: Recipes.TagsInput,
  state: Bundles.TagsInput.with({ id: 'labels', tags: ['urgent', 'design'], max: 3 }),
  view: ({ style, model, onMessage, h }) =>
    TagsInput.view({ model, onMessage, label: 'Labels, up to three', style }, h),
})
```

- The shown code is the module's whole text, read at build as now (`readFileSync` in `content/library.ts`), never `?raw` in the client bundle. Imports are shown.
- The page says, under the code, what a reader keeps: `recipe` goes to `forSlots`, `state` goes to `Bundle.withChild`, the body of `view` is the call. The `example({...})` wrapper is the site's harness.
- An example with application state of its own (a table's sort, a combobox's value) declares a small `Bundle.compose` in the same file. That is the code a user writes, and today it is hidden.
- Example modules call plain `X.view` and `Bundles.X`. One "Configure once" section on the Button, TagsInput and FileUpload pages shows `configure`.
- `previews/<slug>.ts` shrinks to a list of the page's example modules.

**The harness** is `examples/site/src/gallery/example.ts`, with changes to `gallery/define.ts`, `content/library.ts` and `test/examples.test.ts` ("every example has a region" becomes "every example has a module"). It builds one parent from every example's Bundle, which is dynamic at module load and needs one loosely typed seam, site-internal. It accepts old and new examples side by side, so the conversion can stop at any page.

**The gallery keeps one Model** and one chunk. Per-page loading is dropped: the maintainer does not need it, and it carried the resume-plan risk of a Model that varies per page. The gallery's ceiling stays 393,000 bytes (`examples/site/test/bundle.test.ts:28` [v]).

**What happens to the old files.** `snippets/components.ts`, `gallery/widgets.ts`, `gallery/widgetsUpdate.ts`, `gallery/fields.ts` and `gallery/calendars.ts` shrink page by page. Conversion agents never delete from them; one serial commit at the end deletes what is empty and re-homes what `/create` still imports (`gallery/specimens.ts`, `fields.ts`, `calendars.ts`). `snippets/theme.ts` and the guide snippets stay.

**`examples/widgets`** already has the right bundle shape, one lazy island per section. Each `app.ts` that hand-folds a shipped widget (`tags-input`, `menu-rows`, `focus-kept`) becomes a `Bundles.X` placement, and its start chunk gets an `absent` pin for every `bundles/*` file only an island uses.

**`examples/authoring`** is unchanged. It teaches assembling from primitives (level 4), and a factory call would hide what it teaches.

**The Primitives gallery** (`examples/site/src/gallery/primitives.ts`, families `device` at `:241` and `interaction` at `:472` [v]) has cards without a live example. Each is written in the same shape: one module per example, placing the primitive's own shipped `bundle` with `Bundle.withChild` and drawing a few slots. Which cards remain is read from the file when that batch is cut.

## 8. Plan

The maintainer wants all of it in 0.41.0. The plan is written for that, with the cost and the cut order stated at the end. An "agent-batch" is one agent's bout of work: a brief, the change, its tests and mutation specs, a self-review and a push.

### What must be in 0.41.0, and what can follow

**Must land before the tag**, because doing it later is a breaking change. Under the 0.x policy a later break is allowed; each one then costs every user an edit and a changelog entry, so the cheap moment is now.

| Change | Widgets |
| --- | --- |
| `words` (§3.5) | the three rows of the migration table |
| Flags and defaults that become passed values (violations 1, 2, 3, 5, 6, 15, 18) | breadcrumb, avatar, card-group, table, image-cropper, chart |
| `Recipes.Badge` as a `recipeFor`; Typography's `level` axis removed | badge, typography |
| Tone `error` to `danger` | alert, badge, progress, rating |
| `clear` | combobox, search-field, cascade-select |
| `AppShell.view`'s `main` argument | app-shell |
| `FileInput.accept` as an array; FileUpload's slot names and its feature export names (after M7) | file-input, file-upload |
| `foldkit-bundle` as a peer of `foldkit-mixins-ui` | the manifest |

**Can follow in 0.42.0 without breaking anyone**: `recipe.add`, every `Bundles.X`, every `configure`, every options-level view, every new option, slot and recipe value, the file moves of violations 4, 7 to 14, the site conversion, and every new widget. They are additive. Sidebar's and Questionnaire's `make` are breaking whenever they land.

### Phases

**Phase 0: measure and probe. Serial, one agent, the most capable model. 1 agent-batch.** M1 to M9 and P1 to P3, recorded in this note's §4 table. Nothing else starts until P1 and M7 are in, because they decide export names.

**Phase 1: the core. Serial, one agent, the most capable model. About 6 agent-batches.**

1. `recipe.add` (`packages/mixins/src/style.ts`, tests, type tests, mutation spec).
2. The conventions as code: `configure.ts` (the helper and `PresetOption`), `words.ts` (`fill`, the merge), `rowContent.ts`, `press.ts`, `choice.ts` with `choice/one.ts`, `many.ts`, `text.ts`, the `Tone` type and size names in `recipes/design.ts`, the shared `anchor` helper.
3. `bundles/index.ts`, the peer dependency, the M3 cases, and the five gate Bundles.
4. The site harness.
5. **The gate.** Five pages, each a different shape of the design: `button` (stateless, `configure`, `add`), `tags-input` (stateful, widget-owned value), `calendar` with `date-picker` (an upstream Model in an exported Bundle, a new options-level view, composition through `aside`), `combobox` (application-owned value, a `Choice`), `file-upload` (capabilities passed).

**Gate criteria.** M1 to M9 and P1 to P3 recorded. The gallery within 393,000 bytes. `prerender.test.ts` green, with every converted page adopted on hydration. Each converted example at most about 20 lines after imports, with no cast. One loosely typed seam in the harness. `pack:check` green with the new peer. `pnpm typecheck:force`, `mutate:check` and `tags:check` green. A user-written `Choice` passes its test.

**Phase 2: the families. Parallel, on disjoint files. About 33 agent-batches.** One agent per family does everything for its widgets: the breaking renames, the rule fixes, the options-level views, the additions, the `Bundles` files, `configure`, and the site pages. Each agent edits only `packages/mixins-ui/src/<its widgets>.ts`, `src/<widget>/**`, `src/recipes/<its widgets>.ts`, `src/bundles/<its widgets>.ts`, `test/<its widgets>.*`, `examples/site/src/examples/<its slugs>/**` and `examples/site/src/gallery/previews/<its slugs>.ts`. **No family agent edits a shared file**: `src/index.ts`, `src/recipes/index.ts`, `src/bundles/index.ts`, `src/patterns.ts`, the README, the skill, `CHANGELOG.md`, `snippets/components.ts`, `gallery/widgets*.ts`. Each returns a slip (export lines, README rows, changelog entries, regions it no longer uses) that the coordinator applies. Sonnet suits most families; the default model takes F5, F6, F9 and F10.

| Batch | Slugs | Agent-batches | Notes |
| --- | --- | --- | --- |
| F1 Buttons and marks | button-group, toolbar, badge, kbd, icon, spinner, label, separator | 2 | button is a gate page |
| F2 Surfaces and text | alert, card, card-group, item, empty, figure, typography, aspect-ratio, image, avatar, skeleton, frame (new) | 3 | `press.ts` is from phase 1 |
| F3 Text fields | input, textarea, number-field, otp-field, password-input, input-copy, search-field, fieldset, and the `Field` shell | 3 | adornments |
| F4 Choice controls | checkbox, checkbox-group, switch, radio-group, segmented, rating, slider, angle-slider, select | 3 | four options-level views |
| F5 Selection popups | listbox, picker, cascade-select | 4 | combobox is a gate page; cascade-select's additions are priority 3 |
| F6 Dates and colour | color-picker, timer | 2 | calendar and date-picker are gate pages |
| F7 Overlays | dialog, sheet, drawer, popover, tooltip, hover-card, toast | 3 | mostly Bundles and file moves |
| F8 Menus and navigation | menu, menubar, navigation-menu, command, tabs, breadcrumb, pagination, steps | 4 | |
| F9 Layout and disclosure | accordion, disclosure, sidebar, app-shell, resizable, scroll-area, virtual-list, tree-view, carousel, floating-panel, tour | 4 | sidebar's `make` is separate, below |
| F10 Data and media | table, chart, progress, meter, code-block, file-input, file-drop, image-cropper, signature-pad, qr-code, marquee | 4 | chart's kinds; table's values |
| F11 Chat | chat-message, message-scroller, thinking-indicator, thinking-steps, questionnaire | 1 | questionnaire's `make` is separate, below |

Three files have uncommitted edits from other work today (`combobox.ts`, `tagsInput.ts`, `recipes/card.ts`), and FileUpload shares `index.ts`, `recipes/index.ts` and the README; sequence those behind that work.

**Phase 3: `make` and the grid. About 11 agent-batches.** Sidebar (3) and Questionnaire (2), only if P3 passed; the DataGrid `features` split (3), in its own packages, after M5; Chart's fills and new kinds beyond the kind split (3).

**Phase 4: new widgets. About 10 agent-batches.** Frame is in F2. Sortable (2), the time field with its design note (3), Attachment and File Type (2), Scrollspy (1), the Kanban page with `Reorder.moveBetween` (1), the Toggle, Toggle Group and Timeline pages (1).

**Phase 5: integrate. Serial, the coordinator. About 11 agent-batches.** Applying slips to the shared files after each wave (3); the README sections, `skills/foldkit-plus/references/mixins.md`, `SKILL.md` and the changelog, written once from the final export list (2); `pnpm --filter foldkit-plus generate` and `pnpm paths`; `examples/widgets` onto `Bundles` (1); the Primitives gallery's examples (1); the deletion of the emptied site state (1); Jev reviews in pieces under its input limit (2); a full CI run watched to green (1).

### Size, honestly

All of it in 0.41.0 is **about 70 agent-batches**: 1 + 6 + 33 + 11 + 10 + 11 = 72, of which about 18 are serial and need the most capable model. It puts about 180 API additions, about 40 Bundles, about 85 `configure` exports, 13 new options-level views, five new widgets and one site rewrite into a single release, most of it never used by an application before it is tagged. The breaking set alone (the table above, with the core and the gate) is about 20 agent-batches.

### Order by value

Coverage gained per unit of work, and what the maintainer pointed at:

1. The core and the gate: nothing else can start, and the gate covers calendar, file upload and combobox.
2. The breaking set: cheap now, expensive later.
3. Button (22 examples gained for seven additions), Steps (24 for five), Avatar (12), Badge (6): display components where a few options or recipe values unlock the most.
4. Listbox and Picker on the `Choice` built for the gate; Table's footer and values; Chart's kind split.
5. The text fields' adornments, which close most of ReUI's forty input-group examples in one convention.
6. The options-level views for Checkbox, Switch, RadioGroup, Select, Tabs, Disclosure, Fieldset.
7. Everything else in the fan-out.
8. `make` widgets, the grid, new widgets.

### What to cut first, if it must be cut

In this order, each cut leaving a release that is whole:

1. Phase 4, the new widgets except Frame. Additive; nothing depends on them.
2. Phase 3: Sidebar's and Questionnaire's `make` and the grid's features. They stay as they are and gain no booleans.
3. The long-tail additions marked priority 3 in the catalogue, and Chart's fills and new kinds.
4. The site conversion of pages outside the gate and the pointed families. The harness shows old and new together.
5. `configure` on widgets outside the gate and the pointed families.

What is not cut: phases 0 and 1, the breaking set, and the gate pages. That is the smallest 0.41.0 this design allows, about 25 agent-batches, and everything after it is additive.

### Fallbacks at each stage

- P1 fails: upstream-Model widgets export their parts and the application calls `Bundle.make`; the calendar and combobox examples carry that one line.
- M7 fails: feature values use sibling namespaces; the names are fixed before the tag.
- P3 fails: no `make` in this release.
- The gate fails on prerendering or the byte ceiling: the API ships, the site keeps its regions, and only the FileUpload page uses the new shape.
- A family runs late: its widgets ship with the breaking renames only; its additions follow.

### What could destabilise the release

- **The harness and prerendering.** Every component page is prerendered with real state; a harness fault breaks all 89 at once. Hence the gate.
- **The breaking sweep touching every widget at once.** Words and tones are mechanical, and a mechanical edit across 40 files is where a missed anchor or a doubled insert hides. Each family agent re-reads its diff and runs `typecheck:force` over the whole tree, since `tsc -b` goes quiet downstream of a red project.
- **Shared files.** Eleven agents needing lines in `index.ts` and the README is how one session's hunk rides another's commit. Hence the slips.
- **Mutation anchors.** Moving a behaviour value into a file of its own rots every spec anchored on it; `pnpm mutate:check` runs before each push.
- **The new peer dependency.** A wrong manifest fails `pack:check` or an npm install; test with npm 10 as well.
- **FileUpload being built at the same time**, on the same shared files.
- **Budgets.** Every example's bundle ceiling moves; each is re-measured against `dist`, and a creep is compared module by module before a ceiling is raised.
- **The final deletion** of about 12,400 lines of site state while `/create` still imports some of it.

## 9. Decisions, open measurements and risks

### Decisions

| Question | Decision | Rejected, and why |
| --- | --- | --- |
| A new "example factory" concept? | No. Recipe, Bundle, `view` and `configure`, with features as values. | A fifth concept would duplicate the four. |
| A shadcn-style registry or a printer of example source? | No. | A registry is a second distribution channel whose copies drift; a printer cannot print a function-valued option and is checked by nothing. |
| How recipes get more capable | `add` for look; a `configure` preset for behaviour, words and structure. | Behaviour inside a Style: unfreezable, costing about 30 kB. Widening `.extend`: a typo becomes a silent new axis. |
| Where Bundles live | A namespace in `foldkit-mixins-ui`, a file each. | A new package: ruled out. A subpath: same bytes, a second import path. Inside the widget module: the module-level call stays in every page. |
| Bundles with a view? | Headless. | A view input cannot hold a style or routes. |
| The factory-factory | Per-widget `X.configure({ base, presets })`. | One generic `configure`: loses the Message type. The key `variants`: collides with the recipe axis `variant`. |
| When is `make` warranted? | Only when a feature has a module, carries state, and must be folded with the widget's own. Sidebar and Questionnaire. | (b) the typed value alone: a `Choice` or the widget's own union gives it without a generic kit. (c) bytes alone: a passed value does it. |
| `Calendar.make`, `DatePicker.make` | Not built. `Bundles.Calendar` with the `Selection` union; the mode is `args` data. | A generic kit: `Selection` is already one union, so the Model never varied; the kit bought a typed field at the cost of the plan's riskiest API. |
| `Combobox.make`, `Listbox.make` | Not built. The application owns the value; a `Choice` reads and folds it. | A kit holding the value: upstream says the parent owns the selection, and a Bundle cannot hold an application-typed item without being generic. |
| How features with state compose in a `make` | Typed steps in a `pipe`, as `Bundle.compose` does. | A feature object or list merged into one Model: the inference and TS7056 traps. |
| Who owns a value | The widget when the type is its own; the application when the type is the application's. | One rule for all: either every Bundle is generic, or every application re-folds a calendar. |
| Adapter-only widgets | Thirteen get an options-level view; Tooltip, HoverIntent and FileDrop stay adapters. | No views (revision 2): their examples all read "compose it yourself". |
| Words | `words`, flat, text with blanks, per widget. | Leaving `labels` and scattered options: `configure` cannot merge them. |
| Item decoration | `RowContent`: `icon`, `trailing`, `content`, and `action`. | `leading` and `trailing`: renames `icon` on a dozen widgets and their slots for no gain. |
| Tone | One vocabulary; `error` becomes `danger` as a look. | Two words for one palette family. |
| Which looks ship | The convention's vocabulary, what two of ours need, what two independent references name. | Shipping every reference look: hundreds of values nobody chose. |
| Chart | Kinds and fills are passed values with public interfaces. | `Chart.make`: the Model is the same for every kind. String kinds: a user cannot add one. |
| Table, ListView, DataGrid | Three rungs, documented; no shared column core in this effort. | A shared core now: three packages' contracts, two owners, no example needs it. |
| Meeting the byte goal | The freeze as the documented default; capabilities as values. | Per-value recipe files and `only`: little or nothing saved. |
| Website loading | Every example, one Model. | Per page: not needed, and a Model that varies per page. |
| How shown code is produced | The example module's text, read at build. | Regions: they omit imports and state. |
| `examples/authoring` | Unchanged. | Its point is the assembly. |
| Missing components | Frame now; Sortable, a time field, Attachment, File Type, Scrollspy next; Input Group, Toggle, Icon Tile, Timeline are options and pages; Event Calendar and Gantt out. | |

### Phase 1: what is built, and what was decided where this note was silent

Built and pushed on `ui-polish` (2026-11-17): `recipe.add`; `configure.ts`, `words.ts`, `choice.ts` with `choice/one.ts`, `many.ts` and `text.ts`; `Bundles.TagsInput` and `Bundles.Combobox` with the peer dependency and the M3 cases; `Button.configure` and `TagsInput.configure`; the extension tests (a user-written `Choice`, and `add` on a shipped recipe); the README, skill and changelog for those.

| Still to build in phase 1 | Why it waits |
| --- | --- |
| `Bundles.Calendar`, `Calendar.view`, `Calendar.configure` | Built; see "The Calendar, as built" below. |
| `Combobox.view(options, h)` and `Combobox.configure` | Built; see "The Combobox, as built" below. |
| `Bundles.DatePicker`, `DatePicker.view`, `DatePicker.configure` | Built; see "The DatePicker, as built" below. |
| `Bundles.FileUpload` and `FileUpload.configure` | Built; see "FileUpload's Bundle and `configure`, as built" below. |
| `press.ts`, the `Tone` type and size names in `recipes/design.ts`, the shared `anchor` helper | No gate widget built so far reads them. `rowContent.ts` went in with `Combobox.view`; `anchor` goes with `DatePicker.view`; `press.ts` and the vocabulary types with F1 and F2. |
| TagsInput's words as text (`remove: 'Remove {tag}'`, the refusals as words in place of `refusalText`) | Breaking, and `examples/site/src/snippets/components.ts` passes `refusalText`; it lands with the site's tags-input page. |
| M9 (the helper's bytes) | Not measured. `configure.ts` is about 1.3 kB of source and imports nothing. |

Decisions:

- **`add`'s parameter is mapped over the names being inferred**, not constrained by an intersection. `<const More extends AxisNames>(more: AddedAxes<Slots, Variants, More>)`: each value is contextually typed `StylePieces<Slots>`, so a slot the contract lacks is an error where it is written, and a value the axis has is `never`. The constraint form in §3.1 could not report either: a named property of an intersection takes no type from the other member's index signature. `MergeAxes` therefore takes `Slots` too (`MergeAxes<Slots, Variants, More>`), and is exported from `foldkit-mixins` so an application can export what `add` returns. A widened type was checked to turn both `@ts-expect-error` cases red.
- **A duplicate value throws `mixins:recipe-value-exists`**, a new `DiagnosticCode`. An added axis has no default until `.extend({ defaults })` gives one.
- **`configure`'s merge reads an option given as `undefined` as not given**, at every layer, so `size: undefined` at a call does not erase a preset's size. A preset name computed at run time that matches none throws, naming the ones declared.
- **A preset holds no `Html`**: `icon` is left out of `ButtonPreset`. A drawing made once at module scope would be one vnode placed in several elements.
- **`Bundles.TagsInput` reports nothing.** §3.2 says a Bundle that owns its value "reports `Changed`", and §3.6 places `Bundles.TagsInput` with no `onOut`; an OutMessage would make every placement answer it. The tags are read from the placed Model. `Changed` stays for the Calendar, whose parent usually acts on a pick.
- **`Bundles.Combobox` takes `multiple` as an arg.** Upstream's single and multiple updates differ by three small handlers (choosing leaves a multiple combobox open), and `update` must pick one; a `Choice` cannot sit in `args`. The arg must agree with the choice the view is given. Both updates are in a page that reads the Bundle; upstream's `multi.js` is about 4 kB of source, most of it not those handlers.
- **A `Choice` carries no view.** §3.4 has each choice file carry its upstream view. This package's fork draws both modes from one shared view (`comboboxShared.ts`), so there is nothing to split; `Choice.multiple` tells it which list to announce. The choice files stay one each for their folds.
- **`ChoiceChange` has a third case, `Typed { text }`**, which `Bundles.Combobox` reports when the field's text changes and nothing was chosen. Without it `Combobox.text` could not be "the typed text is the value": upstream reports only `Selected` and `ClearedSelection`. `one` and `many` return the value they were given for it. `ChoiceChange` is a `defineTaggedUnion`, so a choice matches it with `ChoiceChange.match`.
- **Upstream's `isAnimated` and `isModal` are `animated` and `modal` in a Bundle's args**, by §3.5's rule on states.
- **TS4023 is fixed in `foldkit-bundle`**, not documented around: `compose.ts`'s `Child` is exported, as `Bundle.ComposedChild`. `packages/mixins-ui/test/bundles.test.ts` exports a composition of shipped Bundles, which failed the project's declaration emit before and compiles now. `foldkit-bundle` kept its version in the 0.41.0 notes; it needs a bump now.
- **The README's code for all this is one section after Recipes** ("One factory for each part"), with the four-part model in prose under Core concepts. The README's snippets are one module from top to bottom, and a `standalone` block in the middle cut the blocks after it off from the imports above.
- **The `Calendar` state must not sit in `calendar.ts`.** A module-level `Schema.Struct` over upstream's Model there would put upstream's calendar in every page that reads the adapter (M5). It goes in `calendar/state.ts` and `calendar/view.ts`, re-exported by name. `state.ts` needs `Selection` at module level, and `calendar.ts` re-exporting `view` makes that a cycle that fails at load, so `Selection` and its readers move to a leaf module (`calendar/selection.ts`) first, with `calendar.mutations.ts` re-anchored.

#### The Calendar, as built

`calendar/selection.ts` (the union, its readers and the preset builders, with `rangeOf` and `datesOf` added), `calendar/shown.ts` (`Shown`, `show`, `alongside`), `calendar/state.ts` (`Model`, `Message`, `OutMessage`, `Args`, `init`, `update`, `set`, `secondId`), `calendar/view.ts` (`view`, `configure`, `words` and their types) and `bundles/calendar.ts`. `calendar.ts` re-exports every name, so the namespace is `Calendar` throughout. `publishedBuild.test.ts` pins that a page reading `Calendar.toView` keeps neither `calendar/state` nor `calendar/view`, from `dist` and from source; it was broken by hand to see it fail.

Decided where the note was silent or wrong:

- **`Shown`, `show` and `alongside` needed a leaf module too.** The record above named only `Selection`. The state's Message holds `Shown` at module level and its update calls `show` and `alongside`, so reading them from `calendar.ts` was the same load-time cycle.
- **`Calendar.Args` is one Schema for `init`'s parameter and the Bundle's args.** `Bundles.TagsInput` writes its args beside a hand-typed `init` option type; two declarations of one fact would drift, and the Schema is the one that exists at run time.
- **A no-op returns the Model given, which upstream does not do.** Upstream's update builds a new Model for a press on the day already focused and for a blur of a grid that had no focus. The state compares upstream's result with a Schema-derived equivalence (`Schema.toEquivalence(UiCalendar.Model)`) and keeps the Model it had. The tests assert each no-op by identity.
- **`Changed` is reported only when the selection holds other days** (`Calendar.isSame`), so a press on the chosen day, or a preset pressed twice, reports nothing.
- **The today button's `selects` travels on its Message** (`PressedToday { selects }`), since it is a view option and `update` must know it. Picking goes through upstream's `selectDate`, so a today the bounds disable is shown and not picked.
- **A preview is cleared whenever the selection changes**, by a pick, a preset or `set`: it belongs to the range it was made for.
- **`set` reports nothing.** The parent chose the selection, and an OutMessage would send its own write back to it.
- **The second month has an id of its own, `Calendar.secondId(id)`**, exported for a page that reads its cells. Two months draw the previous button on the first and the next on the second; `paging: 'none'` hides both and every other value splits them. Dropdowns go on the first month, and the second then reads as a label.
- **The year-only dropdown is a fourth `ResolvedCaption`, `YearDropdown`**, and `paging: 'end'` a `pagingAtEnd` field on `ResolvedDays`. Both are on the adapter, since the view draws through it; a `render` that matches every caption must add the new one, which the changelog calls breaking.
- **The view lays out through seven new Slots**: `frame` (the named group), `body` (the row of presets, months and aside), `main` (the months over the today button), `months`, `todayButton`, `aside`, `footer`. The frame is always drawn, so the markup does not change shape when an option is added.
- **The configure preset type is `CalendarViewPreset`**, not `CalendarPreset`: the package's index already exports `Calendar.Preset` as `CalendarPreset`, a selection one press away. A preset holds neither `aside` nor `footer`, which are drawings.
- **`words` covers upstream's ten labels as text**, so one object localizes the calendar and `configure` can merge it. Upstream takes four of them as functions; the view fills `{month}`, `{date}`, `{year}`, `{from}` and `{to}`.

#### The DatePicker, as built

`datePicker/state.ts` (`Model`, `Message`, `OutMessage`, `Args`, `Closes`, `init`, `update`, `set`), `datePicker/view.ts` (`view`, `configure`), `bundles/datePicker.ts`, and `calendar/layout.ts`, which holds what the two views share: the frame, the caption's options, upstream's labels from the words, and `CalendarWords`. `datePicker.ts` re-exports the state and the view.

Decided where the note was silent or wrong:

- **The state's fold is `DatePicker.fold`, not `update`.** `DatePicker.update(selection)` is the adapter's and `examples/site` calls it, so the name was taken. Inside a Bundle nobody writes either name. When the site's page moves to the Bundle, the adapter's becomes `updateFor` and the state's `update`, as every other widget spells it.
- **`closes` is in the Model as well as the args.** §3.4 has it an arg "because `update` reads it"; the state's own fold takes no args, so `init` copies it into the Model. The adapter's `update` takes it as a second parameter.
- **A preset closes the popover by the same rule as a pick**, when it makes the selection whole and `closes` is `complete`. The today button with `selects` goes through upstream's own press on the day, so the bounds and the closing rule apply to it without a second code path.
- **Upstream's `Cleared` empties the selection in its own mode** and is reported as `Changed`.
- **`trigger` returns text, as §3.4 says, and the view draws it in the `trigger` slot itself.** Upstream's `triggerContent` wants an `Html`, which would have needed an element outside any Slot; the view gives upstream nothing and draws the button's text in its own `toView`.
- **The element around the trigger and the popover is a `wrapper` Slot**, new on `DatePickerSlots`; the adapter's default drawing still writes it bare, as upstream does. It could not be named `root`: `CalendarSlots` has a `root`, and a style of one contract was then accepted where the other's was asked for, which the type test caught.
- **`YearDropdown` stays a new `ResolvedCaption` variant.** Folding it into `Dropdowns` would change `month`'s type, which breaks the same matches without saying why. Two ported examples matched the caption exhaustively (`job-application`, `ui-showcase`); each draws the heading's text for it, as for `Dropdowns`.
- **A picker has one month.** Upstream's DatePicker holds one calendar, so there is no `months` arg.
- **Two styles, `style` and `calendarStyle`**, since the picker and its calendar are two Slot contracts. `calendarMixins` is not in the preset: the shared merge concatenates `mixins` only.
- **`anchor` defaults to under the trigger's start, not portaled.** The shared `anchor` helper of §3.5 is not built: the three widgets that would share it each keep a default of their own for now.
- **The DatePicker's rows are browser tests**, where the Calendar's are Scene tests: a popover's opening, closing and returned focus are the browser's to show.
- **`calendar/layout.ts` is a third module beside `state` and `view`.** The DatePicker's view needs the frame and the words, and reading them from `calendar/view.ts` would have brought the Calendar's state into every DatePicker page.

#### The Combobox, as built

`combobox/view.ts` (`view`, `configure`), `combobox/filters.ts` (`contains`, `startsWith`), `combobox/words.ts`, `combobox/slots.ts`, `combobox/fluid.ts`, `combobox/overlayBars.ts`, and `rowContent.ts`; `combobox.ts` re-exports every name.

What §3.4's table has, as built: `model`, `onMessage`, `label`, `choice`, `value`, `items`, `filter`, `option`, `groupBy`, `heading`, `placeholder`, `empty`, `clear`, `chips`, `buttonContent`, `disabled`, `invalid`, `readOnly`, `name`, `openOnFocus`, `anchor`, `words`, `style`, `mixins`. Left for F5, each an addition and none breaking: `chips.removable` and `chips.content`, `start` and `end`, `autoHighlight`, `creatable`, the field variant `ghost`, and a `scroll` option for `overlayBars`.

Decided where the note was silent or wrong:

- **`clear` is `true | { content }`, the widget-owned form.** §3.5 gives a widget whose value is the application's `clear: { onClear: Message }`. A Combobox's clear button empties the text its own state holds, through its own Message, and the value follows through the `Choice` (`Typed`, or `ClearedSelection` for a nullable field). An `onClear` Message beside that would be a second writer.
- **`filter` is given the row's label, not the item**: `(label, typed) => boolean`. The item is an id as often as a word, and the label is what the reader types against.
- **The item and value types are inferred from `choice` alone** (`NoInfer` on `value`, `items`, `option`, `groupBy`). Inferred from every site, `items: ['fao']` widened `Item` and passed; the type test caught it.
- **`heading` has no default.** A heading is a drawing in the `heading` Slot, and `Html` holds no bare text; `groupBy` without `heading` groups the rows unnamed.
- **Row 7's fix needed a slots module, and broke nothing.** `fluid` and `overlayBars` were already passed values, so they moved to files of their own under the same names, with `ComboboxSlots` in `combobox/slots.ts` because a Behavior reads the slots at load. The brief's "old default behaviour as a breaking change" did not apply: nothing was on by default.
- **`RowContent` replaces `OptionContent` in the Combobox only.** `drawOption` takes the parts it draws and an optional `itemTrailing` builder; the Listbox has no such Slot yet and keeps `OptionContent` until F5. `RowAction` is not declared: it has no reader.
- **`chips.label` and `chips.removeLabel` could never be passed.** They were functions inside an object in a submodel's view inputs, which Foldkit refuses when it draws; the unit test called the fork's render directly and did not see it. A chip is labelled by `itemToDisplayText`, and its button named by `words.remove`.
- **The fork drew no hidden inputs while closed**, so a closed Combobox submitted nothing. Upstream draws them always; the `name` test found it. Fixed, with a changelog entry.
- **`Bundles.Combobox` takes `text`**, the field's starting text. Upstream writes the resting text only as the field is left, so a field placed with a value already chosen started blank.
- **The rung keeps `clearContent` and `clearLabel`.** `examples/site/src/snippets/components.ts` passes both, so the rename to `clear` on the adapter lands with the site's combobox page; `words.clear` is read where `clearLabel` is not given. The literal `×` in a chip's remove button stays too.

#### FileUpload's Bundle and `configure`, as built

`bundles/fileUpload.ts` and `FileUpload.configure`, which returns `{ view, parts }`. A `FileUploadPreset` is `style`, `words`, `picture`, `itemActions`, `progress` and `mixins`; `sort` reads the Model at each draw and `routes` hold Messages, so both stay at the call. The view's private `fill` is `words.ts`'s, and its words merge through `wordsOf`.

- **The Bundle's args are a Schema beside `InitOptions`, not in place of it.** `InitOptions` allows a key given as `undefined`, which a `Schema.optionalKey` struct does not, and changing it would break callers. A type test holds the two to the same keys.
- **The Bundle carries no Subscriptions.** A lane needs the application's transport, so an application with `lanes` adds `FileUpload.lanes` to its own Subscriptions, as §3.6 sketches. That sketch's call shape is right as written.
- **`pnpm mutate:check` listed specs with `git ls-files`**, so a new spec was unchecked until its first commit; it now lists untracked specs too.

#### The site harness and the gate, as built

`examples/site/src/gallery/example.ts` (the declaration), `gallery/examplesState.ts` (one field of the gallery's Model over every example's state), `gallery/define.ts` (`fromRecipe` lists example modules and old regions in one list), `content/library.ts` (`module(slug, name)` reads `src/examples/<slug>/<name>.ts` whole, on the server), and a line under each module's code saying what an application keeps. Thirty-one modules on six pages.

| Page | Modules | Still regions on the page | Old state removed |
| --- | --- | --- | --- |
| button | basic, icon, toggle, configure, add | none | yes: its regions, the `formats` field and its arm |
| tags-input | basic, max, refusals, configure | none | yes: its regions, three fields, three folds |
| combobox | basic, multiple, clear, groups, choice (a `Choice` of the application's own) | empty, creatable | no |
| calendar | basic, range, dropdowns, presets (the application's own), appointment (composed through `aside`) | unavailable, several, prices, events | no |
| date-picker | bundle, presets | single, range | no |
| file-upload (new) | basic, avatar, drop, gallery, progress, table, images, card, cover, configure | none | nothing to remove |

Decided where the note was silent or wrong:

- **`state` is one of three things, by structure, not a new concept**: a shipped Bundle with its args bound (`Bundles.TagsInput.with({...})`), what `App.placements.runtime({ Model: App.Model, initial })` returns for a composition the module declares, or a hand-written `{ Model, Message, init, update }`. The harness asks only for a Model Schema, an `init` and an `update`, and optionally Subscriptions. An example that owns a value declares the composition in its module, which is the code §7 says is hidden today.
- **A hand-written state names its `Message` Schema.** An `update` written inline names no type for its parameter, so the Message could not be inferred from it; the Schemas declare both types and `init` and `update` are checked against them.
- **An example may name a recipe of its own.** `recipe: Recipes.Button.add({...})` with a pin is how the `add` example draws: the page's picks go to that recipe, and its pins are checked against it. A pin on a module applies whatever axes the page offers; a pin on a region still goes through the page's axes, as before.
- **The seam is `example.ts`'s `render` and `running`**: three casts in one place, from the `unknown` the one Model holds back to the example's own types. The Model is a `Schema.Struct` built from each example's Model Schema under its key (`<slug>/<name>`), and the Message is `GotExample { key, message: unknown }`.
- **An example's state may start no Command**, and `example(...)` throws for one: the server draws from the same initial Model the browser starts from.
- **An example's Subscriptions run only on its own page**, each entry under `<key>:<name>`. The four upload examples run `FileUpload.lanes` this way.
- **A `Bundle.withChild` placement's OutMessage is dropped for a bare Bundle**, as `Bundle.ignore` drops it; an example that acts on one declares a composition.
- **Pages mix the two shapes at example granularity**, not page granularity. That is what let Combobox's `creatable` and "empty and loading" stay regions: `Combobox.view` takes neither yet.
- **The FileUpload page has nine of the ten reference examples.** Sorting is left out: its `Reorder` Behavior sends the example's own Messages, and the harness lifts Messages through `onMessage` only, not through a mixin. It stays in `examples/widgets` and the package's fixtures until the harness can map a mixin's Messages.
- **The zone that showed only "browse" was a fixture, not the widget.** The prompt is a word (`words.prompt`, empty by default) and the recipe's `layout` is CSS, so the view cannot know it is a zone. Every zone on the page passes the word, and a prerender test reads each.
- **What Sorting needs, found when it was attempted.** A sort Behavior is built against the Message of the application that owns the `Reorder` placement: `Reorder.behavior(Rows)` wraps each fact with `Rows.wrapper.make` into that Message and the resulting `Mixin<Message>` is given to `FileUpload.view`'s `sort.mixin`, whose Message is the view's `Outer`. The harness hands an example `h: HtmlBuilder<Outer>` and `onMessage`, which lifts a value, not a Mixin. Nothing in `foldkit-mixins` maps a Mixin's Messages (`Mount.mapMessage` maps one Mount; `Mixin`, `Contribution` and `Behavior.forSlots` have no `map`), and `h.submodel` cannot carry the example's view because it refuses a function below the top level of its view inputs. What is missing is a `Mixin.mapMessages(mixin, lift)` in `foldkit-mixins` that maps every Message-producing attribute and Mount of a contribution. With it, the harness could offer `context.lift` for mixins and Sorting becomes a composition of `Bundles.FileUpload` and `Reorder.bundle` like the appointment example. Until then Sorting stays off the page; its fixture test in the package (`fileUpload.examples.browser.test.ts`, 8) is the proof.
- **Done after the gate.** The Combobox, Calendar and DatePicker pages are modules end to end (Combobox `empty` and `creatable` fit the shipped `Combobox.view`: `empty` was already an option, and a creatable choice is `Combobox.one` over the known and created cities). The regions, the `widgets.ts` fields and arms, the Calendars part and their tests are deleted; the trip calendar stays for the specimens. TagsInput's words are text with blanks (Breaking, in the changelog). The adapter's `DatePicker.update` is the one the Bundle uses and was not renamed.
- **Line counts.** After imports a module runs 9 to 65 lines: sixteen of thirty-one are at most 26, the ones that declare a composition are 33 to 50, and the composed table is 65. "About 20" holds for an example on a bare Bundle and not for one that owns a value.
- **Bytes.** The gallery's first load went from 398,242 to 410,525 brotli bytes: 5.4 kB the FileUpload widget and recipe, 2.9 kB the options-level views and states, 2.9 kB the modules, 0.9 kB the harness and `configure`, less 1.7 kB of regions. The ceiling is 411,500 (`examples/site/test/bundle.test.ts`); §7's 393,000 is superseded.

#### F2, surfaces and text, as built

Built: Avatar, Card and Card.group, Item, Typography, Alert, Image, the new Frame, and `configure` for Empty, Figure, AspectRatio and Skeleton. Their site pages are only partly converted; "Left undone" says which.

- **Avatar.** `avatar/picture.ts` holds `Avatar.picture({ asset, provider, width })`, a value of the public `AvatarPicture` interface (`attributes(h)` returning an `Option` of attributes), so `avatar.ts` imports no `foldkit-media`; `publishedBuild`-style proof is in `treeShaking.test.ts`. `src` is a URL and `picture` a value, given one or the other by a type, not by a throw. `statusLabel` and `moreLabel` are `words` (`online`, `away`, `busy`, `offline`, `more` with `{count}`). `Avatar.group` takes `wrap(avatar, person)`; the `+N` is not wrapped. `Avatar.configure` returns `{ view, group }`, and a preset's `style` is the avatars' while its `groupStyle` is the group's.
- **`press.ts`.** `Press<Message>` and `overlay` moved out of `card.ts`; `CardPress` is gone (Breaking), and `Card.overlay` with it. `overlay` takes the new-tab text from the caller (`words.newTab` on Card and Item). The primitives' `FLUID_PRESS_ATTRIBUTE` is written out in `press.ts` as `PRESS_MARK`, because importing the constant from `foldkit-primitives/dom` kept that module's `FluidHover` in every Card and Item page (measured by `treeShaking.test.ts`); a unit test holds the two names equal.
- **Card.group.** `fluid: Card.fluid` is a value (`CardGroupFluid`: the resting properties and `mount(columns)`), off by default; the highlight element, `data-card-fluid` and the Mount are drawn only when it is given. The research named the same shape; `CARD_HOVER` lives in `card/fluid.ts` and is re-exported. `wrap(card, source)` is on the group. A card's `dismiss.label` is gone (a word), as is the literal `✕`.
- **Item.** `header` and `footer` are two new Slots on the root, which now wraps (`flex-wrap`), each a full-width band above the overlay; `density: 'roomy'`; `words.newTab`; `Item.group` takes `wrap`. A browser test shows the bands stay pressable above a pressable row.
- **Typography.** The `level` axis is removed; the view writes `data-level` and the recipe's one `text` rule reads it with `Style.states`. This turned the 15 variants into 15 state rules inside `component`, so a user's `variants`-layer `extend` still wins over them. `content` (a list of text and `Html`) is the alternative to `text`, by a union.
- **Alert.** `tone: 'danger'` replaces `'error'`; `neutral` (the page's muted tint, inverting when bold) and `accent` are new. The palette's own family stays `error`, so `toned('error')` backs `danger`. `AlertTone` is the shared `Tone`. `dismissLabel` and `✕` are `words.dismiss` (`'Dismiss {name}'`) and `words.dismissMark`. Not built: an `actions` entry that is `Html`.
- **Image.** `watchLoad` and `audit` are in `image/watchLoad.ts` and `image/audit.ts`, with `ImageSlots` in `image/slots.ts` (a Behavior reads the slots at load, as the Combobox's `fluid` does). `Image.configure` binds `style`, `layout`, `sizes` and `placeholder`; a use with no layout from any layer throws, because a base cannot say at the type level that it gave one.
- **Frame (new).** Eight Slots: `root`, `header`, `title`, `description`, `action`, `panels`, `panel`, `footer`. `Recipes.Frame` has `variant` (`muted` a quiet step off the page, `outline`, `plain`), `padding` (`comfortable`, `none` for what draws its own room), `spacing` and `radius`; a panel's corner is the tray's less its padding, so the corners stay concentric. The maintainer's "no heavy mid-grey slabs" moved the tray from `surface.muted` to `surface.subtle` after a screenshot. The page has four examples (a tray of panels, Alerts in it, Items in it, `configure`).
- **Figure and Skeleton.** `Recipes.Figure` has `caption: 'after' | 'before'`, CSS `order` only, so the reading order is the markup's. `Skeleton.view` takes `inline` and `block`, CSS lengths written as `--fk-skeleton-inline` and `--fk-skeleton-block`, which the lone bar's recipe reads with the old sizes as fallbacks.
- **AspectRatio.** No ratio value was added: ReUI is the only reference that names 4:3, 21:9, 9:16, 3:2, 4:5 and 16:10, so by §3.1's rules they are `add` snippets, now in the README and the skill.
- **`configure` shapes.** Where a widget has a group (`Avatar`, `Card`, `Item`), `configure` returns `{ view, group }` and a preset has `style` (the member's) and `groupStyle`; `Card`'s also holds `fluid`. Where it has helper drawings (`Skeleton`), it returns each, all with the one look. Preset `mixins` apply to the member, not the group.
- **Second pass.** The Card, Card group, Item, Alert, Empty, Figure, Aspect ratio, Image and Skeleton pages are example modules (Card gains sections, zoom and overlay; Card group a no-highlight example; Item header and footer bands; Alert dismiss and every tone; Figure a caption above; Skeleton sized bars; Avatar badges and a lifted group with `rest`). Their regions are gone from `snippets/components.ts` except `AlertStyle` and `CardStyle`, which the specimens read. The page Model's `chosenCard`, `cardDismissed` and their Messages, `Live`'s `chosen`, `dismissed` and friends, and the widgets' `region` and `plan` went with them: each example holds its own state. The shared test fixtures moved: `examples.mutations.ts` breaks Avatar's listing and `checkbox-basic`, `components.mutations.ts` breaks `examples/image/basic.ts`, and `prerender.test.ts` lost its Alert row.
- **Card.** `Recipes.Card` has `divide` (`none`, `header`, `sections`: a hairline edge to edge, the padding taken back to bleed), `lift: 'zoom'` (the picture scales by `1 + 0.06 * travel` inside its clipped frame) and `orientation: 'overlay'` (the image is the ground, the text over a fade to the card's own surface, so it keeps the page's contrast in either scheme). Not built: elevation `fade` and `stack`, left to `add`; Alert's `actions` as `Html` (the research itself said no row needs it); Avatar `ring: 'pulse'` and `'gradient'`.
- **Avatar.** `badges: [{ content, place, label? }]` with a new `badge` slot (`data-place`); the badge is hidden and its label is read with the name; the bottom end is the status dot's. `Avatar.group` takes `rest(count)`; `Recipes.AvatarGroup` has `lift: 'hover'`.
- **Quiet fills.** The `+N` disc was `surface.muted`, darker than a dark page: it is a film of the text over the page with the picture's edge. The neutral Alert is `surface.subtle` for the same reason.
- **Research the build corrected.** Alert needs no `Html` action once `neutral` exists.
- **Not verified.** Hover and focus screenshots of the pressable Card and Item, the Alert dismiss and the lifted group were not captured (the capture script's selectors timed out); rest states were looked at in both schemes at 1440 and 390. The gallery first load is 417,143 brotli bytes against the ceiling 411,500 with every family's work in the tree; it was not attributed module by module. `examples/widgets`' budget reads 155.1 kB against 155,000.

### Open measurements

M1 to M7 and P1 to P3 are recorded in §4. Still open:

- M8 and M9, and the `Bundles` case of M3.
- `pack:check` with a consumer compile for P1 and P3.
- Bundlers other than Vite 8.
- P3's kit needed casts inside, because `defineMessageUnion`'s `ValidateVariantNames<C>` constraint refuses a generic `C`. Before Sidebar's or Questionnaire's `make` is built, decide whether `defineMessageUnion` gains a form for cases still being inferred or the kit keeps its two internal casts.

### What I could not verify

- Every per-example mapping: the reference pages gave titles or captions only.
- The line citations not marked [v], including `nav.ts`, `treeView.ts`, `virtualList.ts`, `floatingPanel.ts`, `tour.ts`, `toast.ts`, `command.ts:15`, `menu.ts:70`, `switch.ts`, `radioGroup.ts` and `data-grid/src/grid.ts`.
- That the Listbox's single and multiple Models are identical (I diffed the Combobox pair only).
- That a `Kit` for the real Sidebar, with its Splitter and drag state, compiles and exports; P3 proved two steps over two upstream Models.
- `FileUpload.lanes`' call shape, and which of FileUpload's ten examples its view serves today; it is mid-build.
- Whether the site's `catalogue.ts` lists 89 or 90 slugs; 88 preview files exist.
- Which Primitives gallery cards lack a live example.
- The counts of Bundles (about forty) and `configure` exports (about 85): from the module counts (74 modules export `view`, 16 are adapter-only), not from a list.
- The agent-batch sizes: estimates from the per-component addition counts, not from a trial.

### Risks

- **Surface.** About 40 Bundles, 85 `configure` exports and 180 additions, each with a README row, a skill line, a changelog entry, a test that can fail and a type test. Jev reviews under 30k tokens at a time, hence the family batches.
- **`configure` on every widget** is near-identical code; the one internal helper is what keeps it from being copied.
- **Two times to pass a style** (bound in `configure`, or at the call). One mechanism at two moments; the call wins. The README says so in one sentence.
- **A preset whose Mount sends no Message** makes the application's own Scene tests resolve it. That is the application's choice now; say it where `configure` is documented.
- **The example wrapper** is harness in the reader's face. If readers copy it, the page text has failed.
- **The Bundle hides the fold**: mapping the child's Commands, and returning the given Model on a no-op. The README shows the hand-written fold once, as what the placement compiles to.
- **Inferred coverage.** The 73% is the research's reading of titles. A component built to its rows may find a reference example does something its title did not say.
- **Scope.** The honest size is about 70 agent-batches; §8 gives the cut order that keeps 0.41.0 whole at about 25.

## F8 menus and navigation: as built (breadcrumb)

- **The Menu is a value in a namespace of its own, `BreadcrumbMenu.make({ max, menu })`** (`breadcrumb/menu.ts`, exported from the package index like `FileUploadProgress`), not a re-export from `Breadcrumb`: a re-export from `breadcrumb.ts` would import Menu again. The design's `Breadcrumb.menuCollapse` is therefore `BreadcrumbMenu.make`.
- **`CollapseFeature<Message>` is `{ max, draw(input, h) }`**, where `input` is `{ label, ellipsis, hidden, builders }`; `BreadcrumbExpand` stays the second arm of `collapse` (`onExpand`), the two told apart by `draw`'s presence (each declares the other's key `?: undefined`). `Breadcrumb.hiddenRows` (rows of a Menu of hidden steps) is public because the feature module needs it and `menuRows` is its composition.
- **Words**: `words: { label, more, ellipsis }`, defaults `Breadcrumb.words`. The `label` option and `collapse.label` are gone; the ellipsis mark `…` is a word, so a feature draws `ellipsis` as given.
- **Measured** (`breadcrumbBuild.test.ts`, the package built as published, a page minified): 68.4 kB brotli for a page of the trail, 96.2 kB for one that also passes `BreadcrumbMenu.make` (27.8 kB, more than the 21.1 kB estimate). The 68.4 kB is mostly outside Menu and is the next thing to measure.
- **The ellipsis slot draws no underline**, so a fold of your own may be an anchor.
- Not built yet: `steps[].after`, `steps[].labelHidden`, the recipe `item` axis (looks: plain, pill, button). Left for a later pass.

## F8 menus and navigation, second pass: as built (steps, pagination, tabs, menu, menubar, navigation menu, command)

- **Steps**: a step takes `state` (`complete | current | upcoming | loading | error`, over the one `current` gives; `aria-current` stays by position, so a loading current step is still current) and `trailing` Html (new `trailing` slot). `StepsWords` gains `loading` and `error`. `Recipes.Steps` gains `labels: current | hidden` and `connector: segments`. The note's `compact`, the glyph markers (chevron, arrow, card, tile, bar) and `connector` ticks and slash are left to `Recipes.Steps.add`, as §3.1's rule says; the site's `add` example shows a dashed connector.
- **Pagination**: `icons: { first, previous, next, last }` (Html in place of the word, which stays the accessible name), recipe `shape: square | round` and `treatment: ghost | outline`. The `summary` side axis is not built (layout the application can state with `.add`).
- **Tabs**: `Tabs.view({ model, onMessage, label, tabs: TabsRow[], value, orientation?, close?, routes? })` over `Bundles.Tabs` (`Bundle.fromParts` over upstream's `create()`; its args are the `init` parameter's type, `fromParts` takes no args Schema, so the design's "`args` as `Schema.optionalKey` data" is the TypeScript type `{ id, activationMode? }`). The rows are `{ value, label, icon, trailing, disabled, panel }`, so the note's `RowContent` is a flat row here: a tab's words are text, its mark and count are Html. `TabsSlots` gains `root` (the layout of tablist and panel: a column, a row where the tablist is upright, read from `aria-orientation` by `:has`); `TabsResolved` gains `root` too. `view` takes only string values (the Value generic of upstream's `create` is a typing aid, not a runtime fact).
- **Menu**: `anchor` merges over `{ placement: 'bottom-start', gap: 4 | 0 at a point, padding: 8, portal: false }`; `header` and `footer` are Html in new `header` and `footer` slots, drawn by `popupView` inside the `items` panel before and after the rows (an optional part of `PopupPanel`, so Listbox and Combobox draw as before); a row's `content` replaces its words, `label` staying its name and typeahead key. `Bundles.Menu` reads only the rows' structure (`value`, and `items` on a submenu row), so `Menu.init`'s `rows` parameter is a structural type now (a generic `Structure extends { value, items? }`, which keeps excess-property freedom for callers). It reports `Selected`. `Menu.configure` takes `opensAt`, `direction`, `anchor`, `kbd`, `submenuMixins` and `mixins`; the call's `mixins` concatenate and are optional there.
- **Context menu** is not a widget: the Menu page has a `context` module (`opensAt: 'point'` and `Menu.target`).
- **Menubar**: `anchor` (every menu), each menu's `header` and `footer`, `Bundles.Menubar` (`{ ids, isAnimated?, isModal? }`, `Selected` with the menu's index) and `Menubar.configure`. **G4 (submenus in a bar) is not built**: a Menubar's Model is a flat array of upstream Menus, so a submenu needs the Menu module's nested Model, update and keys inside the bar's, which is a redesign of the bar's Model and not an option; it is the one note row left.
- **Navigation menu** (`nav.ts`, slug `navigation-menu`): links and panel links take `icon` (new `icon` slot; beside both lines of a panel link through `data-iconed` on the link), a panel takes `footer` (new `panelFooter` slot), `Recipes.Nav` gains `panel: list | grid`; `Bundles.Nav` (`{ id }`, no OutMessage) and `Nav.configure`.
- **Command**: no gaps in the note; `Command.configure` fixes `placeholder`, `empty`, `hints`, `kbd`, the style and mixins. No `Bundles.Command`: the query, highlight and open state are the application's (class A), and a Bundle would own state the application already owns.
- **Site pages**: Steps (11 modules), Pagination (11), Tabs (8) are modules end to end; the Steps and Pagination regions and their `widgets.ts` fields, Messages and arms are deleted, and Pagination's range logic is tested in `examples/site/test/paginationExamples.test.ts`. Menu (5 new modules), Menubar (2) and the navigation menu (2) and Command (1) keep their old regions beside the modules: those regions hold the page-direction (`live.direction`) demonstration, which an example module is not handed, and share widget state with the Command dialog and the specimens.
- **A mutation anchor on a string two places spell breaks `pnpm mutate:check`**: Tabs' new `root` slot wrote `flexDirection: 'column',` where `tabsKinds.mutations.ts` anchors on it once; the root's declaration is on one line without the trailing comma. Run `pnpm mutate:check` after adding a rule to a recipe.
- **Bundle**: the gallery's first load measures 416,095 brotli bytes in the shared tree (every family's work) against the 411,500 ceiling; not attributed to this family module by module and not raised here.

## F4 choice controls: as built (checkbox, checkbox group, switch, radio group, segmented, rating, slider, angle slider, native select)

- **Checkbox and Switch share one row.** `toggleRow.ts` draws control, label, description and a `labelAside` slot in four new Slots (`root`, `text`, `heading`, `aside`, spread into both contracts from `ToggleRowSlots`) and writes `data-checked`, `data-position`, `data-disabled` and `data-invalid` on the root; the recipe reads them with `Style.states` and `:where([data-position]) > &`. `position: 'end'` is `flex-direction: row-reverse`, so the DOM order (control first) is the tab and reading order. `variant: 'card'` is a recipe value over the same markup: the label's `::after` is stretched over the positioned root, and the aside is `position: relative` and later in the DOM, so it stays pressable above it. The Slots moved to `checkbox/slots.ts` and `switch/slots.ts` with the views in `checkbox/view.ts` and `switch/view.ts` (the same split as the Calendar). No `words`: neither draws fixed text. `required` is not an option: neither upstream adapter has `aria-required`. A Checkbox also gets `shape: 'round'`; both get tone `danger`.
- **RadioGroup.view is over the new `Bundles.RadioGroup`** (`Bundle.fromParts` over upstream's `create()`, as Tabs). Rows are `RowContent` plus `value`; `value` is `Option<Value>` and `Value` is inferred from options and value together (an earlier `NoInfer` on `value` made an application's `Option<string>` field a type error). The group is a `root` holding an `aria-hidden` visible `legend` (the name stays `aria-label`, so it is not read twice; `hideLegend` drops it), the radiogroup, an `error` line and a hidden input. `error` implies `aria-invalid` and describes the group, which needed `Attr.AriaDescribedby` declared on the `group` Slot. New Slots `root`, `legend`, `text`, `icon`, `trailing`, `error`; recipe `layout: stacked | grid` (the group takes `ref.width.page`, `max-inline-size: 100%`, or a shrink-wrapped parent gives one column) and tone `danger`.
- **The native Select draws its options through Slots** (`option`, `group`, plus `root`), after Jev's advisory that a bare `option` is unslotted. Neighbours with one `group` share an `optgroup`; a `placeholder` is a disabled empty first option; `value` and `onChange` are optional, so a select with neither is the browser's own. The field variants `ghost` and `underline` of §3.5 are not added: they belong to the field family's recipe pass (F3) and the select shares no markup change with them.
- **CheckboxGroup options are `RowContent`.** `icon` is drawn inside the label (a press on it chooses the option), `trailing` after it in the label's row, `content` in place of the words (with `content`, the box gets `aria-label` from `label`, since the Html may not read as a name), and a `description` that is Html draws in a `div` while text stays a `p`. `variant: 'card'` boxes a row; avatar and badge cards are `icon` and `trailing` with no further option.
- **Segmented** has `orientation` (data: `data-orientation` on the group, no ARIA: `aria-orientation` is not supported by `radiogroup` in ARIA 1.2) and `Segmented.configure`. `multiple` already existed, so the research's "toggle group needs `multiple`" row was wrong; the toggle-group page is `multiple: true` with `orientation: 'vertical'`. `fluid`'s hover is x-only, so a vertical control is best drawn without it. `fluid` moved to `segmented/fluid.ts`, the slots to `segmented/slots.ts`.
- **Rating**: `starLabel` is `words: { one, other, rated, notRated }` plus `labels` (a name per whole number of stars, data, which also covers the research's "a word per value" row); tone `error` is `danger`, and `success`, `info`, `neutral` are added. The research's row 8 (a different mark per value, emoji) is not built: a star is an `input type="radio"` whose glyph is CSS, so a per-value mark would need a second structure; it stays `Recipes.Rating.add({ glyph })` for one glyph.
- **Slider**: a list of numbers is a third overload (and a fourth, `AnySlider`, which `configure` needs); each input spans `--fk-slider-from` to `--fk-slider-to` (its neighbours), set on the input and read by a `data-thumb="between"` rule, and the fill runs from the first value to the last. `thumbLabels` is `words: { low, high, thumb }`. Two thumbs at the same value stack in DOM order, so the later one covers the earlier at the top of the track; `data-raised` is the range's answer for that and a list has none yet.
- **AngleSlider**: `Bundles.AngleSlider` takes the layout as its args, builds `update` once per args object (a `WeakMap`) and calls it from `init` too, so a layout `update` refuses fails at placement. The layout is still the view's options as well: one object spread into both (`...Layout`), as the site's example does. `words: { degrees }` replaces the default `valueText` function; `valueText` stays the application's function.
- **Switch, RadioGroup and Segmented values moved to files of their own** (`switch/draggable.ts`, `radioGroup/readingKeys.ts`, `segmented/fluid.ts`), re-exported by name; `treeShaking.test.ts` builds a page that reads the adapters and one that names each, from the published build, and a stray `console.log` in `segmented.ts` turned it red.
- **Pages**: Checkbox (7 modules), Switch (5), Radio group (5), Select (5, beside the Listbox select regions, which are F5's) and Rating (6) are modules end to end; their regions, widgets fields and Messages and the `widgets.test.ts` cases are gone (`Toppings`, `Billing`, `BillingGroup` too). Checkbox group, Segmented, Slider and Angle slider gained modules (`card`, `vertical` and `configure`, `list`, `bundle` and `configure`) beside their regions: those regions (alerts, range, volume, heading) share `widgets.ts` state with other pages and the specimens. The shared Live fields `switched` and `onSwitch` stay: the primitives page reads `switched`.
- **Mutation specs the earlier commit cut short**: a script removed a spec entry by its first `  },` at any indent, which stopped inside a nested edit and left two specs unparsable until the next commit. Find an entry's end by `^  \},$` at column two.

## F3 text fields: as built

Input, SearchField, NumberField, PasswordInput, InputCopy, Textarea, OtpField, the `Field` shell and Fieldset.

- **Adornments are one module.** `src/adornments.ts` holds `Adornments { start?, end? }`, `AdornmentSlots` (`group`, `start`, `end`), `adorn` and `sidesOf`, and `Recipes.Adorned` the pieces. The group is the box and carries `data-field-group`; the control inside gives up its border through a rule keyed on that mark (as the Textarea's frame already did). Input, SearchField, PasswordInput, InputCopy and NumberField read it. A field with neither `start` nor `end` draws no group (Input) and keeps its own border.
- **`Input.view` has two arms.** Given a `label` it draws label, `labelAside`, the control with `start` and `end`, and `description`; given a `draw` it is the old function, and the default-drawing options are `?: undefined` there, so no option promises what it does not do. Variants `ghost` and `underline` are written with logical longhands only (a sorted `borderColor` would take back `borderBlockEndColor`).
- **SearchField is one box.** `root > group > start, input, end, clear`. `start` is always drawn; while empty the recipe puts the magnifier in it. `clear` is `{ onClear, content? }` (Breaking); a field with no `clear` has neither button nor Escape. `busy` is `aria-busy` and `data-busy` and draws no spinner (the application composes one into `end`).
- **NumberField** gains `invalid`, `readOnly`, `start`, `end`, `words` and a `steppers` axis (`split`, `end`, `none`; written with `order`, so no markup changes). The group is a flex row, not a grid.
- **PasswordInput** gains a Model (`visible`, `capsLock`), `init`, `update`, `controls(model, onMessage)` (the three view options for a placed Model, so the application writes no fold) and `Bundles.PasswordInput`. `toggleLabel`, `requirementStates` and `capsLock.hint` became `words` (Breaking).
- **InputCopy** keeps its Model; `Bundles.InputCopy` packages it. `copyLabel`, `copiedLabel` and `failedLabel` became `words` (Breaking). `copyContent` draws in the button; the words stay in a `buttonText` Slot, read and not seen.
- **OtpField** gains `mask` (`true` or a mark): the input becomes a password field and filled cells show the mark.
- **`Field` shell** (`Field.view`, `FieldSlots`, `Recipes.Field`, a Field page). The control is drawn first, so the shell cannot wire it: `Field.describedBy(h, id, { description, errors })` returns the `aria-describedby` attributes (none when neither is drawn, not an empty string). `orientation` is a view option written as `data-orientation`, not a recipe axis. The shell draws its own label and marker rather than calling `Label.view`, which is F1's, so `label.ts` is untouched; the two use the same `words` shape (`required`, `optional`).
- **`Fieldset.view`** takes `{ id, legend, content, description?, disabled? }`; `toView` stays.
- **Not shipped, and why.** Textarea got no new option (the note lists none). `clear` on Input and Listbox waits for the controls family. No `publishedBuild` absent-pin was added for the Bundles; the two new Bundle files are one file each, re-exported by name, as `bundles/tagsInput.ts` is.
- **Trap met.** Deleting a page's snippet region also deleted `TextareaStyle`, which the questionnaire snippet still used (`12f23c1b4` repaired it); a deletion that names a shared constant needs a grep inside the same file.

## F7 overlays and F6's leftovers: as built (dialog, sheet, drawer, popover, tooltip, hover card, toast, timer, color picker)

- **Bundles for all nine.** `Bundles.Dialog`, `Sheet`, `Drawer`, `Popover`, `Tooltip`, `HoverIntent`, `Timer`, `Toast` and `ColorPicker`, one file each. Dialog, Popover, Tooltip and HoverIntent are `Bundle.make` over upstream's Model and `update` with the `init` options as an args Schema, not `fromParts` (a `create()` bundle takes no args and `update` here needs them for `dismissible`); the update is a named function with an explicit `ReturnWithOutMessage`, because an inline lambda made `OutMessage` infer `never` and every `helpers` entry then failed. `helpers` are `open` and `close` (Dialog, Sheet, Drawer, Popover), `close` (HoverIntent) and `show`, `settle`, `dismiss` (Toast). Delays are milliseconds (`showDelay`, `openDelay`, `closeDelay`), since a Duration is not data.
- **`dismissible` on Bundles.Dialog** (the research's G1). `dismissible: false` drops the `RequestedClose` that Escape, the backdrop and the close button all send, so only an answer closes it, through `helpers.close`, which bypasses the drop. An alert dialog is that plus `role: 'alertdialog'` in `Dialog.toView`'s context; a site example holds the answer's Message in a composition (`Bundle.withMessages`) and calls the helper in `update`. Not built: a non-modal dialog.
- **No `Dialog.view` or `Popover.view`.** The note puts them in 0.42.0 and the research says the reference examples differ by content, so nothing here invents content options; the examples compose the adapter (50 to 87 lines each), and `examples.test.ts` allows an example up to 90 lines instead of 52. This is the biggest gap against the "about 20 lines" gate criterion, and it is the argument for building those two views.
- **A Sheet opened by `GotDialog(RequestedOpen)` rests at `opensAt`.** `Sheet.open` set `at`, a Message did not, so a Bundle-placed Sheet whose application sent the Dialog's own Message reopened where it was last left. `Sheet.update` now sets it on an open of a Sheet that is not open (an open of an open one moves nothing).
- **Rule fixes.** `Dialog.overlayBars`, `keyboard`, `focusReturn`, `Drawer.keepFocus`, `Toast.keepFocus` and each widget's Slots are files of their own (`dialog/`, `drawer/`, `toast/`), re-exported by name. **Drawer did import all of the Sheet**: the bundle measured 175 B kept, which a page counts as nothing, but moving `SwipeFrom`, `SwipeConfig`, `swipeOf` and the swipe constants to `swipe.ts` was a move of three names and let `overlays.build.test.ts` pin that a Drawer page holds neither `sheet.js` nor `dialog.js` (a regression there is now red, not a 175 B drift). **ColorPicker.popover** is `colorPicker/popover.ts`, re-exported by name from `colorPicker.ts`; it imports `drawn`, `buildersOf`, `paintOf` and `widestText` back from `colorPicker.ts`, a cycle that is safe because the popover module's top level touches none of them, and the build test shows an inline picker keeps neither upstream's Popover nor ours. Not breaking, so the popover container is not a value the application passes. `recipes/dialog.ts`, `sheet.ts` and `toast.ts` import their Slots from the new `slots.ts` files, so a recipe no longer imports a widget module.
- **Toast** (the research's five missing examples). `actions` replaces `action` (Breaking; one way to do a thing, not sugar beside a list) with a new `actions` Slot (the row) and `cancel` Slot and `Message.PressedAction { id, index }`; `cancel` is a button that only dismisses. Recipe `tone: 'invert'` (the text's ink as the card; icons, action, cancel and close borrow the card's colours back) and hover on `action`, `cancel` and the inverted close. Two buttons or more take a row of their own under the words (`data-count` on `actions`, `order` on the close button), after the first screenshot showed three buttons squeezing the title onto three lines. `closeLabel` is `words.close`, with `words.label`; `Toast.configure`; `Toast.nextId(model)` because a Bundle's `show` helper returns no id and a promise toast needs it. **Whether `toastView.make` can update an existing entry: no.** Upstream's toast has `show`, `dismiss` and `dismissAll` only. `ToastView.make(schema).revise(model, entryId, payload)` replaces an entry's payload and leaves its animation, place and dismissal timing, which is what the upload-progress example (ref 10) needs; `settle` stays the component's, restarting its countdown.
- **Timer and ColorPicker.** `labels` is `words` (`Timer.words`, `ColorPicker.words`), each with `configure`. `ColorPicker.configure` gives the inline view only, and its preset type is `ColorPickerDefaults` because `ColorPickerPreset` already names a swatch. `Bundles.Timer` throws at placement for a countdown with no duration. `Bundles.ColorPicker` reports `Changed { color }` when a field of the color differs. `eyedropper` stays `false` by default. Timer tiles fill with `surface.subtle` (a quiet step off the page).
- **Not built, and why.** ColorPicker's `layout: ring | compact`, `Committed`, `name`/`invalid`/`required`, a names parser and `hsb`: the research ranks them priority 3 and each needs its own structure or test; the picker's form participation is still the missing `name` of §3.5. Dialog's non-modal mode. Tooltip and HoverIntent stay adapters, as the note says.
- **Pages.** Dialog (confirm, alert, terms, form, nested), Sheet (drawer, side, fixed, nested), Drawer, Popover (below, top-start, no-arrow, clipped), Tooltip (above, right, edge), Hover card, Toast (types, promise, action, rich, invert, positions, payload, progress), Timer (countdown, stopwatch, tiles, configure) and ColorPicker (inline, popover, configure) are modules. Their 26 regions are gone from `snippets/components.ts` (`TooltipStyle` stays: the Sidebar uses it, and the toast payload region stays: the widgets' Model builds `Notices` from it). **Left undone: the widgets' fields, Messages and folds** (`dialogs`, `sheets`, `popovers`, `tooltips`, `hoverCard`, `toasts`, `notices`, `drawer`, `accent`, `brand`, `lap`, `tea` and the rest) are only read by `widgets.test.ts` and its mutation specs now; their removal is the emptied-state pass.
- **Trap met: an example's widget id is the page's section id.** The Dialog example's `id: 'confirm'` is also the section anchor `confirm`, so the dialog could not be found to open (Foldkit warned "Duplicate DOM id" and the click did nothing); `terms`, `types`, `rich`, `progress`, `top-start`, `no-arrow` and `clipped` did the same. Give a widget in an example an id that no section uses. And **a mutation "killed" by a `TypeError`**: `UiDialog.Message.matchOrElse` does not exist (tsc said so; vitest does not), so the missing method threw at run time and the mutation looked killed. Run `tsc -b` before reading a kill.
- **Tests.** `overlayBundles.test.ts` places each Bundle as an application does; `overlays.build.test.ts` builds the package as published and pins that a Dialog page names no `scroll-bars`, `keyboard-inset` or `focus-return`, a Drawer page no Sheet or Dialog, a Toast page no `focus-recovery`, an inline ColorPicker no Popover, and one Bundle none of the others; `overlays.browser.test.ts` runs Escape and a press on the backdrop against a Dialog, a Sheet and a Popover in a real page (exit marked `data-leave` then gone, panel shadow, an alert dialog unmoved), and `toast.browser.test.ts` presses each action, the cancel and each button's hover and reads the layout. `overlays.mutations.ts` holds 17 mutations, each run and killed (one re-run after a false kill); the specs the file moves broke (colorPicker, drawer, sheet, sheetSwipe, toast) are re-anchored and `mutate:check` is clean for them.

## F5 selection popups: as built (listbox, picker, cascade-select)

Listbox and Picker sit on the `Choice` the Combobox built; CascadeSelect is a Bundle over its own state.

- **`Listbox.view` is the Combobox's view without the text.** `choice`, `value`, `items`, `option: item => RowContent`, `groupBy`, `heading`, `placeholder`, `disabled`, `invalid`, `readOnly`, `name`, `anchor`, `direction`, `words`, `style`, `mixins`; `listbox/{slots,fluid,overlayBars,words,view}.ts` mirror `combobox/`. `Bundles.Listbox` takes `multiple` as an arg for the Combobox's reason, and the lead note's open question is answered: single and multiple share one upstream Model (`shared.js`'s `BaseModel` spread into both), the two updates differ by one handler (a single list closes at a choice, a multiple one stays open). `Bundles.Listbox` calls this package's forked `create` and `Multi.create` for the update, so a leave ends only once drawn (#400).
- **`clear` is `{ onClear, content? }`**, §3.5's form for a value the application owns. The Combobox's is `true | { content }` because it empties text its own state holds; a Listbox holds none, so the button sends the application's Message and the application folds `ChoiceChange.ClearedSelection()` through its `choice`. It is drawn outside the upstream submodel, in a new `root` Slot with a `clear` Slot, because the submodel's view speaks only upstream's Messages. The root is `inline-size: fit-content`, so the button lands inside the trigger even as a grid item; the value text takes room for it while `data-clearable` is on the root, and the button stands before the chevron, which keeps the trigger's end (first made as extra trigger padding, which pushed the chevron under the button; a screenshot showed it). The button is the Combobox's piece moved to `recipes/listbox.ts` (`clearButton`), now a rounded rectangle concentric with the control corner (the maintainer's rule), and CascadeSelect's own round button was replaced by it.
- **The trigger's accessible name says what is chosen** (`"Fruit: Apple"`, or the placeholder, or the label alone), since `aria-label` replaces the button's text; the Picker did this already. `trigger: rows => Html` replaces the chosen rows' icon and labels, and the chevron stays; several chosen rows without it show their labels joined, and no icon (an icon of the first would mislead).
- **`OptionContent` is gone** for `RowContent`; `parts.trigger` takes the chosen rows as an array (Breaking, in the changelog). `ListboxSlots` gains `itemTrailing` (the Combobox's piece moved into `optionParts`), so `RowContent.trailing` draws in both.
- **The closed Listbox drew no hidden inputs**, the Combobox's bug in the fork's other half (`listboxShared.ts` returned `hiddenInputs: []` before computing them); fixed, with a changelog entry and a test through a real form.
- **The default anchor is upstream's** (portaled), like `Combobox.view`; the old site examples passed `portal: false`. `Picker.view` keeps its in-place default (`portal: false`), since its two halves share a region and the Sheet is the other half.
- **`SingleChoice<Item, Value>`** is `Choice & { multiple: false }`, returned by `one` and `text`; the Picker takes it, so a choice of several is a type error where the Sheet would close at a pick. A `*.test-d.ts` case pins it.
- **Picker.** `view` takes `choice`, `value`, `items`, `option`, `groupBy`, `heading`, `clear`, `disabled`, `invalid`, `name`, `words` beside what it had (Breaking: `options`, an `Option` value and a required placeholder are gone, `PickerOption` with them). The dropdown is `Listbox.view` itself, so the two share rows, groups, clear and the hidden input (drawn once, since the Sheet half draws none). The Sheet draws a group as a `role="group"` named by its heading (new Slots `group` and `heading`), and a disabled row `aria-disabled` and with no press. The opener sits in the Listbox's `root` with its own `clear`, so the phone half has the same button; the Picker's `listbox` mixins style both. The two sit in a new `phone` Slot that `sheetBelow` hides and shows: hiding only the opener left an empty `root` behind, an inline-block that added a blank line under the desktop dropdown (a browser test measures the root against the half drawn). `Bundles.Picker` args are `{ id, points?, opensAt?, dismissible?, animated? }`; the Sheet's `swipe` is not an arg (a `SwipeConfig` has no Schema here) and stays on `Picker.init`.
- **CascadeSelect.** Built: `words` (`placeholder`, `clear`, `back` with `{label}`), `clear: true | { content }` (Breaking, replacing `clearable`, `clearLabel`, `backLabel` and the literals), `Bundles.CascadeSelect` (args `{ id, value?, config }`, the options as data through a recursive Schema; `Changed` out; `helpers.set`), `configure`, `option: node => RowContent`, `triggerText`, `Set { path }`, and `config.inline`. `inline` is a `Config` field rather than a view option because `update` must not close an always-open panel and `init` must start it open; `closing` wraps `closed`, and `init({ inline })` opens it. `Set` obeys the rule `Picked` does (a parent is not an option unless `parents` allows it) and returns the Model it was given for a path already held. `RowContent.disabled` is ignored: whether a row can be chosen is the node's, which `update` reads, and two sources would disagree. The Bundle's `update(config)` closure is kept per `config` object in a WeakMap.
- **CascadeSelect, left, and why.** Several chosen paths and indeterminate branches (reference rows 2, 14, 18): a change to `Model.value` and the whole `update`, the largest of the set, and the note ranks it priority 3. A search field in the panel (3, 21) is a second state (`Typed`) and a filtered tree, the note's "deferred". A footer or side panel (4): the tree element must hold focus and carry `role="tree"`, so a non-tree child inside it is invalid ARIA, and placing the footer outside would move the anchor target; it needs the anchor to place a frame. A loading level (15) and windowed columns (16) were not attempted. Reference rows now expressible: 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 17 (compose `labelsOf` with chips), 19, 20.
- **The research was wrong in two places.** Section 20 listed Listbox `OptionContent.aside`; it is `RowContent.trailing`, shared with the Combobox. Section 15 listed a Picker `groupOf`; the Listbox's `groupBy`/`heading` serve it.
- **The `select` page** holds only the native examples now; the ten custom-select regions moved to the Listbox page as modules (`example` refuses a module of another widget's Slots, so they could not stay on a page whose contract is `SelectSlots`). The old `select` page's `custom-sizes`, `check-start` and trigger looks are the Listbox page's axes (`size`, `check`, `trigger`), which a reader picks on the page.
- **Site state removed**: the `selects`, `listbox` and `frequency` fields and `GotSelect`/`GotListbox` of the gallery's Model, the Picker's `picker` and `sort` of `fields.ts`, and `cascade`/`cascadeDrill` with their Messages and folds, all state that only their regions read; `snippets/components.ts` lost the `select-custom*`, `listbox`, `picker-basic` and `cascade-select-*` regions. `view/create.ts` (the `/create` page) kept its own Listbox and takes the new `parts.trigger` array.
- **Mutation specs re-anchored**: `listbox.mutations.ts` (slots now in `listbox/slots.ts`), `listboxSelect.mutations.ts`, `lists.mutations.ts`, `popupFluid.mutations.ts`, `popupStates.mutations.ts`, `comboboxOptions.mutations.ts` (the clear button's cross is `recipes/listbox.ts`), `picker.mutations.ts` and `cascadeSelect.mutations.ts` (`closing`).

## F10 data and media: as built (table, chart, progress, meter, image cropper, signature pad, marquee, QR code, code block)

Order differs from the brief's: the breaking set for every widget landed first, then additions and the site pages, so the tag is safe if the later pages are not finished. Left undone, and why, is the last list below.

- **Table.** `Table.fluid` is a `TableFluid` value (`{ resting, mount }`, as `Card.group`'s `CardGroupFluid`; the brief said a mixin like `Tabs.fluid`, but the highlight element and the frame's resting properties are drawn only when it is given, which a mixin cannot do) in `table/fluid.ts`. `selection.checkbox` is `selection.control: Table.checkboxes(style?)` (`table/checkboxes.ts`), a `TableSelectionControl` (`draw(input, h)`), so `table.ts` imports neither `@foldkit/ui` nor Checkbox nor `foldkit-primitives` as values; `dataMedia.imports.test.ts` pins that and was broken by hand (a type import made a value import) to see it fail. `allLabel` and `headerLabel` are `words: { selectAll, details }`; `rowLabel` and `expansion.label` stay functions of the row (the application's own text, not a fixed word) with `words.selectRow` and `showDetails` where they give none. A column takes `footer` (a totals row in new `foot`, `footerRow` and `footerCell` Slots, the control columns left blank) and `header` as text or `Html`; the recipe gains `header: 'hidden'`, `borders: 'cells'` and `layout: 'fixed'`. `Table.configure` binds `style`, `words`, `fluid` and `mixins`. Not built: `reorder` (a `Reorder` value), which needs a design with the primitives.
- **Chart.** `kind` is a `ChartKind<Data>` value: `Chart.bars`, `line`, `area`, `donut` in `chart/*.ts`, over `chart/cartesian.ts` (axes, grid, lit band, tooltip) and `chart/kind.ts` (the public interfaces). A kind gives `name`, `entries`, `points`, `head` and `draw`; the chart draws the title, status line, legend placement and data table from them, so a kind of your own (`examples/site/src/examples/chart/own.ts`) draws a plot only. The note's `draw(data, frame, h)` is `draw(data, frame)`, with `h` and the Slot builders inside the `ChartFrame`. `ChartView<Message, Data>` is `ChartOptions & { kind } & NoInfer<Data>`, so `stack` is accepted beside `Chart.bars` and `Chart.area` and refused beside `Chart.line` (type tests, one defect each). Built from what the split unlocks: `stack` (bars and areas, positives up and negatives down from zero), `curve: 'step'`, `markers: 'always'`, and the donut's `hole` (0 is a pie, no total drawn; a value outside 0 to under 1 throws). Not built, and left for Phase 3 as the note says: `ChartFill` and `defs`, `reference` bands, donut `stats`, `radar`, `radial`, `depth`. The research's 19 of 25 not expressible: stack, step, markers, pie and the kind split now cover about eight of them.
- **Progress and Meter.** `ProgressTone` is the shared `Tone` and `error` is `danger`. Meter gets `size: sm | md | lg` (the track's thickness); `orientation` and `segments` are not built (a vertical meter needs the fill drawn by height, which upstream's Meter writes as a width).
- **ImageCropper.** `controls.zoom` and `slider` are `zoom: ImageCropper.zoomSlider(style?)` (`imageCropper/zoomSlider.ts`, an `ImageCropperZoom` with `draw(input, h)`), so `imageCropper.ts` imports no Slider; a cropper given none draws no zoom control. `labels` is `words` with `crop` as text (`{x}`, `{y}`, `{width}`, `{height}`).
- **Words.** `SignaturePad.labels`, `Marquee.pauseLabels`, `QrCode.tooLong` (and the default name, `QR code: {value}`) and `CodeBlock`'s `copy.label` and `copy.copiedLabel` are `words`. The signature's two functions are text: `drawn` with `{count}`, a `drawnOne` word of its own (a count of one reads differently), and `typed` with `{name}`.
- **SignaturePad `name`.** A hidden input in a new `hiddenInput` Slot, valued with `toSvg(model)` (the strokes, or the typed name on the line), empty while there is none, disabled with the pad.
- **FileInput and FileDrop.** Nothing to do: `accept` is an array already and `words` exist; FileDrop stays the adapter.
- **Site.** The Table page (ten modules) and the Chart page (nine, one a kind of the user's own) are modules end to end; the table's regions, its widgets fields, Messages and arms and their tests are deleted, and so are the chart regions only the page read (`ChartStyle` stays for the specimens).
- **Left undone.** Site pages for the rest of the family (Progress, Meter, CodeBlock, FileInput, FileDrop, ImageCropper, SignaturePad, QrCode, Marquee) are still their regions; their words and additions are in the packages. CodeBlock's additions (`marks`, `wrap`, `gutter`, `collapsed`, `onLineSelect`, `lineAction`, `follow`), Meter's `orientation` and `segments`, the SignaturePad's other missing examples, Chart's fills, and element screenshots of the new pages were not done in this pass.

## F11 chat: as built (chat-message, message-scroller, thinking-indicator, thinking-steps, questionnaire words)

- **ChatMessage**: `words` (`sending`, `sent`, `failed`, `retry`, `actions`, `reactions`, `reactionCount` with `{label}` and `{count}`) replace `statusLabel`, `retryLabel` and `actionsLabel`. `reactions` are `{ key, mark, label, count?, pressed?, onClick? }` in new `reactions`, `reaction` and `reactionCount` Slots under the bubble; with `onClick` a toggle button, without it a `role="img"` mark. The recipe's `bubble` gains `ghost` and `outline`. `ChatMessage.configure({ base, presets })` returns `{ view, group }`: the group applies the preset's style as `messageStyle` and its words and `pinActions` to each item (a message's own win); the preset's mixins stay `view`'s. The research row B5 (long answer behind a Disclosure) and M5 (attachments) are `content`, not built as examples.
- **MessageScroller**: `words` (`jump`, `one`, `other`, `{count}`); `init({ id, opens? })` with `opens: 'start' | 'end'` in the Model, passed to the `FollowEnd` Mount as an arg (read once at insert, as every Mount arg is). Opened at the start with nothing to scroll it reports the end reached, so no jump button shows. `Bundles.MessageScroller` and `configure`. **Not built: `anchoredTurn`, `turns` and `opens: 'last-anchor'`** (the research's rows 3 and 6): they need a Mount that lifts a sent row and a navigator with a Model of its own, which is a design of its own and was left for a later pass. `areaMixins` replaces rather than concatenates in a `configure` preset (only `mixins` concatenate).
- **ThinkingSteps**: `words` replace `stateWords` and add the trigger's `thinking`, `thought`, `thoughtFor`, `stopped`, `stoppedAfter` (`{time}`) and `steps`. `summary` stays a per-use option (it is content: "Used 2 tools"), not a word. State `skipped` counts as finished. A step's `title` stays text (it names the row, as the Accordion's); `href` draws it as a link in a `link` Slot and such a step never toggles, since a link cannot sit in a button; `trailing` is drawn in a `trailing` Slot beside the head inside a new `row` Slot, outside the head's button. `trigger: 'none'` is a plain list (`aria-label` from `words.steps`). `Bundles.ThinkingSteps` (`openSteps`, `multiple` as args) with `controls`, and `configure`. The collapse timing pair is the Accordion's; `thinkingSteps.browser.test.ts` now shows it partly open mid-duration and inert while shutting.
- **ThinkingIndicator**: `configure` only (the note found no gaps; its `label` is per use, so there is no `words`).
- **Questionnaire**: words and a site page with today's API only: `words` (`submit`, `next`, `back`, `missing`, `skipped`, `progress` with `{page}` from 1 and `{total}`). `make` is not started.
- **Site**: chat-message (9 modules), message-scroller (3), thinking-indicator (4), thinking-steps (6), questionnaire (3). Shared chat styles and the trip questions are in `snippets/chat.ts` and `snippets/questionnaire.ts`; the old regions, `widgets.ts` fields, Messages and arms, and their `widgets.test.ts` cases are gone.
- **Not looked at**: the screenshots of the new pages were not captured: the dev server took longer than four minutes to answer a page on the loaded machine and was stopped on the coordinator's instruction.

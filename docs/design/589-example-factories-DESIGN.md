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
// args (data)
{ id, today, selection?: Selection /* default Calendar.empty('Single') */, months?: 1 | 2,
  minDate?, maxDate?, disabledDaysOfWeek?, disabledDates?, locale? }
// OutMessage
Changed { selection: Selection }
// helper
set(selection)
```

`Calendar.view(options, h)` is the new options-level view over that Model; `toView`, `inputs`, `picked`, `show`, `alongside` and `presetsView` stay as the rung for an application that draws its own calendar.

| Option | Kind | Today |
| --- | --- | --- |
| `model`, `onMessage`, `label` | wiring | new view |
| `weekNumbers?: boolean` | data | exists |
| `caption?: 'grid' \| 'label' \| { dropdowns: { years?: { from, to }, month?: 'select' \| 'label' } }` | data: the selects are drawn in `calendar.ts` itself, no module behind them | `grid`, `label` and both-selects exist; `month: 'label'` is new |
| `paging?: 'both' \| 'previous' \| 'next' \| 'none' \| 'end'` | data | `end` (both buttons after the heading) is new |
| `today?: { label: string, selects?: boolean }` | data | new |
| `presets?: ReadonlyArray<{ label: string, selection: Selection }>` | data, built with `Calendar.lastDays`, `nextDays`, `monthOf`, `day` | `presetsView` exists (`calendar.ts:942`) |
| `detail?: (date) => Option<string>` | the application's function | exists |
| `aside?: Html`, `footer?: Html` | slots the calendar places and does not understand | new |
| `words?`, `style?`, `mixins?` | as every widget | `labels` becomes `words` |

The typed value comes from readers over the union, not from a generic kit: `Calendar.selectedDate(selection): Option<CalendarDate>` and `firstDate` exist (`calendar.ts:645`, `:653` [v]); `Calendar.rangeOf(selection): Option<DateRange>` and `Calendar.datesOf(selection)` are added.

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

State is `Bundles.Calendar` (1 to 23) or `Bundles.DatePicker` (24 to 30). "new" marks an addition.

| # | Example | Args and view options | Kind |
| --- | --- | --- | --- |
| 1 | Basic | defaults | D |
| 2 | Range | arg `selection: Calendar.empty('Range')` | D |
| 3 | Disabled dates | args `disabledDates`, `disabledDaysOfWeek`, `minDate` | D |
| 4 | Multiple | arg `selection: Calendar.empty('Multiple')` | D |
| 5 | Custom selected day | `Recipes.Calendar.extend({...})` | L |
| 6 | Custom range style | `Recipes.Calendar.extend({...})` | L |
| 7 | Controls on the right | `paging: 'end'` (new) | D |
| 8 | Month and year dropdowns | `caption: { dropdowns: {} }` | D |
| 9 | Year select with arrows | `caption: { dropdowns: { month: 'label' } }` (new) | D |
| 10 | Week numbers | `weekNumbers: true` | D |
| 11 | "Current month" button | `today: { label: 'This month' }` (new) | D |
| 12 | "Today" button | `today: { label: 'Today', selects: true }` (new) | D |
| 13 | Year view | `caption: 'grid'`, the default | D |
| 14 | Preset times | `aside:` the application's time list (new slot) | C |
| 15 | Date presets | `presets: [{ label, selection: Calendar.day(...) }]` | D |
| 16 | Range presets | `presets` built with `Calendar.lastDays`, `monthOf` | D |
| 17 | A price on each day | `detail: priceOf`; recipe `detail: 'text'` | V |
| 18 | Presets, another layout | `presets`; a recipe value for their side (by `add`) | L |
| 19 | Appointment | `aside:` time slots | C |
| 20 | Two months | arg `months: 2` | D |
| 21 | Two months, range | args `months: 2`, `selection: Calendar.empty('Range')` | D |
| 22 | Event list beside | `detail` marks the days; the list is the application's | C |
| 23 | Localized | arg `locale: Calendar.localeOf('fr')`; `words` | V |
| 24 | Date picker | `trigger: selection => string` | V |
| 25 | Range date picker | arg `selection: Calendar.empty('Range')`; `trigger` | V |
| 26 | Date picker, year view | `caption: 'grid'` | D |
| 27 | Date and appointment picker | `aside:` time slots; arg `closes: 'manual'` (new) | C |
| 28 | Date picker with presets | `presets` | D |
| 29 | Range picker with presets | `presets` | D |
| 30 | Date and time range picker | `footer:` two time inputs; arg `closes: 'manual'` | C |

Twenty-five of thirty are a call with options; five are a call plus a second widget. The limit worth stating: upstream's month and year grids ship with every calendar, because they are inside `@foldkit/ui/calendar`'s one Model, `update` and view. `caption: 'label'` hides them and cannot drop them.

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

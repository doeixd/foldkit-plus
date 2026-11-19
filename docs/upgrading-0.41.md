# Upgrading to 0.41

This guide is for an application on Foldkit Plus 0.40. It lists every breaking
change of 0.41.0 that you may have to act on, package by package, with what to
write instead. The [0.41.0 changelog](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/CHANGELOG.md#0410)
holds every entry in full.

Most of it is renames. A rename is a type error where you call the old name,
so the TypeScript compiler (`tsc`) gives you the list: compile, then work down
the errors with this page beside you. Each package carries its own version;
0.41.0 publishes them together (`foldkit-mixins-ui` 0.27.0, `foldkit-mixins`
0.26.0, `foldkit-entity` 0.18.0, `foldkit-bundle` 0.14.0).

> **Check these four first. The compiler cannot see them**, because each
> changes a default rather than a name, and your code compiles either way.
>
> 1. **The default theme** casts shadows, rounds corners more, deepens the
>    accent, tints greys toward the accent and gives menus the page's raised
>    surface. [Keep the 0.40 look](#the-default-theme) with five knobs.
> 2. **A card group** (`Card.group`) draws its pointer highlight only when
>    given `fluid: Card.fluid`.
> 3. **An ImageCropper** draws its zoom slider only when given
>    `zoom: ImageCropper.zoomSlider()`.
> 4. **A ColorPicker's eyedropper** is off unless you pass `eyedropper`. Keep
>    `ColorPicker.canEyedrop()` in your Model, read once in `init` or after
>    hydration, and pass it: the view used to test the browser while drawing,
>    so a server and a browser drew different markup.

## `foldkit-mixins-ui`: the widgets

**A widget's fixed text is one `words` object.** The `labels` objects, the
`*Label` options and the functions of a count are gone. A word is text with
`{blanks}`, and you pass only the words you change. This touches Command,
Tour, Carousel, Questionnaire, Pagination, Toast, TagsInput, Rating, Slider,
SignaturePad, ImageCropper, FloatingPanel and others.

```diff
- Questionnaire.view({ ...options, submitLabel: 'Send', nextLabel: 'Continue' }, h)
+ Questionnaire.view({ ...options, words: { submit: 'Send', next: 'Continue' } }, h)
- TagsInput.view({ ...options, words: { remove: tag => `Remove ${tag}` } }, h)
+ TagsInput.view({ ...options, words: { remove: 'Remove {tag}' } }, h)
- Carousel.view({ ...options, slideLabel: … }, h)
+ Carousel.view({ ...options, words: { slide: '{index} of {count}' } }, h)
```

Words are text, not functions, because a function inside a widget's view
inputs cannot be drawn through `h.submodel`.

**A feature that pulls in code is a value you import and pass**, so a page
that does not pass it does not ship it:

```diff
- Table.view({ ...options, fluid: true }, h)
+ Table.view({ ...options, fluid: Table.fluid }, h)
- Table.view({ ...options, selection: { ...selection, checkbox } }, h)
+ Table.view({ ...options, selection: { ...selection, control: Table.checkboxes(CheckboxStyle) } }, h)
- Breadcrumb.view({ ...options, collapse: { max: 3, menu } }, h)
+ Breadcrumb.view({ ...options, collapse: BreadcrumbMenu.make({ max: 3, menu }) }, h)
- Chart.view({ ...options, kind: 'bar' }, h)
+ Chart.view({ ...options, kind: Chart.bars }, h)
- Avatar.view({ ...options, src: { asset, provider, width } }, h)
+ Avatar.view({ ...options, picture: Avatar.picture({ asset, provider, width }) }, h)
```

`Picker.view` takes a `choice` (`Picker.one(items)`) and a `value` where it
took `options` and an `Option`.

**One `clear` option, one tone name, one argument order:**

```diff
- SearchField.view({ ...options, onClear: Message.Cleared() }, h)
+ SearchField.view({ ...options, clear: { onClear: Message.Cleared() } }, h)
- CascadeSelect.view({ ...options, clearable: true }, h)
+ CascadeSelect.view({ ...options, clear: true }, h)
- Recipes.Alert({ tone: 'error' })
+ Recipes.Alert({ tone: 'danger' })
- AppShell.view(options, main, h)
+ AppShell.view({ ...options, main }, h)
```

The tone `error` is `danger` on Progress too. A SearchField given no `clear`
has neither the button nor Escape's clearing.

**Smaller changes**, each a type error where it applies:

- `FileInput`'s `accept` is an array: `accept: ['.pdf', 'image/*']`.
- `Recipes.Badge` reads its tone from the markup: `Recipes.Badge({ appearance: 'solid' })` and `tone` on `Badge.view`.
- `Recipes.Typography` has no `level` axis; `Typography.view` writes the level.
- Menu rows are named by a `value` of their own, beside their `label`.
- `Toast`'s `action` is `actions: [action]`.
- `SignaturePad.Message.Began` carries `pointerType: 'pen'` where it carried `pen: true`.
- `Tour.start` and `FloatingPanel.open` take no `opener`; focus returns by `focusReturn`.
- `NumberField.view`'s `value` is an `Option<number>`; `Drawer.view` takes `label`.
- `foldkit-bundle` is a peer dependency: install it if you place any `Bundles`.

**Keyboard and ARIA behaviour** changes that compile either way: Home and
End in a Combobox move the caret in the field; a single-choice Segmented is
a radio group; Skeleton and Spinner are `role="status"` only. Each has its
entry in the changelog.

## `foldkit-mixins`: styles and themes

### The default theme

Five defaults changed: `shadow.strength` is 70, `shape.radius` 1, the
accent's lightness 54 in both schemes, `surface.saturation` 0.005 and
`menu.panel` `default`. To keep the 0.40 look:

```ts standalone
import { Theme } from 'foldkit-mixins/theme'

export const theme040 = Theme.make({
  shadow: { strength: 0 },
  shape: { radius: 0.45 },
  accent: { lightness: { light: 55, dark: 70 } },
  surface: { saturation: 0 },
  menu: { panel: 'inverted' },
})
```

### The rest

- A view's `pipe` takes typed steps only. A list of Behaviors is one step:
  `Behavior.attachAll(list)`.
- Composing a conditional rule (media, pseudo, nest, `states`, `whenInput`)
  beside an inline declaration of the same property throws
  `mixins:dead-conditional-rule`, since the inline declaration always won.
- A `NamedStyle` of one Slots contract no longer passes where another
  contract's is asked for (types only).

## `foldkit-entity` and `foldkit-guard`: the domain

- **A write's `when` that reads `Expr.viewer` or `Expr.now`** (also through a
  path from the viewer or an exists) is refused where the write is declared.
  It used to fail only where a writer served it. A `when` reads the row and
  the input; who is asking is a guard rule's question.
- **`evaluate` refuses an order over text with no declared collation**,
  which SQLite and Postgres would order differently. Declare one on the key
  you order by: `Entity.annotateMembers({ title: Collation.of(Collation.binary) })`,
  or `Order.asc(field, { collation })`.
- **An invariant belongs to the Entity**, as its relations do, so every
  descriptor of it judges it. A test that piped different invariants onto
  one shared Entity gives each its own.
- **Security: every guard seam** (`GuardServer.writer`, `filter`, `memory`
  and `mutation`, `GuardDrizzle.visible`, `GuardSync.document` and `opens`)
  throws where it is built when given a descriptor without guards of an
  Entity another descriptor of which carries them. Before, it served that
  descriptor unguarded. Pass the descriptor `Guards.attach` returned.
- `Entity.judgeInput(input, value, { operators?, over? })` takes an options
  object in place of the positional operator table.

## Servers: what a failure tells its caller

`foldkit-remote-server`, `foldkit-remote-drizzle`, `foldkit-cms-drizzle` and
`foldkit-sync` no longer send a caller the text of a failure on their own
side. The caller reads `Internal error` and an incident id; the cause goes to
the server's diagnostics under that id.

- Words your handler means the caller to read are said with
  `RemoteServer.tell('…')`; a caught error is passed as
  `new RemoteServerError({ message, cause })`.
- In Sync, a handler that throws words for the replica throws
  `new ExchangeRefused({ message })`. A document host's resolver that wants
  its words read gives them as the refusal's `reason`.
- A client that matched on an old message (`Database query failed`,
  `Database write failed`) reads `RemoteData.incident(error)` instead.
- `cms_drafts.schedule_error` values stored before 0.41 still hold the old
  text; overwrite them once (the changelog has the statement).

## `foldkit-primitives`, `foldkit-crud`, `foldkit-data-grid`

```diff
  // in PointerDrag's options, and PointerDrag.behavior's
- targets: { attribute, within },
+ targets: [{ attribute, within }],
- out.shiftKey
+ out.modifiers.shiftKey
- Crud.list({ ...options, live: true })
+ Crud.list({ ...options, live: liveQuery })
```

- `Press`, `Repeat` and `LongPress` facts carry `modifiers` in place of `shiftKey`.
- `KeyboardMessage.Pressed` gains the required `code` and `typing`.
- `Selection`'s Model gains `ranged`, and a stored `HistoryModel` needs `groupedAt`.
- A `FocusRecovery` `{ part }` step must name a key of `parts`.
- `liveQuery` comes from `foldkit-remote/live`.
- A grid's `onOut` that matches every variant needs a `Copied` arm, which may ignore it.

## When you are done

Run your tests, then look at a page in a dark and a light scheme: the theme's
defaults are the change you are most likely to see and least likely to have
been told about by the compiler.

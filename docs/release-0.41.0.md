# Foldkit Plus 0.41.0: configure an example, do not copy it

Foldkit Plus is a set of packages around [Foldkit](https://foldkit.dev/), a
TypeScript framework in which an application is one state machine: a typed
Model, a union of Messages, and one `update` function. Its UI package,
`foldkit-mixins-ui`, holds about ninety styled, accessible widgets. In 0.41.0
every variation of a widget is a call into the package's own factories, so you
configure an example instead of copying its source, and a page ships only the
features it names.

On 0.40? The upgrade is mostly renames the compiler finds for you; see
[Upgrading from 0.40](#upgrading-from-040).

## One widget, four factories

A library that shows thirty calendars often ships thirty source files and a
command that copies one into your project, where its fixes no longer reach
you. Foldkit Plus had options instead, but they missed most of those
variations. Now a widget is made of four kinds of fact, each given in one
place:

- **Look** is CSS over fixed markup. `Recipes.X(selection)` picks values on
  axes, and `.add` gives a shipped recipe an axis or a value it lacks.
- **State** is a Model and its Messages. `Bundles.X` packages a widget's
  `init` and `update`, so one placement puts it in your Model.
- **Drawing** is markup, ARIA and words. `X.configure({ base, presets })`
  binds the options that never change, and returns a `view` that needs only
  what differs per use.
- **Features** are code most pages never need. A feature is a value you
  import and pass, so a page that never names it never ships it.

Here is one Listbox written all four ways, as one module. First the look: the
shipped recipe has no `rows` axis, so `add` gives it one, and its sizes and
triggers still apply.

<!-- image: the "A look of your own" example on https://foldkit-plus.pages.dev/components/listbox, open, with the divided rows showing -->

```ts standalone
import { Option, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Bundles, Listbox, ListboxSlots, Recipes } from 'foldkit-mixins-ui'

const { t, forSlots } = AppStyle.make({})

const Lists = Recipes.Listbox.add({
  rows: {
    divided: { item: Style.self({ borderBlockEnd: `${t.border.thin} solid ${t.outline.default}` }) },
  },
})
const Divided = forSlots(ListboxSlots)(Lists({ rows: 'divided', size: 'sm' }))
```

`add` refuses a value an axis already has, at the type level and at load, so
it cannot quietly override a shipped look; that is `.extend`'s job.

Next the state. The chosen fruit is your field. The placed Listbox holds only
whether it is open and which row the keys are on, and reports each choice for
`Fruit.picked` to fold in:

```ts
const fruits = ['Apple', 'Banana', 'Cherry', 'Durian'] as const
const Fruit = Listbox.one(fruits)

const App = Bundle.compose({ fruit: Schema.Option(Schema.Literals(fruits)) }).pipe(
  Bundle.withChild('box', Bundles.Listbox, {
    args: { id: 'fruit' },
    onOut: out => model => ({ model: { ...model, fruit: Fruit.picked(model.fruit, out) } }),
  }),
)
```

`App.Model`, the wrapper Message `GotBoxMessage` and the fold are derived from
that one placement. Choosing several is another value, not a flag:
`Listbox.many(fruits)`, with `multiple: true` in the Bundle's args.

Last the drawing, configured once, with a feature passed as a value.
`Listbox.fluid` is the highlight that follows the pointer between rows; it
lives in a file of its own, so a list that does not pass it does not load it.

```ts
const FruitList = Listbox.configure({
  base: { style: Divided, placeholder: 'Pick a fruit', mixins: Listbox.fluid },
})

const view = (model: typeof App.Model.Type, h: HtmlBuilder<typeof App.Message.Type>): Html =>
  FruitList.view(
    {
      model: model.box,
      onMessage: message => App.Message.GotBoxMessage({ message }),
      label: 'Fruit',
      choice: Fruit,
      value: model.fruit,
    },
    h,
  )

export const config = App.placements.runtime({ Model: App.Model, initial: { fruit: Option.none() }, view })
```

None of these calls performs I/O. The recipe and `configure` run once, at
module scope, and hold no state. The Bundle holds no view, and its Model
lives in yours. Named presets (`preset: 'owner'` at the call) are checked
against the keys you declared.

Placing a Bundle is optional. Folding a widget's `init` and `update` by hand
adds nothing to the page; the first placed Bundle costs about 6 kB brotli,
shared by every later one
([both ways](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/mixins-ui/README.md#state-fold-it-by-hand-or-place-a-bundle)).

The website's component pages are built the same way: each example is one
module, and what you read on
[the Listbox page](https://foldkit-plus.pages.dev/components/listbox) is the
code that draws it.

## A page ships only what it draws

The factories themselves save no bytes. Two rules do.

**A feature is a value.** An option that switches code on with `true` keeps
that code in every page, passed or not. The largest case was Breadcrumb,
which imported Menu for every trail in case one folded its hidden steps. Now
the fold is `BreadcrumbMenu.make({ max, menu })`, which you pass. In
[the test that pins it](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/mixins-ui/test/breadcrumbBuild.test.ts),
a minified page of just a trail is 68.4 kB brotli, and 96.2 kB once it
passes a Menu: 27.8 kB that every trail page used to carry. The test fails if
a Menu module reaches the plain page. Table's pointer highlight and
checkboxes, each Chart kind, Avatar's `foldkit-media` picture, the card
group's highlight and ImageCropper's zoom slider went the same way.

**Styles can be frozen.** A recipe holds every value on every axis, and a
bundler cannot drop the ones you did not pick. `styles({ sheet, modules })`
from `foldkit-mixins/vite` evaluates your style modules at build time and
ships class names instead
([how](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/packages/mixins/README.md#style-modules-shipped-as-data)).
On a one-Button test page (Vite 8, 2026-11-17; no test pins it), freezing
took the JavaScript from 114.1 kB to 91.8 kB brotli. The design-system
example, which draws most of the catalogue, went from 220.7 kB to 184.2 kB,
as its [budget test](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/examples/design-system/test/bundle.test.ts)
records. The new APIs are built to be frozen: `add` yields style pieces,
`configure` takes compiled styles, and a style never carries behaviour.

One idea did not pay: narrowing the Button recipe by hand to the page's one
look saved 136 bytes, so recipes were not split into a file per value.

## New things to try

**FileUpload** is a field of files with a status each: drop, pick and paste
arrive as one Message, refusals name their file, files send a few at a time
with previews, and a failed one can be retried. Its progress bar is a value
you build, so a field that sends nothing never loads it.

<!-- image: https://foldkit-plus.pages.dev/components/file-upload, a zone with three files: one sent, one sending with its bar, one refused for its size -->

**CodeBlock** marks whole lines (`added`, `removed`, `highlight`, `error`
and others), collapses a long block behind an expand button, and can make
each line number a button.

<!-- image: https://foldkit-plus.pages.dev/components/code-block, a diff-style block with added and removed lines and a collapsed tail -->

**Selected text follows the theme.** A new `selection` token group paints
`::selection` from the accent, so changing the accent moves it too.

**A [Primitives gallery](https://foldkit-plus.pages.dev/primitives/gallery)**
on the website shows `foldkit-primitives`, the focus, drag, scroll and
keyboard pieces the widgets are built from, some running live.

<!-- image: https://foldkit-plus.pages.dev/primitives/gallery, the first screen of cards with one live example in view -->

## Upgrading from 0.40

0.41.0 publishes the packages together, each at its own version
(`foldkit-mixins-ui` 0.27.0, `foldkit-mixins` 0.26.0, `foldkit-bundle`
0.14.0). Most breaking changes are in `foldkit-mixins-ui`, and most of those
are renames: a type error at the call site, so `tsc` lists them for you. Four
slip past it because they change a default: the card group's highlight,
ImageCropper's zoom slider, ColorPicker's eyedropper and the theme.

**A widget's fixed text is one `words` object.** The `labels` objects,
`*Label` options and functions of a count are gone. A word is text with
`{blanks}`, and you pass only the words you change:

```diff
- Questionnaire.view({ ...options, submitLabel: 'Send', nextLabel: 'Continue' }, h)
+ Questionnaire.view({ ...options, words: { submit: 'Send', next: 'Continue' } }, h)
- TagsInput.view({ ...options, words: { remove: tag => `Remove ${tag}` } }, h)
+ TagsInput.view({ ...options, words: { remove: 'Remove {tag}' } }, h)
```

Words are text because a function in a widget's view inputs cannot pass
through `h.submodel`, Foldkit's way of nesting a view.

**A feature that pulls in code is a value you pass:**

```diff
- Table.view({ ...options, fluid: true }, h)
+ Table.view({ ...options, fluid: Table.fluid }, h)
- Breadcrumb.view({ ...options, collapse: { max: 3, menu } }, h)
+ Breadcrumb.view({ ...options, collapse: BreadcrumbMenu.make({ max: 3, menu }) }, h)
- Chart.view({ ...options, kind: 'bar' }, h)
+ Chart.view({ ...options, kind: Chart.bars }, h)
```

Two of these change a default, so the compiler will not tell you. A card
group drew a pointer highlight unless told not to; now it draws one only when
given `fluid: Card.fluid`. An ImageCropper drew a zoom slider; now it draws
one only when given `zoom: ImageCropper.zoomSlider()`.

**The tone `error` is `danger`**, on Progress and `Recipes.Alert`, as every
other tone vocabulary spells it.

**Clearing is one `clear` option:**

```diff
- SearchField.view({ ...options, onClear: Message.Cleared() }, h)
+ SearchField.view({ ...options, clear: { onClear: Message.Cleared() } }, h)
- CascadeSelect.view({ ...options, clearable: true }, h)
+ CascadeSelect.view({ ...options, clear: true }, h)
```

**`AppShell.view` takes `main` as an option**, as every view takes
`(options, h)`:

```diff
- AppShell.view(options, main, h)
+ AppShell.view({ ...options, main }, h)
```

**The default theme changed.** It now casts shadows, rounds corners more,
deepens the accent, tints greys faintly toward the accent's hue, and gives
menus the page's raised surface instead of an inverted one. Each is one knob.
To keep 0.40's look:

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

**ColorPicker's eyedropper is off** unless you pass `eyedropper`. The view
used to test the browser while drawing, so a server and a browser drew
different markup.

**Install `foldkit-bundle`** if you place any `Bundles`; it is now a peer of
`foldkit-mixins-ui`.

The rest are narrower: Menu rows named by a `value`, `Picker.view` taking a
`choice`, `FileInput`'s `accept` as an array, some keyboard and ARIA
behaviour (Home and End in a Combobox, a single-choice Segmented as a radio
group), and changes in `foldkit-primitives`, `foldkit-entity` and the server
packages. Each has an entry saying what to write instead in the
[0.41.0 changelog](https://github.com/doeixd/foldkit-plus/blob/v0.41.0/CHANGELOG.md#0410).

The work is wide and shallow: compile, follow the errors, then check the four
defaults.

## Under the hood

**Tints went pink in Chrome 157.** Chrome and Edge 157 read no hue from a
colour of very little chroma unless it was written in OKLCH. The palette
wrote a tint as `oklch(from <mix> l c h)`, so the default accent's tint
(chroma 0.017 on hue 235) came out on hue 0, and a selected row painted pink.
`fitMix` now writes the tint in OKLab, scaling its `a` and `b` together, so
there is no hue to lose; Firefox, WebKit and older Chromium paint it as
before.

**CI got shorter.** The end-to-end tests ran in one 36-minute job. They now
run in five: four shards and the website's production check. The unit and
browser tests are sharded too.

## What is next

First the widgets that still take the most hand-written code: an
options-level `Dialog.view` and `Popover.view`, so a dialog example stops
running to fifty lines, and `make` factories for Sidebar and Questionnaire,
whose optional parts carry state of their own. Then new widgets
(a sortable list, a time field, Scrollspy) and the primitives we lack next
to [solid-primitives](https://primitives.solidjs.community/), from a guard
against leaving unsaved work to audio and video
([#596](https://github.com/doeixd/foldkit-plus/issues/596)).

To start, browse the
[component pages](https://foldkit-plus.pages.dev/components), or install:

```bash
pnpm add foldkit-mixins foldkit-mixins-ui foldkit-primitives foldkit-bundle @foldkit/ui
```

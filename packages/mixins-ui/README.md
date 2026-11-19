# `foldkit-mixins-ui`

Most component libraries leave you with two bad options: copy-paste templates into your codebase and maintain every accessibility fix yourself, or wrap opaque widgets whose styles and markup you fight with fragile CSS overrides.

`foldkit-mixins-ui` gives you ready-made, accessible widgets that you install as a package, style with theme tokens and recipes, and upgrade cleanly. Each widget renders accessible markup from your [Foldkit](https://foldkit.dev) Model, exposes named extension points so you can style or decorate parts without copying templates, and tree-shakes down to the widgets you import.

Browse every widget and its live variants in the [component gallery](https://foldkit-plus.pages.dev/components), or tune colors, typography, spacing, and motion across all of them at once in the [theme builder](https://foldkit-plus.pages.dev/create).

## Install

```bash
pnpm add foldkit-mixins-ui
```

`foldkit`, `effect`, `foldkit-mixins`, `foldkit-primitives`, and `@foldkit/ui` are peer dependencies. Add `foldkit-bundle` when you place stateful widgets with `Bundles` ([State: fold it by hand, or place a Bundle](#state-fold-it-by-hand-or-place-a-bundle)).

## A first button

This renders a Save button in the theme's accent look and sends a `Saved` Message when clicked:

```ts standalone
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Button, Recipes } from 'foldkit-mixins-ui'

const Message = defineMessageUnion({ Saved: {} })
type Message = typeof Message.Type

const SaveStyle = Recipes.Button.style({})

export const saveButton = (h: HtmlBuilder<Message>): Html =>
  Button.view({ label: 'Save', style: SaveStyle, onClick: Message.Saved() }, h)
```

`Button.view` renders a `<button type="button" class="...">Save</button>` styled with the theme's accent tone and solid variant. Clicking it sends `Saved` to your Foldkit `update`; pressing Enter or Space activates it with standard button keyboard behavior.

## When to use something else

Use `foldkit-mixins-ui` when you want styled, accessible widgets from the catalog below, or when you already use `@foldkit/ui` and want reusable styling, ARIA attributes, or element-level behavior through its `toView` callback.

If you are building custom views from scratch rather than adapting a catalog widget, define extension points directly with [`foldkit-mixins`](../mixins) and read [Inside-out view composition](../../docs/mixins.md) or [Authoring components](../../docs/authoring-components.md).

## Look, state, drawing, features: one factory each

A variation of a widget is a call with options rather than a copied file. Each widget separates four concerns:

- **Look** (`Recipes.X.style(selection)`): compiles CSS over fixed markup from your theme's tokens. Use `.extend` to tweak existing variants or `.add` to define new axes ([Recipes](#recipes)). Omitting `style` renders bare unstyled markup.
- **State** (`X.init` and `X.update`, or `Bundles.X`): holds interaction state (what is open, a drag, a countdown) in your Foldkit Model, while application values stay in your Model.
- **Drawing** (`X.view(options, h)` and `X.configure({ base, presets })`): renders markup, ARIA attributes, events, and fixed labels (`words` with `{blanks}` such as `'Remove {tag}'`).
- **Features** (passed values like `fluid: Table.fluid` or `kind: Chart.bars`): lets you import optional capabilities explicitly so pages that omit them never ship their code.

Each widget's `view` derives markup purely from its arguments and your Model so server and browser renders match. Read browser facts (such as eye-dropper availability or reduced-motion preference) once in `init` or a Command and pass them in as Model inputs (see [ColorPicker](#colorpicker)).

This example renders a compact, fluid-hover product table from your application rows:

```ts standalone
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, Table } from 'foldkit-mixins-ui'

const Message = defineMessageUnion({ Noop: {} })
type Message = typeof Message.Type

interface Product {
  readonly name: string
  readonly price: string
}

const ProductsStyle = Recipes.Table.style({ density: 'compact' })

export const products = (rows: ReadonlyArray<Product>, h: HtmlBuilder<Message>): Html =>
  Table.view(
    {
      columns: [
        { header: 'Product', rowHeader: true, value: row => row.name },
        { header: 'Price', numeric: true, value: row => row.price },
      ],
      rows,
      rowKey: row => row.name,
      fluid: Table.fluid,
      words: { selectAll: 'Choose every product' },
      style: ProductsStyle,
    },
    h,
  )
```

`Table.configure({ base, presets })` lets you bind `style`, `fluid`, and `words` once and pass only `columns` and `rows` at each call site. [One factory for each part](#one-factory-for-each-part) covers `init`/`update`, `Bundles`, `configure`, and `Recipes` in full.

## Customizing `@foldkit/ui` components with adapters

Some widgets here wrap [`@foldkit/ui`](https://www.npmjs.com/package/@foldkit/ui), Foldkit's unstyled components. You cannot reach inside an upstream component to add a class to its third element by hand, so this package gives each part a typed name—such as `button` or `icon`—called a **Slot**, and provides an **adapter** (`toView` and `resolve`) that attaches `Style` and `Behavior` mixins to those Slots.

This example attaches a custom CSS class to an `@foldkit/ui` Button using `Button.toView`:

```ts standalone
import * as UiButton from '@foldkit/ui/button'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Style } from 'foldkit-mixins'
import { Button, ButtonSlots } from 'foldkit-mixins-ui'

const Message = defineMessageUnion({ Saved: {} })
type Message = typeof Message.Type

const SaveStyle = Style.forSlots(ButtonSlots)({
  button: Style.class('btn btn-primary'),
})

export const saveButton = (h: HtmlBuilder<Message>) =>
  UiButton.view(
    {
      onClick: Message.Saved({}),
      toView: Button.toView([SaveStyle.mixin], { h }, ({ button }) => h.button(button, ['Save'])),
    },
    h,
  )
```

`UiButton.view` builds the component's base attributes and calls `toView`; `Button.toView` merges `SaveStyle` onto the `button` Slot and hands the resolved attribute array to your `draw` callback, rendering `<button class="btn btn-primary">Save</button>` that sends `Saved` on click. You can append extra non-conflicting attributes right inside `draw`:

```ts standalone
import * as UiInput from '@foldkit/ui/input'
import type { HtmlBuilder } from 'foldkit/html'
import { Style } from 'foldkit-mixins'
import { Input, InputSlots } from 'foldkit-mixins-ui'

const ZipStyle = Style.forSlots(InputSlots)({ input: Style.class('zip') })

export const zipInput = (h: HtmlBuilder<never>) =>
  UiInput.view(
    {
      id: 'zip',
      toView: Input.toView([ZipStyle.mixin], { h }, ({ input }) =>
        h.input([...input, h.Autocomplete('off')]),
      ),
    },
    h,
  )
```

### `toView` and `resolve`

Every adapter (all except `Anchor`, which is a Behavior) exports both `toView` and `resolve`. `toView(mixins, { h, input? }, draw)` hooks directly into an upstream component's `toView` callback; `resolve(attributes, mixins, { h, input? })` resolves attribute bundles already in hand—for instance, when a Calendar mixin reads the current view mode from `attributes._tag`:

```ts standalone
import type { CalendarAttributes } from '@foldkit/ui/calendar'
import type { HtmlBuilder } from 'foldkit/html'
import { Style } from 'foldkit-mixins'
import { Calendar, CalendarSlots } from 'foldkit-mixins-ui'

const CalendarStyle = Style.forSlots(CalendarSlots)({
  root: Style.whenInput<CalendarAttributes['_tag']>(mode => mode === 'Years', Style.class('years')),
})

export const resolveCalendar = (attributes: CalendarAttributes, h: HtmlBuilder<never>) =>
  Calendar.resolve(attributes, [CalendarStyle.mixin], { input: attributes._tag, h })
```

Every `view` takes `h` last so handlers are type-checked against the current Message union; pass `h` down as a parameter rather than storing it across frames. Values that are not Slots (`animatePanel`, `isVisible`, `activeIndex`, `selectedValue`) pass through `resolve` untouched, and each adapter exports its named return type (`ResolvedButton<Message>`, `ResolvedInput`, `ResolvedDialog`, `ResolvedRadioGroup<Value, Message>`, `ResolvedTabs`, `ResolvedCalendar`, `ResolvedMenu`).

### How the resolver protects component contracts

`foldkit-mixins-ui` delegates merge rules to `foldkit-mixins` instead of concatenating arrays:

- component base attributes and Submodel `ChildAttribute`s survive by identity;
- classes combine additively and inline declarations merge by property;
- events and scalar attributes allow one owner, throwing `DiagnosticError` if a Behavior tries to register a competing `OnClick` or structural role.

### Submodel components remain Submodels

Dialog, Popover, Tooltip, Tabs, RadioGroup, Calendar, and Menu publish `ChildAttribute`s carrying the child state machine's dispatcher. The resolver preserves them, keeping child boundaries intact, and applies per-item Slot contributions across repeated items while preserving each item's own event ownership:

```text
Tabs       -> { tablist, tabs, activeIndex }
RadioGroup -> { group, options, selectedValue, hiddenInput }
Calendar   -> ResolvedDays | ResolvedMonths | ResolvedYears
Menu       -> { wrapper, button, backdrop, items, scroll, groups, isVisible }
Toast      -> { container, entries }
Listbox    -> { wrapper, button, backdrop, items, scroll, groups, hiddenInputs, isVisible }
Combobox   -> { wrapper, inputWrapper, input, toggleButton, backdrop, items, scroll, groups, hiddenInputs, isVisible }
```

<!-- docs-check standalone
import { Schema } from 'effect'
import { FieldValidation } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Style } from 'foldkit-mixins'
import {
  Icons,
  Listbox,
  Menu,
  Recipes,
  ScrollArea,
  Segmented,
  Tabs,
  Touch,
} from 'foldkit-mixins-ui'
const Message = defineMessageUnion({
  Saved: {},
  TypedEmail: { value: Schema.String },
  TypedTitle: { value: Schema.String },
  TypedReply: { value: Schema.String },
  TypedPassword: { value: Schema.String },
  ToggledPassword: {},
  ToggledMark: { mark: Schema.String },
})
type Message = typeof Message.Type
declare const h: HtmlBuilder<Message>
declare const model: { readonly marks: ReadonlyArray<string> }
declare const iconUrl: (name: string) => string
-->

## Finding a widget

| I need... | Use |
| --- | --- |
| a button, toggle button or icon button; a row of them | [Button](#buttons-actions-and-commands), ButtonGroup, [Toolbar](#toolbar) |
| a command palette | Command in a Dialog |
| a text field, a textarea, a password, a search box | [Input, Textarea](#text-and-number-fields), PasswordInput, [SearchField](#searchfield) |
| a number, a one-time code, tags, a copyable value | NumberField, OtpField, TagsInput, InputCopy |
| a file picker, a drop zone, files that are listed, checked, previewed and sent | [FileInput](#fileinput) (a native picker you own), FileDrop, [FileUpload](#fileupload) |
| on or off; one of a few; several of a few | Switch, Checkbox, CheckboxGroup, RadioGroup, Segmented |
| one from a long list; a path through nested options | Select, Listbox, Combobox, Picker, CascadeSelect |
| a number, a range, a rating, an angle, a color | Slider, NumberField, Rating, AngleSlider, ColorPicker |
| a date or a range of dates | Calendar, DatePicker |
| a dialog, a sheet, a docked drawer | [Dialog](#dialog) (with `focusReturn`), Sheet, Drawer |
| a popover, a tooltip, a hover card, a floating window, a guided tour | Popover, Tooltip, HoverIntent, FloatingPanel, Tour |
| a menu, a context menu, a menu bar | Menu, Menubar |
| tabs, site navigation, breadcrumbs, pages, a stepper | Tabs, Nav, Breadcrumb, Pagination, Steps |
| an app frame, a sidebar, an accordion, a tree | AppShell, Sidebar, Accordion, TreeView |
| a table, a card, a list row, an avatar | Table, Card, Item, Avatar |
| an alert, a toast, a progress bar, a loading state | Alert, Toast, Progress, Meter, Spinner, Skeleton |
| a very long list | VirtualList, WindowList |
| a chat | ChatMessage, MessageScroller, ThinkingIndicator, ThinkingSteps, Questionnaire |
| a widget's state placed in my Model without writing its fold | [`Bundles.X`](#state-fold-it-by-hand-or-place-a-bundle) |
| a widget's look, words and mixins stated once | [`X.configure`](#drawing-configure-once-call-with-what-differs), [`Recipes.X`](#recipes) |
| my own keyboard shortcut on a widget | [Application key routes](#application-key-routes) |
| focus that survives removing what had it | [Focus after removal](#focus-after-removal) |
| a form that submits natively | [Form participation](#form-participation) |
| a right-to-left page | [Right to left](#right-to-left) |

Each group below is a table (the widget, what it is and its call, its recipe
axes and Slots) and notes on the widgets whose behavior needs more than a line.
A row says `A small Model` where the widget keeps interaction state for the
application to place and fold with its `update`; the rest keep nothing. Every
view takes an optional `style` of its Slots and `mixins` beside it, and `h` last.
Style the Slots with the matching recipe ([Recipes](#recipes)); hide text with
`U.srOnly` from `foldkit-mixins/utilities`; name a control with
`FieldAssociation`, whose derived id `Label.view` takes.

Behavior shared by many widgets is described once, in [Mechanisms shared by many
widgets](#mechanisms-shared-by-many-widgets), and the rows link to it: application
key routes (`routes`), focus after removal, form participation (`name`),
right to left (`direction`), exits and reduced motion, the opt-in Mounts
(`fluid`, `overlayBars`) and the top layer.

## Buttons, actions and commands

| Widget | What it does | State |
| --- | --- | --- |
| `Button` | Action button, toggle button (`pressed`), or link (`href`) | Application / Adapter |
| `ButtonGroup` | Joins buttons, fields, or menus with shared seams | Application |
| [`Toolbar`](#toolbar) | Single-tab-stop toolbar with arrow-key navigation | Small Model / Bundle |
| [`Command`](#command) | Searchable command palette with grouped, filterable rows | Application |
| `Kbd` | Keyboard key or shortcut (`Kbd.combo`) badge | Stateless |

A button drawn as a button needs no `draw` callback. `Button.view` takes a label, a recipe style, and `@foldkit/ui` button options:

```ts
import { Button, Recipes } from 'foldkit-mixins-ui'

const SaveButtonStyle = Recipes.Button.style({})

const saveButton = (disabled: boolean, h: HtmlBuilder<Message>) =>
  Button.view(
    {
      label: 'Save',
      style: SaveButtonStyle,
      type: 'submit',
      disabled,
      onClick: Message.Saved(),
    },
    h,
  )
```

`disabled` writes `aria-disabled`, not `disabled`, as upstream does, so the
button keeps its focus. A `type: 'submit'` one therefore still submits its
form, on Enter or a press: refuse the submit in `update` while it should not
go.

`attributes: { button?, icon? }` adds what another component hands a slot,
before the mixins resolve, as `PasswordInput.view`'s do: a Dialog's
`initialFocus`, so the dialog opens on that button (`attributes: { button:
dialog.initialFocus }`). A class among them joins the style's, and an event or
attribute a mixin owns is a conflict. `Recipes.Button({ variant: 'icon' })`
shows the icon alone, the label still the button's name; `shape: 'square'` draws
any other variant as that square (an outlined icon button in a toolbar). A toggle
button, shadcn's Toggle, is a Button with `pressed`, and each variant has its on
look.

`trailing` draws after the label (a chevron, a count, a `Kbd.combo`); it is read as
drawn, so a decorative one carries its own `aria-hidden`. `description` is a second line
under the label, and both name the button. `mark` is a Badge or a dot on the button's
corner, on the end side whatever the writing direction. `invalid` writes `data-invalid` and
turns the button's colours to the danger tone: not `aria-invalid`, which a button's role
does not take, so the reason is text the application draws. `busy` writes `aria-busy` and
`data-busy`, and a press does nothing while it is on (a `type: 'submit'` button stops
submitting too); it stays focusable. There is no `loading` option that draws a spinner,
since that would put Spinner in every page that draws a button: compose
`icon: Spinner.view(...)`. `href` draws an anchor with the button's look; `external` opens
a new tab and says so (`words.external`, default `'Opens in a new tab'`), and a disabled
link has no `href`. `Recipes.Button({ variant: 'link' })` is the look of a link in running
text; `size: 'xs'` is a step below `sm`.

`ButtonGroup` renders a named `role="group"` that joins its `items` (buttons, fields, menus, or plain strings in `text` boxes) so borders overlap cleanly and only outer corners remain rounded. Use `orientation: 'vertical'` to stack items, `separated: true` to draw rules between solid buttons, and `Recipes.ButtonGroup` (`size`, `width: 'fill'`) to match item heights or span the container. Reach for `Segmented` when the group chooses a value.

`Kbd` draws a key badge (`{ key }`) with text or a key glyph, and `Kbd.combo({ keys, joiner? }, h)` joins multiple keys in one `<kbd>`.

### Toolbar

A `Toolbar` is one tab stop over a row of controls you draw. It owns the keys
(the arrows along its orientation, Home and End) and hands each control the
attributes of its stop; you own which control holds the stop, so Tab comes back
to the control focused last, and you draw the controls. `Toolbar.view` draws
the toolbar and does no I/O; focus moves in the browser, and `onFocus` reports
where it went.

`items` are, in order, controls `{ id, disabled?, draw }`, where `draw`
receives `{ attributes, disabled }` and puts `attributes` (the id, the
`tabindex` and a focus report) on the one focusable element and draws it off when
`disabled`; groups `{ label, controls, disabled? }`, a named `role="group"`; and
the word `'separator'`, a rule between sets. `roving` is a placed
`RovingTabindex`'s slice (`{ current }`) and `onFocus(id)` is answered with its
`Focused`. A disabled control (its own, its group's, or the toolbar's) is skipped
by the arrows and never holds the tab stop; `Toolbar.controlId(toolbarId, id)` is
the id a control draws, for a Command that focuses it. A focused text field,
textarea, select or range keeps the keys it uses, so the arrows leave a text field
only from the edge they point at: place a field last, or leave it with Tab. A key
pressed in something the toolbar did not draw, such as a menu's rows, is left to
it.

```ts
import { Toolbar, ToolbarSlots } from 'foldkit-mixins-ui'

const BarModel = Schema.Struct({ stop: Schema.NullOr(Schema.String), bold: Schema.Boolean })
const BarMessage = defineMessageUnion({ Focused: { id: Schema.String }, ToggledBold: {} })
type BarMessage = typeof BarMessage.Type

const BarStyle = Recipes.Toolbar.style()
const ToolStyle = Recipes.Button.style({ tone: 'neutral', variant: 'outline' })

const barView = (model: typeof BarModel.Type, h: HtmlBuilder<BarMessage>) =>
  Toolbar.view(
    {
      id: 'format',
      label: 'Formatting',
      roving: { current: model.stop },
      onFocus: id => BarMessage.Focused({ id }),
      items: [
        {
          id: 'bold',
          draw: control =>
            Button.view(
              {
                label: 'Bold',
                pressed: model.bold,
                onClick: BarMessage.ToggledBold(),
                attributes: { button: control.attributes },
                style: ToolStyle,
              },
              h,
            ),
        },
        'separator',
        {
          id: 'link',
          disabled: true,
          draw: control =>
            Button.view(
              {
                label: 'Link',
                disabled: control.disabled,
                attributes: { button: control.attributes },
                style: ToolStyle,
              },
              h,
            ),
        },
      ],
      style: BarStyle,
    },
    h,
  )
```

`roving` is the `{ current }` slice of a `RovingTabindex`: kept by hand here, or placed
as `Bundles.Toolbar` (`Bundle.withChild('bar', Bundles.Toolbar, { args: { current? } })`),
whose Model is passed as `roving` and whose Message `Toolbar.focused(wrap)` builds for
`onFocus`: `onFocus: Toolbar.focused(message => GotBar({ message }))`. Otherwise
`onFocus(id)` is answered by setting it. `Toolbar.configure({ base, presets })` returns a
`view` with `orientation`, `direction`, `loop` and the look given once, as every
`configure` does. `control.attributes` goes on the one focusable element, and `control.disabled`
says to draw it off: the arrows skip it. `routes` are
[application key routes](#application-key-routes) whose `input` is `undefined`.

### Command

The field points at the highlighted row through `aria-activedescendant`; ↑ and ↓
wrap through enabled rows, PageUp and PageDown move the highlight ten rows and
stop at the ends, Enter runs the highlighted one, and Home and End stay the
field's caret keys. Rows never re-sort, and a filtered-away highlight moves to
the first enabled row. A row is `{ value, label, description?, keywords?,
shortcut?, icon?, opensPage?, disabled? }`; a `shortcut` is a tuple of keys
(`['⌘', 'K']`) drawn as Kbd with `kbd` and reads left to right on a right-to-left
page. `page: { trail, onBack }` draws the pages stepped into as crumbs before the
field, and Backspace in an empty field sends `onBack`; a row with `opensPage` has
a chevron. `loading: true` says `words.loading` and marks the list
`aria-busy`, its rows still shown, and a list nothing matches says `words.empty`
(`Command.words` are the defaults, `Loading…` and `No results.`); `hints` are a
footer of keys.

`Command.hotkey(message)` is ⌘K or Ctrl+K anywhere, for an application to lift
with `Subscription.persistentEntry` and open its Dialog on; `Command.filtered(groups,
query)` is what a query leaves. `Command.keepActiveInView` beside the style
scrolls the highlighted row into view as the keys move it; like the other Mounts
that send no Message it is a mixin, off by default. The list stands in a `frame`
beside its bar, which `Command.overlayBars` drives (see [Overlay scroll
bars](#overlay-scroll-bars)). `routes` are [application key
routes](#application-key-routes) whose `handle` reads a `CommandKeyInput` of the
query, the highlighted row and the rows the keys step through.

## Text and number fields

| Widget | What it does | State |
| --- | --- | --- |
| `Input` | Single-line text input, label, and `FieldValidation` helper | Application / Adapter |
| [`Textarea`](#textarea) | Auto-sizing multi-line input with character counter | Application / Adapter |
| `PasswordInput` | Password field with reveal toggle, meter, and Caps Lock hint | Small Model / Bundle |
| [`SearchField`](#searchfield) | Native search input with conditional clear button | Application |
| `NumberField` | Editable spinbutton with locale formatting and steppers | Application |
| `OtpField` | One-time code input mirrored across visual digit cells | Application |
| [`TagsInput`](#tagsinput) | Multi-tag input with delimiter, max limit, and focus return | Small Model / Bundle |
| `InputCopy` | Read-only input with clipboard copy button and status | Small Model / Bundle |
| `Label` | Form `<label>` with required/optional indicator | Stateless |
| `Field` | Accessible wrapper (`label`, `description`, `errors`) | Stateless |
| `Fieldset` | `<fieldset>` with `<legend>` and description | Adapter |
| [`FileInput`](#fileinput) | Native file picker with selected-file list | Application |
| [`FileUpload`](#fileupload) | Full uploader with drop zone, previews, and progress | Small Model / Bundle |
| `FileDrop` | Drop-zone adapter over `@foldkit/ui/fileDrop` | Adapter / Bundle |

`Input.view` and `Textarea.view` place their own bundles when you pass a `draw` callback:

```ts
import { Input, Recipes } from 'foldkit-mixins-ui'

const FieldStyle = Recipes.Input.style({})

const emailField = (value: string, h: HtmlBuilder<Message>) =>
  Input.view(
    {
      id: 'email',
      value,
      onInput: value => Message.TypedEmail({ value }),
      type: 'email',
      placeholder: 'you@example.com',
      style: FieldStyle,
      draw: ({ input, label }, h) => h.div([], [h.label(label, ['Email']), h.input(input)]),
    },
    h,
  )
```

Given a `label` instead of a `draw`, `Input.view` draws the field itself: the
label, the control, and the `description` under it, linked to it. `start` and
`end` are drawn inside the field's box beside the control, and `labelAside`
stands beside the label, not inside it:

```ts
import { Input } from 'foldkit-mixins-ui'

const siteField = (value: string, h: HtmlBuilder<Message>) =>
  Input.view(
    {
      id: 'site',
      label: 'Website',
      description: 'Without the scheme.',
      value,
      onInput: value => Message.TypedTitle({ value }),
      start: h.span([], ['https://']),
      end: h.span([], ['.com']),
      style: FieldStyle,
    },
    h,
  )
```

The box is the `group` Slot (`data-field-group`): it carries the border, the
focus ring while the control has focus, and the dimming of a disabled field,
and the control inside goes borderless. With neither `start` nor `end` no group
is drawn and the control keeps its own border. SearchField, PasswordInput,
InputCopy and NumberField take the same two options. `variant` is `outline`,
`filled`, `ghost` or `underline`.

Beyond `type` and `placeholder`, `Input.view` takes `name`, `readOnly`, `required`,
`autocomplete`, `inputMode` and `maxLength`, so a form that submits natively needs
no hand-drawn `input`, and `attributes: { input?, label?, description? }` adds
what another component hands a slot (a blur handler, `aria-busy`) before the
mixins resolve. `Textarea.view` takes `name`, `required`, `autocomplete` and
`attributes` the same way. A field's description (`Input.field`'s and
`Textarea.field`'s) is an always-drawn `role="status"` span, even with nothing to
say, since a live region announces only what is put into it.

`Input.field` and `Textarea.field` draw a whole field from a
`FieldValidation.Field`: the value, its first error or checking mark as the
description, and `aria-invalid` where the field is invalid. `changed` maps the
typed value to a Message; `label` is the text over the control; and `draw`
places the resolved `label`, `control` and `description` bundles (the default
stacks them):

```ts
const titleField = (field: FieldValidation.Field<string>, h: HtmlBuilder<Message>) =>
  Input.field(
    { id: 'title', label: 'Title', field, changed: value => Message.TypedTitle({ value }) },
    h,
  )
```

### Textarea

A textarea also takes what more than one line wants. The recipe's `resize` is how
it changes size: `auto` (the default) grows with its text from `rows` lines (two
unless given) to `maxRows`, then scrolls; `vertical` stays `rows` lines tall and
the reader drags it; `none` holds it. A `maxLength` caps the text and counts
toward it under the field, in the warning's ink from nine tenths and the error's
at the limit, and the count describes the textarea. A `footer` draws the field as
one box, a row of controls under the text and the count at its end:

```ts
import { Textarea } from 'foldkit-mixins-ui'

const TextareaStyle = Recipes.Textarea.style({})

const replyField = (field: FieldValidation.Field<string>, h: HtmlBuilder<Message>) =>
  Textarea.field(
    {
      id: 'reply',
      label: 'Reply',
      field,
      changed: value => Message.TypedReply({ value }),
      rows: 2,
      maxRows: 8,
      maxLength: 500,
      footer: [Button.view({ label: 'Send', type: 'submit' }, h)],
      style: TextareaStyle,
    },
    h,
  )
```

`Textarea.view` takes the same `rows`, `maxRows`, `maxLength` and `count`, and
hands `draw` the `count`, `frame`, `footer` and `meta` bundles to place;
`Textarea.countOf(value, maxLength)` is the count's text. `resize: 'auto'` rests
on CSS `field-sizing`, which sizes the width by the text too where nothing else
gives one (it keeps at least 20 columns); a browser without it keeps the
textarea at its fewest lines, scrolling.

### SearchField

A native `type="search"` input (role `searchbox`) named by `label`, since a
search field wears no visible label, and a clear button drawn only while there is
text. The view keeps nothing: the application owns the text, `onInput` reports
typing, and `clear: { onClear, content? }` is what the button and Escape send; a
field given no `clear` has neither. `content` is drawn in the button in place of
the cross. Escape acts only on a
field with text, so on an empty one it still reaches an enclosing dialog.
`start` and `end` are drawn inside the field's box beside the input (a field
with no `start` draws a magnifier there), and `busy` sets `aria-busy` and
`data-busy` while a search runs: compose a spinner into `end`.
Pressing the button removes it and the focus it held, so answer `onClear` with the
`SearchField.Focus({ id })` Command, which puts focus back on the input and
answers `SearchField.Message.CompletedFocus` (`SearchField.inputId(id)` is the
input's id). `words: { clear? }` renames the button (default `Clear search`). A
disabled field takes no text or keys and draws no button. `routes` are
[application key routes](#application-key-routes) whose `input` is the field's
text.

```ts
import { Option } from 'effect'
import { Behaviors } from 'foldkit-mixins'
import { SearchField, SearchFieldSlots } from 'foldkit-mixins-ui'

const Search = defineMessageUnion({
  Typed: { text: Schema.String },
  Cleared: {},
  OpenedResults: {},
})
type Search = typeof Search.Type

const { Keys } = Behaviors

// ArrowDown opens the results, but only once there is text to search for.
const openResults: SearchField.Route<Search> = Keys.route('Open results', {
  on: [Keys.chord('ArrowDown')],
  handle: ({ input }) => (input === '' ? Option.none() : Option.some(Search.OpenedResults())),
})

const searchView = (text: string, h: HtmlBuilder<Search>) =>
  SearchField.view(
    {
      id: 'find',
      label: 'Search products',
      value: text,
      onInput: text => Search.Typed({ text }),
      clear: { onClear: Search.Cleared() },
      routes: [openResults],
      style: Recipes.SearchField.style(),
    },
    h,
  )
```

The search `update` answers `Cleared` with `SearchField.Focus({ id: 'find' })`.

### TagsInput

The tags are a list of chips named by the label, each with a `Remove <tag>`
button (`words.remove` names it, `words.mark` is its `×`), then a text input. Enter or the
delimiter (default `,`) adds the draft split at the delimiter and trimmed,
refusing empty and repeated parts and parts past `max`: a refusal
(`TagsInput.Refusal`: `Repeat`, `Empty`, `Full`) is said in a polite `message`
(worded by `words.repeat`, `words.empty` and `words.full`) and shakes the field
once, the shake travel-aware. Words are text with blanks, `{tag}` and `{max}`;
`TagsInput.words` holds the English defaults and `words` takes any of them.
`addOnBlur` adds the draft when the input loses focus (off by default).

Backspace in an empty input removes the last tag (`Message.BackspacedEmpty`, sent
only when the input itself holds no text, so text typed since the last frame is
edited, not skipped). The chips are one roving tab stop (`Model.chip`, set by
`Message.FocusMoved`): ArrowLeft and ArrowRight, swapped by `direction: 'rtl'`,
move among them, Home and End go to the ends, Backspace and Delete remove the
focused one, ArrowRight past the last returns to the input, and ArrowLeft from the
start of the input's text, with nothing selected, enters the last chip. A removal,
by button or key, focuses the chip that takes its place, else the one before it,
else the input, through the Command `update` returns. The input's keys are
`Behaviors.Keys` routes; `routes` adds the application's, and one on Enter, the
delimiter or Backspace is a `mixins:key-conflict`. With `name`, one hidden input
per tag, so a form submits the tags and not the draft.

### FileInput

A `FileInput` is a native file input and the button that labels it, so a press on
the button and Enter or Space on the focused input open the browser's dialog with
no script. The application owns the chosen files, `File`s compared by identity:
fold a pick in with `FileInput.added(files, picked, { multiple })` (a single field
takes the newest pick, `multiple` appends and skips a file already held by name,
size, type and modification time), and answer `onChange` and `onRemove` with the
`FileInput.Sync({ id, files })` Command, which writes the list back into the input
so a surrounding form submits exactly the list shown (Foldkit empties the input
after each pick; an empty list resets its value, so a removed file can be chosen
again). Answer `onRemove` with `FileInput.Focus({ id })` as well, which puts focus
on the input, since the button that held it left with its row, as
`SearchField.Focus` does; both answer `CompletedSync` and `CompletedFocus`, which
`...FileInput.cases` adds to your Message union (a missing one is a type error where
you return the Command). Each row has a `remove` button named `Remove {name}` (`words: {
remove? }`). `name`, `accept`, `multiple` and `required` are the native
attributes; `invalid` is `aria-invalid`, and `description` is read after the name.
A disabled field takes no pick and its rows no remove.

Keeping the `File`s in the Model or a Message (`Schema.instanceOf(File)`) has a cost under
`vite dev`: a `File` is not JSON, and Foldkit's dev-tools relay, which exists only where
`import.meta.hot` does, has been seen to reject with `SchemaError: Expected JSON value` as an
unhandled rejection. A production build has no relay; a test that fails on page errors (an
end-to-end run against `vite dev`) should expect it.

```ts
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { FileInput, FileInputSlots } from 'foldkit-mixins-ui'

const FilesModel = Schema.Struct({ files: Schema.Array(Schema.instanceOf(File)) })
const FilesMessage = defineMessageUnion({
  Picked: { files: Schema.Array(Schema.instanceOf(File)) },
  Removed: { file: Schema.instanceOf(File) },
  ...FileInput.cases,
})
type FilesMessage = typeof FilesMessage.Type

const FileFieldStyle = Recipes.FileInput.style()

const filesUpdate = (
  model: typeof FilesModel.Type,
  message: FilesMessage,
): Return<typeof FilesModel.Type, FilesMessage> =>
  FilesMessage.match(message, {
    Picked: ({ files }) => {
      const next = FileInput.added(model.files, files, { multiple: true })
      return {
        model: modifyFields(model, { files: () => next }),
        commands: [FileInput.Sync({ id: 'cv', files: next })],
      }
    },
    Removed: ({ file }) => {
      const next = model.files.filter(each => each !== file)
      return {
        model: modifyFields(model, { files: () => next }),
        commands: [FileInput.Sync({ id: 'cv', files: next }), FileInput.Focus({ id: 'cv' })],
      }
    },
    CompletedSync: () => ({ model }),
    CompletedFocus: () => ({ model }),
  })

const filesView = (model: typeof FilesModel.Type, h: HtmlBuilder<FilesMessage>) =>
  FileInput.view(
    {
      id: 'cv',
      label: 'Attach files',
      name: 'attachments',
      multiple: true,
      files: model.files,
      onChange: files => FilesMessage.Picked({ files }),
      onRemove: file => FilesMessage.Removed({ file }),
      style: FileFieldStyle,
    },
    h,
  )
```

Nothing here reads the input: the browser's dialog, the native input and the form
are the platform's, and the view declares them. `Sync` and `Focus` are the only
calls that touch the page.

### FileUpload

A `FileUpload` is a field that holds files and says what became of each: chosen by the
dialog, dropped or pasted, judged against limits (kind, size, count, duplicates), listed
with a thumbnail, and, when the application asks, sent. Its `Model` and `update` are the
whole machine, which the application places and folds as it places `TagsInput`; the
view draws them.

Choose by what you need to own:

| You need | Use |
| --- | --- |
| a native picker whose `File[]` you keep, with no checks, drop, previews or status | [FileInput](#fileinput) |
| a drop zone over `@foldkit/ui`'s Submodel | `FileDrop` |
| files judged, listed, previewed, dropped, removed, retried, optionally sent and sorted | `FileUpload` |

It owns the list and each entry's status. It does not own the transport (the
application's Subscription sends a file and answers in its own Messages), the order
(the application places `Reorder`), or the bytes of an uploaded file (a `Stored` entry
holds an address).

```text
Offered -> validate -> Held | Queued -> Uploading(lane) -> Done | Failed -> Retried
```

A picked, dropped or pasted batch is one `Offered` Message. `update` checks each file
(kind, then size, then duplicate), refuses a whole batch that would pass `maxFiles`, and
lists the rest `Held`, or `Queued` when the field has `lanes`. A queued file starts as a
lane frees. The Model keeps each `File` and writes the list back into the native input
after every change (`FileInput.Sync`), so a plain form post carries exactly the local
files, dropped ones included.

Place it in the application's Model and wrap its Messages:

```ts
import * as Command from 'foldkit/command'
import { FileUpload, FileUploadSlots } from 'foldkit-mixins-ui'

const UpModel = Schema.Struct({ upload: FileUpload.Model })
type UpModel = typeof UpModel.Type
const UpMessage = defineMessageUnion({ GotUpload: { message: FileUpload.Message } })
type UpMessage = typeof UpMessage.Type

const upInit = (): UpModel => ({
  upload: FileUpload.init({
    id: 'documents',
    multiple: true,
    accept: ['.pdf', 'image/*'],
    maxFiles: 5,
    maxSize: 5_000_000,
  }),
})

const upUpdate = (model: UpModel, message: UpMessage): Return<UpModel, UpMessage> =>
  UpMessage.match(message, {
    GotUpload: ({ message: inner }) => {
      const { model: upload, commands } = FileUpload.update(model.upload, inner)
      return {
        model: upload === model.upload ? model : modifyFields(model, { upload: () => upload }),
        commands: Command.mapMessages(commands ?? [], next => UpMessage.GotUpload({ message: next })),
      }
    },
  })

const UpStyle = Recipes.FileUpload.style({ layout: 'zone' })

const upView = (model: UpModel, h: HtmlBuilder<UpMessage>) =>
  FileUpload.view(
    {
      model: model.upload,
      onMessage: message => UpMessage.GotUpload({ message }),
      label: 'browse',
      name: 'documents',
      words: { prompt: 'Drop files here or' },
      style: UpStyle,
    },
    h,
  )
```

`init` refuses an `accept` token that is not `.ext`, `type/*` or `type/subtype`, a
negative or fractional `maxSize`, `maxFiles` or `lanes`, a `maxFiles` without `multiple`,
and several `initial` files without it. `update` returns an `OutMessage`: `Picked`
(the ids added and replaced, and every `Refusal`) after an offer, `Removed` after a
removal. A no-op returns the Model it was given.

**The picker.** The `input` is a native `type="file"` drawn first, a transparent pixel
rather than hidden, and the `picker` is its `label`, always its next sibling. A press
on the picker, and Enter or Space on the focused input, open the browser's dialog with
no script between; the picker rings on keyboard focus. The picker also owns the four
drag events and `data-dragging`. `Recipes.FileUpload`'s `layout` (`button`, `zone`,
`avatar`, `cover`) only restyles it. What is drawn follows what the view is given, not
the recipe: `words.prompt` draws a drop zone's invitation, `picture` draws the
single-image face, `description` and the limits draw their paragraphs. The input is
named by the picker's words (`prompt` and `label`), so give `label` the words that name
the files.

**Refusals and the live region.** Each refusal names its file and is listed in
`errors`, which is not live; one polite `status` region, drawn always, says each change
once (`3 added`, `Removed a.png`, `a.png uploaded`) and never says a percentage. Two
identical notices in a row are not spoken twice. `words` holds every sentence, with
`{name}`, `{count}`, `{max}`, `{size}` and `{reason}` standing for what it is about.

**Previews.** An added image asks for an object URL through a Command and shows it in
the row's `preview`. `FileUpload.released(model)` revokes every URL: call it from the
Message that drops the widget (a route change, a dialog closing). Nothing revokes on
unmount, so without it the URLs live until the document unloads.

**A single image.** Give `picture` a function from the first entry's address to what the
picker holds. The list is not drawn, and the one file's Remove button follows the
picker, over its corner in `avatar` and `cover`:

```ts
const UpAvatarStyle = Recipes.FileUpload.style({ layout: 'avatar' })

const upAvatar = (model: UpModel, h: HtmlBuilder<UpMessage>) =>
  FileUpload.view(
    {
      model: model.upload,
      onMessage: message => UpMessage.GotUpload({ message }),
      label: 'Change photo',
      picture: url =>
        Option.match(url, {
          onNone: () => h.span([], ['No photo']),
          onSome: src => h.img([h.Src(src), h.Alt('')]),
        }),
      style: UpAvatarStyle,
    },
    h,
  )
```

**Uploads.** `init({ lanes })` sends that many files at once; `0` sends nothing and
every file stays `Held`. A queued file takes the first free lane, and a lane number holds
for the whole send, so one Subscription entry per lane never restarts another's upload.
The application supplies the send (`foldkit-media/browser`'s `uploadFile`, a hand-written
stream, a simulation) and answers in its own Messages, which fold `Progressed`,
`Succeeded` or `Failed` back into the widget. `FileUpload.lanes` makes every lane's
entry for a count, so the entries cannot be fewer than `lanes`: take the count from the
one constant that feeds both.

```ts
import { Stream } from 'effect'

const UP_LANES = 2

const upSubscriptions = FileUpload.lanes<UpModel, UpMessage>({
  count: UP_LANES,
  model: parent => parent.upload,
  send: job =>
    Stream.make(
      UpMessage.GotUpload({
        message: FileUpload.Message.Succeeded({
          id: job.id,
          attempt: job.attempt,
          url: Option.none(),
        }),
      }),
    ),
})
```

(`FileUpload.lane({ lane, model, send })` is one lane's entry, for an application that
names its Subscription entries itself.) Removing an uploading entry empties its lane, the
entry's dependency changes and the request aborts: the same button reads `Cancel {name}`
while a file uploads. A `Failed` answer says whether it may be `retryable`; `Retried`
queues it again, as a new `attempt`. A Message of another attempt, or of an entry that
is gone, changes nothing.

Progress is a value the application builds, so a field that sends nothing never loads the
Progress widget. Give the view `progress` and an uploading row draws a bar (or, with
`Recipes.Progress({ shape: 'ring' })`, a ring) named by `Uploading {name}`; without it
the row says the same in its state text:

```ts
import { FileUploadProgress } from 'foldkit-mixins-ui'

const UpBar = FileUploadProgress.make({ style: Recipes.Progress.style() })
// FileUpload.view({ ..., progress: UpBar }, h)
```

**Pieces.** `FileUpload.parts(options, h)` returns the drawings `view` assembles, apart:
`input`, `picker`, `errors`, `status`, `summary` and an `items` entry per file with its
`preview`, `name`, `meta`, `state`, `progress`, `actions` and `grip` (an uploading row with `progress` draws no state text). Lay them into
`Table.view` or `Card.view` yourself; `view` is written in terms of `parts`, so there is
one drawing.

**Placed and configured.** `Bundles.FileUpload` is the same `init` and `update` for
`foldkit-bundle`, with `init`'s options as the args. It reports `Picked` and `Removed`,
which a placement answers with `onOut` or `Bundle.ignore`, and it sends nothing: an
application with `lanes` still adds `FileUpload.lanes` to its own Subscriptions.
`FileUpload.configure({ base, presets })` returns `{ view, parts }` bound to what a site
gives once: `style`, `words`, `picture`, `itemActions`, `progress` and `mixins`. `sort`
reads the Model at each draw and `routes` hold Messages, so both stay at the call.

**Sorting.** Order is the application's: it places `Reorder` as documented for
primitives and hands the Behavior to the view as `sort: { input, mixin }`, which draws a
grip per row, marks the list `data-sortable` and reads `input` for the Behavior. The widget
imports neither Reorder nor its pointer drag, so a field with no sorting loads neither. The
application's `onOut` applies the `Moved` fact with `FileUpload.ordered` and reads every fact
out through the one live region with `FileUpload.announce`. A keyed move drops the browser's
focus, so beside the widget's own focus Commands add `FileUploadSort.keepFocus` to `mixins`
(it keeps a grip's focus and covers `without`); it is a module of its own because it loads
`FocusRecovery`.

```ts
import { Bundle } from 'foldkit-bundle'
import { Reorder } from 'foldkit-primitives/interaction'
import { FileUploadSort } from 'foldkit-mixins-ui'

const SortRows = Bundle.declare(Reorder.bundle, 'rows')
const SortModel = Schema.Struct({ ...SortRows.fields, upload: FileUpload.Model })
type SortModel = typeof SortModel.Type
const SortMessage = defineMessageUnion({
  ...SortRows.cases,
  GotUpload: { message: FileUpload.Message },
})
type SortMessage = typeof SortMessage.Type

const SortAssembly = Bundle.parent({ Model: SortModel, Message: SortMessage }).assemble(
  Bundle.parent({ Model: SortModel, Message: SortMessage }).at(SortRows, {
    onOut: (fact: Reorder.OutMessage) => (model: SortModel) => {
      const label = (id: string) => model.upload.entries.find(entry => entry.id === id)?.name ?? id
      const said = FileUpload.announce(model.upload, Reorder.announcement(fact, { label }))
      return {
        model: Reorder.OutMessage.match(fact, {
          Moved: move =>
            modifyFields(model, {
              upload: () =>
                FileUpload.ordered(said, Reorder.apply(FileUpload.ids(model.upload), move)),
            }),
          PickedUp: () => modifyFields(model, { upload: () => said }),
          PassedOver: () => modifyFields(model, { upload: () => said }),
          PutBack: () => modifyFields(model, { upload: () => said }),
        }),
      }
    },
  }),
)

const Sorting = Reorder.behavior(SortRows)(FileUploadSlots)<SortModel, SortMessage>({
  container: 'list',
  item: 'item',
  handle: 'grip',
  items: model => FileUpload.ids(model.upload),
  orientation: 'both',
})
// FileUpload.view({ ..., sort: { input: model, mixin: Sorting.mixin }, mixins: FileUploadSort.keepFocus }, h)
```

**Keys.** Enter and Space belong to the dialog, and Backspace and Delete on the input
remove the last file; `routes` takes the rest. A route on one of those four throws
`mixins:key-conflict`, and `FileUpload.conflict(routes)` returns that diagnostic without
drawing.

**Forms.** `name` goes on the real input, and `Sync` runs after every change. A `Stored`
entry is not in the input: post its address with a hidden input of your own. Give no
`name` when `lanes` sends the bytes. `required` is the native attribute, and a field with
only stored files fails it, since the input holds none. `disabled` disables the input
and the buttons; `readOnly` draws no picker, remove or grip and keeps the input out of
the tab order, so a form still posts.

**Failure and recovery.** A Model holding a `Local` entry is not JSON: `settled(model)`
turns uploaded entries into stored ones, drops every other local file and clears
`dragging`, the refusals, the notice and the previews, and the result encodes and decodes.
A removed entry takes its button, so focus moves by Command to the next entry's remove
button, else the previous, else the input; `FileUpload.without(model, ids)` removes for
the application and moves no focus. Dropping files, writing `input.files` and the
synthetic drop are proven in Chromium only.

### Other fields

- **NumberField.** `value` is an `Option<number>` (`Option.none()` clears `aria-valuenow` and starts steppers from the bounds; clearing text emits `Option.none()`). `locale` formats and parses localized numbers (`de-DE`: `1.234,5`), or pass custom `format`/`parse` (`NumberField.parseNumber` and `NumberField.settled` are pure helpers). Arrows, PageUp/PageDown, Home/End step the value; steppers sit outside tab order and disable at bounds; `readOnly` leaves text selectable with steppers disabled; `name` submits the formatted text.
- **OtpField.** One native `input` (`autocomplete="one-time-code"`) mirrored across visual cells, with the next empty cell marked `data-next` and `mask` hiding digits as password dots. `OtpField.kept(text, length, pattern)` filters pasted text; `readOnly` allows copying and `invalid` marks the input `aria-invalid` and cells `data-invalid`.
- **InputCopy.** Stateless view; handle `onCopy` with `InputCopy.Copy({ text })` (`ClipboardMessage`). `InputCopy.init({ resetAfter? })` (default 2000 ms) and `InputCopy.update` (or `Bundles.InputCopy`) manage the `copied` and `failed` indicators in a polite status region (`words`: `copy`, `copied`, `failed`).
- **PasswordInput.** Keeps spellcheck and autocorrect off, maps `autocomplete` (`current-password` default, or `new-password`), and renders optional `strength` (`Meter.view`), `requirements` (`words.met` / `words.unmet`), and polite Caps Lock warning (`capsLockOf`). Your Model owns the text; `PasswordInput.init`/`update` (or `Bundles.PasswordInput`) owns visibility and Caps Lock state via `...PasswordInput.controls(model, onMessage)`. Supports resumable `OnInput` attributes (`{ input: [rh.KeepTyped()] }`; see [Form participation](#form-participation)).
- **Label, Field, and Fieldset.** `Label` connects to a control by `for` (derived via `FieldAssociation`), marks `required` visually and `optional` audibly, and sets `data-disabled`/`data-invalid`. `Field` wraps any custom control with header, label, description, and error alert (`Field.describedBy(h, id, { description, errors })` links descriptions before rendering). `Fieldset` adapts `<fieldset>` with `plain`, `bordered`, and `filled` variants.
- **FileDrop.** Adapter over `@foldkit/ui/fileDrop` using a `File` codec without decoding services; `Bundles.FileDrop` places its Model with `{ id }` and reports `ReceivedFiles` or `RejectedNonFiles` in `onOut`. Render with `h.submodel` and `FileDrop.toView`; `Recipes.FileDrop` rings keyboard focus and dims disabled drop zones.

## Choosing a value

The application keeps the chosen value in its Model. Widgets that submit natively take `name` ([Form participation](#form-participation)).

| Widget | What it does | State |
| --- | --- | --- |
| [`Checkbox`](#switch-and-checkbox) | Single checkbox with label and description | Application / Adapter |
| `CheckboxGroup` | Multi-select checkboxes with `selectAll` helper | Application |
| [`Switch`](#switch-and-checkbox) | On/off toggle switch with optional drag behavior | Application / Adapter |
| `RadioGroup` | Single-choice radio list with focus cursor | Small Model / Bundle |
| [`Segmented`](#segmented) | Single-select or toggle button tray | Application |
| `Select` | Native `<select>` with `optgroup` support | Application / Adapter |
| `Listbox` | Custom select dropdown with single/multi choice | Small Model / Bundle |
| `Combobox` | Filterable select or tags input with suggestions | Small Model / Bundle |
| [`Picker`](#picker) | Dropdown on desktop, bottom sheet on mobile | Small Model / Bundle |
| [`CascadeSelect`](#cascadeselect) | Nested path picker across hierarchical options | Small Model / Bundle |

### Ranges, ratings, colors, and dates

| Widget | What it does | State |
| --- | --- | --- |
| [`Slider`](#slider) | Native range input for one value, range, or thumbs | Application |
| `AngleSlider` | 0–360° circular dial with drag and steppers | Small Model / Bundle |
| [`Rating`](#rating) | Star/glyph radio group with half-step precision | Application |
| [`ColorPicker`](#colorpicker) | SB area, hue/alpha sliders, formats, and eyedropper | Small Model / Bundle |
| [`Calendar`](#calendar-and-datepicker) | Inline single, range, or multiple date picker | Small Model / Bundle |
| [`DatePicker`](#calendar-and-datepicker) | Calendar inside a popover with form inputs | Adapter / Bundle |

- **CheckboxGroup.** Each option uses `RowContent` (`value`, `label`, `description`, `icon`, `trailing`, `content`, `disabled`). Pure helpers `toggled`, `coverage` (`none` | `some` | `all`), and `setEnabled` manage selections, and `selectAll` renders a tri-state toggle row. `Recipes.CheckboxGroup` offers `variant: 'plain' | 'list' | 'card'`.
- **RadioGroup.** `Bundles.RadioGroup` manages the focus cursor and reports `Selected`; `value` stays an `Option` in your Model. `RadioGroup.readingKeys` binds both arrow axes ([Right to left](#right-to-left)).
- **Select, Listbox, and Combobox.** `Select` wraps native `<select>`. `Listbox` and `Combobox` are custom popups backed by `Choice` (`one`, `many`, `text`) with `parts` for custom row rendering, optional `fluid` highlights and `overlayBars`, and `clear` buttons. `Combobox` adds `chips` for multi-select, `empty` status text, and Home/End kept on the text caret. See [Why some components needed a fork](#why-some-components-needed-a-fork).
- **AngleSlider.** `AngleSlider.init` and `update(layout)` (or `Bundles.AngleSlider`) track the angle and drag state; `AngleSlider.configure` fixes look, layout (`step`, `largeStep`, `marks`, `restrictToMarks`), and `words`.

### Segmented

A single choice (the default) is a radio group: a `role="radiogroup"` of
`role="radio"` options with `aria-checked`, one tab stop, and the arrows, Home and
End move the choice and the focus. It requires `id`, which prefixes the options'
ids, since the arrows move focus by them; `direction: 'rtl'` swaps ArrowLeft and
ArrowRight. With `multiple: true` it is a toggle group, shadcn's and Zag's: a
`role="group"` of `aria-pressed` buttons, each a tab stop and each filling itself
(draw it without `Segmented.fluid`, whose pill marks one). `name` submits the
chosen values as hidden inputs; `disabled` turns the group off (`aria-disabled`,
no key or press taken). An option takes an `icon`, alone with `iconOnly` (named by
`aria-label` and `title`). Its `indicator` and `highlight` Slots, drawn first in
the group and given `Segmented.fluid`, slide the pressed option's pill to a new
press and move the hover to the option the pointer is on (see [Fluid
highlights](#fluid-highlights)); until it runs the pressed option fills itself.

The recipe: the chosen option takes the accent's tint, flat; that rule lives on the group, in
`variants`, so icon tiles take the group piece alone, and an icon button's own background, a
variant too, does not hide it. `tray` is a muted tray, a plain row (which sets no `display`: the
Builder owns its narrow tabs' visibility; its options tint themselves on hover as every hover is)
or an `underline`, each as wide as its options (`width: 'fill'` for a strip as wide as its
container). `size` steps the tray and its options on the ladder (`xs` a half step below compact,
24px), the tray's inset counted in, so a tray is as tall as a button beside it.

The recipe's tray and size are selected per slot:

```ts
import { Layers, Style } from 'foldkit-mixins'
import { Recipes, SegmentedSlots } from 'foldkit-mixins-ui'

const SegmentedStyle = Style.forSlots(SegmentedSlots)(
  {
    group: Recipes.Segmented({ tray: 'plain', size: 'sm' }).group,
    option: Recipes.Segmented({ tray: 'plain', size: 'sm' }).option,
  },
  { layer: Layers.standard.layer('app') },
)
```

Then a toggle group draws the options from the application's pressed values:

```ts
Segmented.view(
  {
    multiple: true,
    label: 'Text style',
    options: [
      { value: 'bold', label: 'Bold' },
      { value: 'italic', label: 'Italic' },
    ],
    pressed: model.marks,
    onPress: mark => Message.ToggledMark({ mark }),
    style: SegmentedStyle,
  },
  h,
)
// in update: modifyFields(model, { marks: () => Segmented.toggled(model.marks, mark, { multiple: true }) })
```

### Switch and Checkbox

`Checkbox.view` and `Switch.view` draw the whole row from options: the control,
its label, a line of description that also describes it, and a `labelAside` slot
beside the label. The row carries `data-checked`, `data-disabled`, `data-invalid`
and `data-position` for the recipe, so `variant: 'card'` (the row boxed, filled
while checked, one press target with the label stretched over it) is CSS over the
same markup. `Checkbox.toView` and `Switch.toView` stay the adapters, for a
layout of your own.

`Switch.draggable(onToggle)` beside the style lets the thumb be dragged: it
follows the pointer past 4px, and on release `onToggle` is sent for the side its
middle is on (nothing when that is the side it began on); a click after a drag is
swallowed, right to left mirrors it, and a disabled or read-only switch does not
drag. The thumb is held where it was let go for 300ms or until `aria-checked`
changes, so an `update` that refuses the toggle sends it back. Pass the
`onToggle` the view was given.

### Picker

Both halves are drawn and the recipe shows one, so nothing reads the width: the
Listbox (its panel kept in place) at or above the breakpoint, and below it an
opener whose Sheet lists the options as a listbox, the chosen one (or the first)
focused, the arrows, Home and End moving focus, Enter, Space or a tap choosing and
closing it. The application keeps the value, read through the Listbox's `Choice`, and
`Value` is inferred from the `choice` (`Picker.one(items)`: at most one item,
since the Sheet closes at a pick). Rows are `RowContent`; `groupBy` and `heading`
group them in the dropdown and in the Sheet; `clear` draws the Listbox's button
beside the trigger and beside the opener; `name` submits the choice once.
Opening the Sheet closes a Listbox left open. `listbox` takes `Recipes.Listbox`, which also draws the options' and the
trigger's content (`Listbox.parts`), and `sheet` takes `Recipes.Sheet`. `routes`
are [application key routes](#application-key-routes) on a Sheet option
(`item.index` is its place); the dropdown's keys are the Listbox's.

### CascadeSelect

The trigger is a combobox opening a top-layer APG tree, a column per level or one
level at a time (`layout: 'drill'`; the columns also drill in on their own when
they would not fit the window, measured as the popup opens). `config` is `{ nodes,
parents?, closeOnSelect?, loop? }`, the same object the view takes; only an
option without children is chosen unless `parents` allows any. The arrows move
within and between levels (swapped right to left), Home and End jump to the ends,
letters typed within half a second find the row whose label starts with them
(`CascadeSelect.Model.typeahead`, cleared by the `QueryExpired` Message), Enter and
Space choose (Space opens the closed trigger too). With `name` a form submits one
hidden `input` per level of the path (an id may hold any character, so no
separator joins them), or one empty input when nothing is chosen.

The chosen path is the widget's own value, so `Bundles.CascadeSelect` holds it: its
args are `{ id, value?, config }`, the `config` object the view takes too, and it
reports `Changed { value }` when the path moves (answer `Bundle.ignore` where the
parent only reads `model.<field>.value`). `helpers.set(path)` is how the parent
writes it: an empty path clears, a path that cannot be chosen is ignored, and
nothing is reported. The fixed text is `words` (`placeholder`, `clear`, `back` with
`{label}`), and `clear: true` (or `{ content }`) draws the button that empties the
value. `option: node => RowContent` draws a row's `icon`, `description` and
`trailing` (its `disabled` is the node's); `triggerText: labels => string` collapses a
long path on the trigger; `config.inline` draws the tree in place, always open,
with no trigger, which Tab focuses (pass the same `config` to `init` or the
Bundle). Not built: several chosen paths (a tree with indeterminate branches), a
search field in the panel, a footer or side panel, and a loading level.

### Slider

`onCommit` is sent with the value when the reader lets go (the range input's
native `change`, which fires on release after a drag and on each key press, where
`onChange` has sent every step on the way), and `description` is a line under the
slider that each thumb is described by. One number is one thumb across the track,
named by the label; a press anywhere on the track moves it. A range is a `group`
named by its label holding two thumbs named by `words.low` and `words.high`
(default `Minimum` and `Maximum`), each bounded by the other, so the browser stops a drag or a key at
the other thumb; `Slider.moved(range, 'low' | 'high', value, bounds)` snaps,
bounds and orders a range, and returns the same range when nothing changed.
`marks` are values dotted on the track (`data-filled` where the fill covers
them) and `showValue` draws each value, both hidden from assistive technology,
which hears `aria-valuetext`; a mark may be `{ value, label }` (`SliderMark`), its
words under the track, those at either end flush with its ends. `orientation:
'vertical'` stands it upright; `ticks` dots every step. A Slider is at least 12rem
wide; a holder that lays it narrower sets `--fk-slider-min-length`. `@foldkit/ui`'s
Slider is not adapted: draw its Submodel with Slots of your own.

### Rating

`precision: 0.5` draws two radios a star; a read-only value of any fraction fills
its last star part way. `onClear` is sent by a press on the star already chosen;
`showValue` shows the rating beside the stars, said as `words` or `labels` say it. Home and End on a
star are a key route that focuses the first or last star by its id
(`<id>-<value>`) and chooses it, as the arrows would; a read-only or disabled
rating draws no route. `name` defaults to `id`. Its tones are the shared `Recipes.Tone` vocabulary.

### ColorPicker

Keys and drags reach `update` as what was pressed, so fast keys each step from the
last color. `ColorPicker.popover` takes a Popover made with `contentFocus: true`
(it throws for one without): the panel opens on the area's thumb, a press or a
drag inside never closes it, and focus leaving it closes one the keys or a finger
opened (a mouse's stays open, as upstream's Popover does). `popover` is a file of
its own, so a page drawing the picker inline keeps neither upstream's Popover nor
its anchoring. The picker's own words are `words` (`ColorPicker.words`: `area`,
`saturation`, `brightness`, `hue`, `alpha`, `format`, `input`, `eyedropper`,
`presets`), `Bundles.ColorPicker.with({ id, color?, format? })` places its state and
reports `Changed { color }`, and `ColorPicker.configure({ base, presets })` fixes the
swatches, the sliders' look and the words once.

The view reads nothing from the environment, so the eyedropper button is the
`eyedropper` input, `false` by default on a server and in a browser alike.
`ColorPicker.canEyedrop()` is the pure feature test; call it where the
application learns its environment and keep the answer in the Model. An
application that only runs in a browser reads it in `init`:

```ts
import { Schema } from 'effect'
import { ColorPicker } from 'foldkit-mixins-ui'

const PickerModel = Schema.Struct({ picker: ColorPicker.Model, eyedropper: Schema.Boolean })

const initPicker = () => ({
  model: {
    picker: ColorPicker.init({ id: 'accent' }),
    eyedropper: ColorPicker.canEyedrop(),
  },
})
```

A server-rendered application starts `false`, so the served markup and the
browser's first render agree, and learns the answer after it has taken over, so
the button appears instead of the picker's controls being rebuilt:

```ts
import { Effect, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { ColorPicker } from 'foldkit-mixins-ui'

const EyedropperMessage = defineMessageUnion({
  LearnedEyedropper: { available: Schema.Boolean },
})

// Send it from the Command that starts the application, with the first frame drawn.
const LearnEyedropperCommand = Command.define('LearnEyedropper', {
  messages: [EyedropperMessage.LearnedEyedropper],
  execute: Effect.sync(() =>
    EyedropperMessage.LearnedEyedropper({ available: ColorPicker.canEyedrop() }),
  ),
})
```

Either way the view is given `eyedropper: model.eyedropper`. Pressing the button
runs `ColorPicker.Eyedrop`, which answers `CancelledEyedropper` and nothing else
when the runtime has no eyedropper or the user closes it: a cancel changes
nothing and shows nothing.

`ColorPicker.color('#3b82f6')` reads a literal in code (it throws on a typo);
`format`, `parse` (an `Option`) and `toOklch` are pure. `ColorPicker.Eyedrop` and
`canEyedrop` are the eyedropper's Command and check.

### Calendar and DatePicker

A Calendar's value is a `Calendar.Selection`: `Single`, `Range` or `Multiple`,
a type of the Calendar's own, so the Calendar's state holds it. `Calendar.init`
makes that state (the month shown, a second month, the selection, a range's
hover preview), `Calendar.update` folds it, and `Calendar.view(options, h)`
draws it. `Bundles.Calendar` is the same `init` and `update` for
`foldkit-bundle`; [State](#state-fold-it-by-hand-or-place-a-bundle) has a whole
example.

- **Args** (`Calendar.Args`, also `init`'s options): `id`, `today`, and
  optionally `selection` (default `Calendar.empty('Single')`), `months` (`1` or
  `2`), `minDate`, `maxDate`, `disabledDaysOfWeek`, `disabledDates` and `locale`
  (`Calendar.localeOf('de-DE')` reads one from Intl).
- **Reading the value**: `Calendar.selectedDate` (a Single's day), `rangeOf`
  (a range with both ends), `datesOf` (every day held, in order), `firstDate`,
  `isComplete`. The Bundle reports `Changed { selection }` whenever the
  selection holds other days; its `set` helper, and `Calendar.set(model,
  selection)`, set it from the parent and report nothing.
- **View options**, all optional beyond `model`, `onMessage` and `label` (the
  group's name): `weekNumbers`; `caption`: `'grid'` (the default heading
  button, which opens the month and year grids), `'label'`, or `{ dropdowns: {
  years?, month? } }`, where `month: 'label'` writes the month as text beside a
  select of years; `paging`: `'both'`, `'previous'`, `'next'`, `'none'`, or
  `'end'` for both buttons after the caption; `today: { label, selects? }`, a
  button that turns back to today's month and, with `selects`, picks it;
  `presets`, a list of `{ label, selection }` built with `Calendar.lastDays`,
  `nextDays`, `monthOf` and `day`, or written by hand; `detail: date =>
  Option<string>`, a line under a day's number; `aside` and `footer`, drawings
  of the application's own placed beside and under the months; `words`
  (`Calendar.words` lists them; `{month}`, `{date}`, `{year}`, `{from}` and
  `{to}` are filled); `style` and `mixins`.
- **Two months** share one selection and page together: the previous button is
  on the first, the next on the second, and dropdowns are on the first.
- **A time list, an event list, a second field** is another widget with its own
  state, drawn into `aside` or `footer`. The Calendar places it and knows
  nothing of it.
- **`Calendar.configure({ base, presets })`** binds `weekNumbers`, `caption`,
  `paging`, `today`, `presets`, `detail`, `words`, `style` and `mixins`
  ([Drawing](#drawing-configure-once-call-with-what-differs)). Its `presets`
  key names sets of options; the view option `presets` lists selections.
- **What it costs**: a page that draws through the adapter below keeps neither
  the state nor this view. Upstream's month and year grids ship with every
  calendar, since they are inside upstream's one Model and view; `caption:
  'label'` hides them and cannot drop them.

A DatePicker is the same Calendar in a popover, with the same split.
`DatePicker.init(args)` makes its state (upstream's picker, the selection, a
range's preview), `DatePicker.fold(model, message)` folds it, and
`Bundles.DatePicker` packages both; it reports `Changed { selection }` as the
Calendar's Bundle does. `DatePicker.view(options, h)` draws it:

- **`trigger: selection => string`** is the trigger's text, required: a date,
  both ends of a range, or a prompt. `label` names the trigger.
- **`name`** submits each chosen day as an ISO date, a range's start then its
  end; **`disabled`** and **`anchor`** are the popover's (the default stands
  under the trigger's start and is not portaled).
- **The Calendar's options go to the panel**: `weekNumbers`, `caption`,
  `paging`, `today`, `presets`, `detail`, `aside`, `footer` and `words`. A
  picker holds one month.
- **Two styles**: `style` of `DatePickerSlots` (wrapper, trigger, panel, backdrop) and
  `calendarStyle` of `CalendarSlots`, with `calendarMixins` beside it.
- **Closing** is the arg `closes`. `'complete'` (the default) closes the
  popover on the pick, or the preset, that makes the selection whole: a day,
  or a range's second end. `'manual'` closes on none, which a picker with a
  time list in `aside` needs. Escape, a press outside and the trigger close it
  either way.
- **`DatePicker.configure({ base, presets })`** binds everything but the
  wiring, `trigger`, `name`, `disabled` and the two drawings.
- The state's fold is `fold` because `DatePicker.update(selection, closes?)`
  is the adapter's, below.

The adapter is the rung below, for a calendar an application draws or folds
itself. Fold each `SelectedDate` through `Calendar.picked`; `Calendar.empty(mode)` starts
a selection and `Calendar.isComplete` says when a picker may close. Spread
`Calendar.inputs(selection, mixins, { h })` into upstream `Calendar.view`'s
inputs: its `toView` (`Calendar.toView(selection, mixins, { h })`) marks each
chosen day `aria-selected`, a range's ends `data-selected` with
`data-range-start`/`data-range-end` and every day between `data-in-range`, and its
`maybeSelectedDate` (`Calendar.selectedDate(selection)`, a Single selection's day)
agrees with it. The grid of a Range or Multiple selection is
`aria-multiselectable`. `Calendar.localeOf('de-DE')` reads upstream's `locale`
from Intl.

Options, the fourth argument of `toView`, `inputs` and `resolve`
(`CalendarOptions`): `weekNumbers`, `caption: 'label'` or `dropdowns: { model,
onShow, years?, month?, words? }` (month and year selects; answer `onShow` with
`Calendar.show`), `paging`
with `Calendar.alongside(model, other, offset)` for two months side by side,
`preview: { date, onPreview }` for a range under the pointer, and `detail: date =>
Option<string>` for a line under a day's number (a price, "2 events") that
describes its button (`ResolvedDayCell.detail`). `ResolvedDays`' paging buttons
are `Option`s, `pagingAtEnd` says both stand after the caption, and its heading
is a `caption` of four kinds (`Grid`, `Label`, `Dropdowns`, `YearDropdown`).
Presets: `Calendar.lastDays`,
`nextDays`, `monthOf`, `day`, drawn by `Calendar.presetsView`.

A DatePicker also picks a whole `Calendar.Selection`. Fold it with
`DatePicker.update(selection, closes?)`, given the selection the application keeps:
upstream closes the popover on every day picked, and this keeps it open while the
day leaves the selection unfinished (a range's first end, any day of a Multiple
selection), reporting `SelectedDate` either way for the application to fold
through `Calendar.picked`. Draw it with `DatePickerView.view` taking `selection`
and `triggerContent: selection => Html` in place of upstream's
`maybeSelectedDate` and `triggerContent`, and `toCalendarView:
Calendar.toView(selection, mixins, { h })`. Its `toView` takes no builder of the
application's: `DatePicker.toView(mixins, (resolved, h) => …)` hands `draw` the
date picker's builder. Under `name`, each chosen day is a hidden input of its own,
in order (a range's start, then its end), so `FormData.getAll(name)` reads
`[start, end]`; nothing chosen submits the name once, empty.

## Menus and overlays

Panels that stay where they are drawn go in the browser's top layer (see [The top
layer](#the-top-layer)). Dialogs, sheets, tours and floating panels return focus
by [`focusReturn`](#focus-after-removal); the popups enter and leave as
[Exits and reduced motion](#exits-and-reduced-motion) describes.

| Widget | What it does | State |
| --- | --- | --- |
| [`Menu`](#menu) | Dropdown, context menu, or long-press menu | Small Model / Bundle |
| `Menubar` | Horizontal bar of menus with arrow-key switching | Small Model / Bundle |
| [`Dialog`](#dialog) | Modal dialog adapter over `@foldkit/ui` | Adapter / Bundle |
| [`Sheet`](#sheet-and-drawer) | Draggable modal drawer sheet | Small Model / Bundle |
| [`Drawer`](#sheet-and-drawer) | Non-modal bottom sheet peeking beside the page | Small Model / Bundle |
| [`Popover`](#popover-tooltip-and-hover-card) | Anchored popover adapter in the top layer | Adapter / Bundle |
| [`Tooltip`](#popover-tooltip-and-hover-card) | Anchored tooltip adapter in the top layer | Adapter / Bundle |
| [`HoverIntent`](#popover-tooltip-and-hover-card) | Delayed hover card adapter (`Recipes.HoverCard`) | Adapter / Bundle |
| `Anchor` | Top-layer floating positioning (`behavior`, `topLayer`) | Behavior / Mount |
| [`FloatingPanel`](#floatingpanel) | Draggable, resizable non-modal window | Small Model / Bundle |
| [`Tour`](#tour) | Guided spotlight steps anchored to page targets | Small Model / Bundle |

`Menubar` renders a row of `Menu` panels (`Recipes.MenubarMenu` flattens triggers); one trigger holds the tab stop, ArrowLeft/ArrowRight moves between menus (or opens the next when one is open), and hovering another trigger switches menus while open. `Anchor.behavior` positions a floating slot against a trigger by id, and `Anchor.topLayer` shows an in-place panel in the browser's top layer.

### Menu

`anchor` is merged over the default `{ placement: 'bottom-start', gap: 4, padding: 8, portal: false }` (no gap at a point): `{ placement: 'top-end' }`. `header` and `footer` are Html drawn in the panel above and below the rows, in the `header` and `footer` slots, and are no row. A row's `content` Html is drawn in place of its words; `label` stays its name and typeahead key.

A row is an `ItemRow` (`{ value, label }`: the `value` names the row, unique among
the menu's rows and their submenus' items, and is what `isRowDisabled`,
`Selected` and `Menu.checkChosen` use; the `label` is what is drawn and what
typeahead matches, so two rows may read alike; type the values by a union with
`Row<'a' | 'b'>`), a `CheckRow` (`check: 'checkbox' | 'radio'`, `checked`:
`menuitemcheckbox` or `menuitemradio` with `aria-checked`; choosing it sends
`Selected` and leaves the menu open, the application keeping `checked`, a radio
row's group being the rows of its `group`), or a `SubmenuRow` (`items`, each an
`ItemRow`, one level deep, and `isItemDisabled?` asked of their values). Any row
may name a `group` (rows next to each other with one group stand under its
heading, a separator between groups), a `shortcut` (keys drawn at the row's end as
Kbd with the view's `kbd`, named in `aria-keyshortcuts`; the menu binds nothing),
an `icon` (an `Html` drawn before the label in the `icon` slot, hidden from
assistive technology), a `hint` (a quiet note at the end of the row, before the
shortcut, in the `hint` slot) and `tone: 'destructive'` (`data-tone`). A
submenu's items take the same parts.

A submenu's row is a `menuitem` with `aria-haspopup="menu"` and `aria-expanded`;
ArrowRight, Enter or Space opens it on its first row, ArrowLeft or Escape closes
it back to the row (under `direction: 'rtl'` the submenu opens on the left and the
arrows swap), a pointer resting 150ms opens it, and choosing a leaf closes
everything. `Selected` names the row's `value` and the `value` of the submenu's row
it came from. `isAnimated` gives the panels upstream's transition marks, for the
recipe's fade; `isModal` makes the rest of the page inert while the menu is open.
Pass `Menu.fluid` beside the style (in `submenuMixins`, not `mixins`, where rows
open submenus).

`opensAt: 'point'`, with `Menu.target(onMessage, h)` on the area, is a context
menu: a right press records its point and the `contextmenu` after it opens the
menu there; a finger or a pen held there `Menu.HOLD_MS` (500ms) opens it too, as
iOS fires no `contextmenu`, while one that moves 10px is a scroll. Give the area
`-webkit-touch-callout: none` and `user-select: none`, or iOS shows its own callout
over it. A `@foldkit/ui` Menu the application folds itself, for typed items or
groups, is drawn through the panel adapter instead, and opens at a point with
`Menu.drawAtPoint` and `Menu.pointTarget` (see [Why some components needed a
fork](#why-some-components-needed-a-fork)).

### Dialog

Slots beyond upstream's are this package's: `handle` (the Sheet's grabber,
`aria-hidden` unless the Sheet has more than one point, when it is a separator),
`body`, `scroll`, `scrollBar`, `scrollThumb` and `footer`. Draw `scroll` and its bar
inside `body` and the answers in `footer`, and a body taller than the screen
scrolls under the title while the footer stays (`Dialog.overlayBars` beside the
style draws the overlay bar).

- **Context.** `attributes` adds to a bundle before the mixins resolve.
  `covered: true` marks the panel `data-covered`, for a dialog another was opened
  from (draw the second inside the first's `dialog`, beside its panel), and the
  recipe steps it back. `isLeaving: Dialog.isLeaving(model)` draws the panel
  `inert` for the rest of its exit, so no press or key acts on it (upstream takes
  the backdrop and close button out of a leaving dialog but leaves the
  application's own controls live); the Sheet does this itself.
- **Alert dialog.** `role: 'alertdialog'` in the context
  (`Dialog.toView(mixins, { h, role: 'alertdialog' }, draw)`) puts
  `role="alertdialog"` on the `dialog` bundle. Draw no close button, and drop the
  Messages `Dialog.isDismissal` names (Escape, the backdrop, the close button) in
  `update`, so only its own buttons, closing with `@foldkit/ui`'s `close`, answer it.
- **Focus.** `Dialog.focusReturn` among the mixins gives focus a place to go when
  the opener is gone as the dialog closes (see [Focus after
  removal](#focus-after-removal)). `Dialog.update(model, message)` and
  `Dialog.open(model)` are `@foldkit/ui`'s `update` and `open` plus one repair: an
  open that meets the exit (the dialog opened again while it leaves) puts focus back
  inside it, on the `focusSelector`, the initial-focus mark, else the first control,
  which a bare upstream `open` does not.
- **On-screen keyboard.** `Dialog.keyboard` among the mixins of a dialog or sheet
  that holds a field measures the keyboard on the panel, and the recipes keep the
  panel above it (a Dialog shrinks, a bottom Sheet stands on it): iOS Safari and
  Chrome on Android otherwise leave it under the keys.
- **Recipe.** `title: 'hidden'` leaves the heading to a screen reader alone (it
  still names the dialog, as `display: none` would not). `close: 'none'` leaves the
  `closeButton` Slot unstyled for an application whose own buttons carry it (the
  Slot is still the Dialog's, with its `RequestedClose`). `motion: 'none'` opens,
  closes and steps back at once, backdrop and panel alike, whatever the `motion`
  knob (reduced motion is as it was). The backdrop is the `overlay.scrim` token.

```ts
import * as UiDialog from '@foldkit/ui/dialog'
import { Dialog, DialogSlots } from 'foldkit-mixins-ui'

const DialogStyle = Recipes.Dialog.style({ size: 'sm' })

// The dialog's Model and Messages are @foldkit/ui's: the application folds them
// with `Dialog.update`, and opens it with `Dialog.open`.
const confirmDialog = (
  model: UiDialog.Model,
  toMessage: (message: UiDialog.Message) => Message,
  h: HtmlBuilder<Message>,
) =>
  h.submodel({
    slotId: model.id,
    model,
    view: UiDialog.view,
    viewInputs: {
      toView: Dialog.toView(
        [DialogStyle.mixin, ...Dialog.focusReturn],
        { h, isLeaving: Dialog.isLeaving(model) },
        dialog =>
          h.dialog(
            dialog.dialog,
            dialog.isVisible
              ? [
                  h.div(dialog.backdrop),
                  h.div(dialog.panel, [
                    h.h2(dialog.title, ['Discard changes?']),
                    h.div(dialog.footer, [h.button(dialog.closeButton, ['Cancel'])]),
                  ]),
                ]
              : [],
          ),
      ),
    },
    toParentMessage: toMessage,
  })
```

### Sheet and Drawer

**Sheet.** `draw` lays out `DialogSlots`' bundles with `h.div(sheet.handle)` in
the panel. The panel stands on `side`'s edge (`data-side`); a drag follows the
pointer and settles at the nearest of `points` (the share of the panel shown,
ascending; a top or bottom sheet with a point below 1 takes its `size`'s full
height, and below its highest point its content holds still, so a swipe up raises
it), or, flicked or dragged far enough past the first, closes it, unless
`dismissible: false`. The Dialog keeps focus, Escape and scroll lock. With more
than one point the handle is a focusable `separator` named by `words.handle`
(default `Resize sheet`), its `aria-valuenow` the percent shown: the arrow keys
along the edge (the one toward the page raises it: ArrowUp on a bottom sheet,
ArrowDown on a top one, ArrowLeft on a right one, ArrowRight on a left one), Home
and End step between the points through `Message.SnappedTo { at }` (an index into
`points`) and stop at the ends, and Escape still closes; an opened sheet with
points takes focus on the handle unless the panel has an initial-focus element.
With one point the handle stays decoration, `aria-hidden`; with `handle: 'none'`
an application moves the sheet with `SnappedTo` from a control of its own. A
leaving Sheet's panel is `inert` until it is gone, and `Sheet.open` is
`Dialog.open`'s, so a Sheet opened again while it leaves takes focus back; one
whose opener is gone as it closes returns focus through `Dialog.focusReturn`
among its mixins. `scalesPage` with `Recipes.sheetPage` on the page beside the
sheet, never around it, steps the page back while it is open. The slide and its
exit run on `Theme.tokens.motion.sheet` and `sheet-exit`, which default to the
`slow` tier and its exit and are multiplied by `travel`: an application that
keeps another timing sets them in its tokens (`Theme.define({ motion: { sheet:
'500ms', 'sheet-exit': '500ms' } })`), and `sheetPage` follows `sheet`. The panel's
padding keeps clear of the safe areas (`Theme.tokens.safe`) on the sides it touches.

**Swiping (Sheet and Drawer).** `swipe: { from?, flickSpeed?, closeShare? }` says
how it is swiped: a finger drags it from anywhere on the panel (`from: 'panel'`, the
default), yielding to content that can still scroll its way, so a long one scrolls
back to its top and then goes, and a field or `data-no-swipe` starts no drag; a
mouse drags it by the handle, and `from: 'handle'` keeps every pointer there. A
release faster than `flickSpeed` (0.4px/ms) is a flick, and a slow one goes once
dragged `closeShare` (a quarter) of the panel.

**Drawer.** `draw` lays out `panel`, `handle`, `body` (the body may sit below what
else peeks with the handle) and, optionally, `grip`, more to drag it by (a row of
tabs: vertical swipes drag it, sideways ones still scroll). A drag follows the
finger and lets go open or down by its speed, then by how far it came. A click or
Enter on the handle toggles it, and the click a browser sends after a drag does
not. `label` names the handle once, and its `aria-expanded` says whether the panel
is open, so the name does not change with the state. The body is hidden
(`visibility: hidden`) when the slide ends, not as it starts. `Drawer.keepFocus`
beside the style moves focus to the handle when the drawer closes with focus in its
body, which the hidden body would otherwise drop to the page. The panel's inline
style is the drag's: set `--fk-drawer-peek` (default 5rem) and
`--fk-drawer-height` (default 70dvh) on an ancestor or in a style. The handle is a
44px target drawn tight to its bar, and the peek stays above the home indicator.

### FloatingPanel

The drag trigger (`role="button"`, named `Move <title>`) moves the panel and eight
edges resize it, kept within the viewport; the arrows move it from the drag
trigger and resize it from the bottom-end corner; minimize, maximize, restore and
close. A press or focus inside returns the `Raised` OutMessage, which the
application folds into the `order` its panels stack by with
`FloatingPanel.raise(order, id)`. `routes` are [application key
routes](#application-key-routes) beside Escape (unless `closeOnEscape` is false);
the arrows on the drag trigger and the corner are the panel's own, and a press they
handled still reaches the panel. `FloatingPanel.focusReturn` is opt-in and is the
one way focus returns.

The limits (`min`, `max`, `grid`, `overflow`) are `init`'s options and live in the
Model, so `FloatingPanel.update()` reads the one copy; `update(limits)` still
overrides them for a call. `Bundles.FloatingPanel` places the window with `init`'s
options as its args and reports `Raised` in `onOut`; its helpers are `open`,
`close`, `openBeside(openerId, { side?, gap? })` and `dock(edge, thickness)`.
`openBeside` (also a function of the module) reads the opener's box in a Command
and answers `Placed`, which puts the panel there within the limits and the
viewport; `rectBeside(anchor, size, options)` is the pure rule, for a place of your
own. `Docked { edge, thickness }` lays the panel along an edge of the viewport as
measured when it lands; it stays a window and drags away. `controls` names the
header's buttons (default all three; restore appears with whichever stage was
reached), `words` their names and the drag trigger's and corner's (`Move {title}`,
`Resize {title}`), and `FloatingPanel.configure({ base, presets })` fixes the look,
words, controls and mixins once.

```ts
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Bundles, FloatingPanel } from 'foldkit-mixins-ui'

const Windows = Bundle.compose({ order: Schema.Array(Schema.String) }).pipe(
  Bundle.withChild('notes', Bundles.FloatingPanel, {
    args: { id: 'notes', rect: { x: 80, y: 120, width: 320, height: 220 }, grid: 20 },
    onOut: out => model => ({
      model: { ...model, order: FloatingPanel.raise(model.order, out.id) },
    }),
  }),
)
```

### Tour

The target scrolls into view; Next, Back and the arrows move on, Escape and Skip
end it, and `update` returns `Ended { completed }`. A step without a target, or
whose target is missing, stands in the middle. `routes` are [application key
routes](#application-key-routes) on a step, such as a digit jumping to that step,
beside the arrows and, unless `closeOnEscape` is false, Escape. `Tour.focusReturn`
is opt-in and is the one way focus returns: ending the tour gives focus back to what
had it before it started.

The steps are data in the Model (`init`'s `steps`), so `update()`, `start(model)`
and the view read one copy; `update(config)`, `start(model, config)` and the view's
`config` override it for a call. `Bundles.Tour` places it with `{ id, steps? }` as
its args, reports `Ended` in `onOut`, and `helpers.start` starts it. `content(step,
index)` draws a step's words as Html in their place (a key to press, a list), still
describing the step's dialog. `advanceOnClick: Tour.advanceOnClick` moves the tour on
when the reader presses the step's target through the cutout (not with `interactive:
false`); it is a value in a file of its own, so a tour without it loads no listener.
`words` (`Tour.words`) are the buttons' names and the step's place, `{step} of
{count}`; `Tour.configure({ base, presets })` fixes the look, words and mixins once.

### Popover, Tooltip and Hover Card

Popover, Tooltip and Hover Card are drawn by upstream views whose Mounts this
package cannot wrap, so their panels go in the top layer by an element of their
own (see [The top layer](#the-top-layer)). A Popover's `layer` Slot, `Popover.anchor()`
and `Tooltip.anchor()` give `portal: false` and the placement: 12px and 8px off the
trigger, 8px inside the viewport, flipping and shifting. Each draws an `arrow` slot
in its panel that points at the trigger.

**State as Bundles.** Every overlay's state is a Bundle, one file apiece:
`Bundles.Dialog.with({ id, isAnimated?, focusSelector?, dismissible? })`,
`Bundles.Sheet`, `Bundles.Drawer`, `Bundles.Popover`, `Bundles.Tooltip` (`showDelay`
in milliseconds) and `Bundles.HoverIntent` (`openDelay`, `closeDelay`). The upstream
ones report `Opened` and `Closed` (a Tooltip `Shown` and `Hidden`) for `onOut`, and
`helpers.open` and `helpers.close` are for a control of the application's. A Dialog
that is not `dismissible` drops the `RequestedClose` that Escape, the backdrop and
its close button send, so only an answer closes it, through `helpers.close`: an
alert dialog is that, with `role: 'alertdialog'` in `Dialog.toView`'s context. A
Sheet opened by the Dialog's own `RequestedOpen` rests at its `opensAt` point, as
`helpers.open` does. Pass `isAnimated: true` and the panel stays drawn while it
leaves, so the recipe's fade runs on the way out as on the way in. The drawing
stays the adapter's: what a dialog or a popover holds is the application's
content, so the examples compose it rather than pass it as options. `Dialog`'s
`overlayBars`, `keyboard` and `focusReturn`, `Drawer.keepFocus` and `Toast.keepFocus`
are files of their own, so a page that never names one keeps neither its Mount nor
the primitive it runs. A Drawer imports no Sheet and no Dialog (`swipe.ts` holds
what the two share).

## Navigation and structure

| Widget | What it does | State |
| --- | --- | --- |
| [`Tabs`](#tabs) | Tablist and active panel with optional close buttons | Small Model / Bundle |
| [`Nav`](#nav) | Stateless `nav` adapter or multi-panel menu | Application / Small Model |
| `Breadcrumb` | Page trail with collapsible middle ellipsis or menu | Application |
| [`Pagination`](#pagination) | Page buttons, range summary, and page-size select | Application |
| [`Steps`](#steps) | Ordered step indicator with optional progress line | Application |
| [`Sidebar`](#sidebar) | Collapsible, resizable navigation column and mobile sheet | Small Model / Bundle |
| `AppShell` | Page frame with skip link, header, sidebars, and footer | Stateless |
| `Accordion` | Collapsible heading/panel list (`Accordion.toggled`) | Application / Bundle |
| [`Disclosure`](#disclosure) | Single toggle button and animated panel | Application / Bundle |
| [`TreeView`](#treeview) | Hierarchical tree with keyboard navigation and checks | Small Model / Bundle |

- **Breadcrumb.** Renders links for prior steps and `aria-current="page"` for the current step, placing separators between items so wrapped lines never start with one. Pass `collapse: { max, onExpand }` to show an ellipsis button, or `BreadcrumbMenu.make(...)` (imported from its own module) to open hidden steps in a `Menu`.
- **AppShell.** Draws a skip link to `#main`, sticky header (`banner`), optional `side` column, `main` region, optional `aside` landmark, and `footer`. On narrow screens (`< md`), the side column moves into the header row and `aside` moves below `main`.
- **Accordion.** Keeps closed panels rendered with `inert` and matches open/close timing via `--fk-collapse-duration` and `--fk-collapse-close-duration` so switching sections animates smoothly. `Accordion.toggled` and `Bundles.Accordion` manage `multiple` and `collapsible` rules.

### Tabs

`Tabs.view` is the usual drawing (rows with a mark, words, a trailing Html and a panel; `orientation: 'vertical'` lays the panel beside the tabs; `close` and `routes` as below); it takes `mixins: [...Tabs.fluid]` as a value, so a page that never passes it never loads what glides the indicator. Its `root` slot holds the tablist and the panel. `Tabs.toView` stays the lower rung for a drawing of your own.

`TabsContext.close: { onClose }` gives each tab a close button (no tab stop, hidden
from assistive technology) and Delete, named in `aria-keyshortcuts`; answer with
`Tabs.closing(tabs, chosen, closed)`, which gives the tabs left, the tab chosen
and the index to focus with `FocusTab`. `TabsContext.routes` takes keys the
application answers on a tab, such as F2 renaming it, beside Delete: the input is
the tab's `TabInfo`, and a tab with no key to answer draws no keydown at all.
`overflow: 'scroll'` is one line with its edges fading; `'wrap'` is a grid of equal
columns that fills the row and falls to fewer columns, no tab cut off (a column is
no narrower than three control heights; `.extend` the tablist's `--_fk-tab-min` to
change it). `selection: 'tint'` is the accent's tint and ink instead of the raised
pill, as a pressed Segmented option is; upstream's `orientation: 'Vertical'` stands
the rule at the tabs' inline end. `Tabs.fluid` glides the indicator (see [Fluid
highlights](#fluid-highlights)).

### Nav

The navigation menu shows its panels in the top layer, with the APG's
disclosure-navigation keys (Escape, ArrowDown into a panel, the arrows, Home and End
along the row; a press outside and focus leaving close it). A trigger names its
panel in `aria-controls` only while the panel is drawn, and links are keyed by place
as well as address, so two links to one address do not collide. A panel's `groups`
are `{ label, href, description?, current? }` columns. `routes` takes
[application key routes](#application-key-routes) on the top-level links and
triggers, beside the row's own: the input is the entry and `item.index` its place;
`panelRoutes` takes keys on a panel's links, where the input is the link and
`item.index` its place among the panel's links. `Nav.fluid` glides a line to the
current link and a faint pill to the one the pointer nears.

### Pagination

Fewer than two pages draws no stops; with a `range` it still draws the summary and
the page-size select. `range.choose: { sizes, onPerPage }` adds a select of
rows per page (labelled `words.perPage`, `Rows per page`) that sends `onPerPage` with the
size; the application sets `perPage` and a page that keeps its rows in view.
`numbered: false` leaves previous and next alone; `ends` draws first and last.
`icons: { first?, previous?, next?, last? }` draws an Html in place of a stop's word, which stays the button's accessible name.
`Pagination.configure({ base, presets })` fixes the style, words, windows, `ends`, `numbered` and `icons` once.
`words: { label, first, previous, next, last, stop, ellipsis, ofCount, perPage, summary }` (`Pagination.words`, merged word by word) is every word it says, as text with blanks: `stop` is `"{word} page"` (each stop's name), `ofCount` ` / {count}`, `summary` `"{from}–{to} of {total}"`, for another
language. A stop at an end is `aria-disabled`, not `disabled`, so it keeps focus and
sends nothing. The current stop reads `aria-current` and holds ` / 12` in a
`pageCount` span hidden from assistive technology; compact shows only that stop and
no ellipses.

### Steps

The marker is hidden from assistive technology, so `words: { complete?, current?,
upcoming? }` (defaults `Steps.words`: `Completed`, an empty word that says nothing,
`Upcoming`; the current step's `aria-current="step"` already says it) say each step's state in text after its
title, in the `state` slot. `progress` (0 to 1) fills the connector after the
current step when the recipe's connector is a progress bar. A horizontal row
narrower than 32rem shows only the current step's words, wrapping inside an even
share so the markers stay evenly spaced (a word longer than 40% of the row is cut),
and narrower than 17rem draws them on a line of their own under the markers.

A step may state its own `state` (`complete`, `current`, `upcoming`, `loading` or `error`) over the one
`current` gives it: a later step already complete, the one being taken `loading`, a step that
`error`ed. `aria-current` still follows `current`, and each state has a word (`loading`: `In progress`,
`error`: `Failed`). A step's `trailing` Html (a time, a badge) ends its row in the `trailing` slot, and
the recipe's `labels: 'current'` keeps only the current step's words beside its marker, `'hidden'` none,
the rest left to a screen reader. `Steps.configure({ base, presets })` fixes the style and words once.

### Sidebar

`groups` are `{ id, title?, collapsible?, action?, rows }`, a row a `SidebarLink` (`{
id, label, href, current?, icon?, badge?, action? }`) or a `SidebarBranch` of nested
links (`items`). An `action` (`SidebarAction`: `{ label, icon, message }`) is a button
at a titled group's heading or beside a link, where it takes the badge's place under
the pointer (both show on a touch screen). Groups and branches open like an
accordion's, several at once; the current page is `aria-current` and `Sidebar.fluid`
glides a marker to it. `collapse: 'offcanvas'` (default) takes the whole column off
the page; `'icons'` leaves a rail of icons named in Tooltips (`tooltip`, a Tooltip
style; a rail that draws a row `init`'s `rows` did not list throws, since a Tooltip
is state only `init` can make). With `sheet` (a Sheet style), an opener shows it in a
Sheet on a phone. Shut groups and a collapsed column stay drawn and `inert`.
`Sidebar.init({ width: { size?, min?, max? } })` makes the column resizable, its
width in the Model: a `resize` handle on its edge drags it, the arrows step it, Home
collapses it (a collapsed one leaves the key alone) and End goes to the widest, Enter
or a double-click collapses it, and dragged below half `min` it collapses, coming
back at the width the drag began at.

A row and a nested link take `RowContent`'s parts: `content` drawn in place of the
label's text (the label still names it), and `trailing` Html at its end in a
`trailing` Slot (a key, a status dot), which gives way to the row's action under the
pointer as the badge does. `words` (`Sidebar.words`: `show`, `hide`, `open`,
`resize`, each with `{label}`) name the toggle, the phone's opener and the resize
handle. A group shuts over the time it opens in. `Sidebar.fluid` and the Slots are
files of their own, so a sidebar without the glide keeps no `FluidHover`.

### TreeView

One tab stop; Up/Down move through the rows showing, stepping over shut and disabled
ones; Right opens or steps in, Left shuts or steps out (swapped under `direction:
'rtl'`); Home/End; letters typed within 500ms of each other find the next showing row
whose label starts with all of them (`TreeView.Model.typeahead`, cleared by the
`QueryExpired` Message, which an application that wraps the Messages passes through to
`update`); `*` opens every row beside the current one that holds rows; Enter, Space or
a click chooses a row and opens or shuts a branch. Keys reach `update`, which decides
from its own Model and sends a focus Command. A shut group stays drawn and `inert`.

`checkable` (on the view and `update`) gives each row a box: the Model's `checked`
holds the leaves, a branch reads checked, mixed or not from them
(`TreeView.checksOf`), and Space checks the current row in `update`. The Model's
`checked` is the one owner: the checked rows that hold no rows. An application that
stores or sends another shape converts at the edge, with two pure functions over the
same `nodes`, `TreeView.checkedAs(nodes, checked, 'leaf' | 'branch' | 'trunk')` and
`TreeView.leavesOf(nodes, value)`:

```ts
import { TreeView, type TreeNode } from 'foldkit-mixins-ui'

const nodes: ReadonlyArray<TreeNode> = [
  {
    id: 'src',
    label: 'src',
    children: [
      { id: 'button', label: 'button.ts' },
      { id: 'tree', label: 'tree.ts' },
    ],
  },
  { id: 'readme', label: 'README.md' },
]

TreeView.checkedAs(nodes, ['button', 'tree', 'readme'], 'branch') // ['src', 'button', 'tree', 'readme']
TreeView.checkedAs(nodes, ['button', 'tree', 'readme'], 'trunk') // ['src', 'readme']

const seeded = TreeView.init({ id: 'files', checked: TreeView.leavesOf(nodes, ['src']) })
// seeded.checked is ['button', 'tree']
```

A row holding rows is listed once every row it holds that holds none is checked, a
disabled one included. Ids the tree does not hold are left out of both. Independent
checks that do not cascade, and branches whose rows are not loaded yet, are not
modelled.

### Disclosure

`Disclosure.view` draws the button and the panel from options (see its row above);
the adapter below is the rung for a layout of your own. The recipe draws the button
and the panel's box, and `animatePanel` keeps the shut panel inert and moves its
height.

<!-- docs-check
declare const ToggledDetails: (payload: { readonly isOpen: boolean }) => Message
-->

```ts
import { Disclosure as UiDisclosure } from '@foldkit/ui'
import { Style } from 'foldkit-mixins'
import { Disclosure, DisclosureSlots, Recipes } from 'foldkit-mixins-ui'

const DetailsStyle = Recipes.Disclosure.style({ variant: 'bordered' })

const details = (isOpen: boolean, h: HtmlBuilder<Message>) =>
  UiDisclosure.view(
    {
      id: 'details',
      isOpen,
      onToggle: isOpen => ToggledDetails({ isOpen }),
      toView: attributes => {
        const disclosure = Disclosure.resolve(attributes, [DetailsStyle.mixin], {
          input: undefined,
          h,
        })
        return h.div(
          [],
          [
            h.button(disclosure.button, ['Shipping details']),
            disclosure.animatePanel(h.div(disclosure.panel, ['Shipped in two days.'])),
          ],
        )
      },
    },
    h,
  )
```

## Showing content

Stateless views render directly from the values you pass. Hide visual-only text with `U.srOnly` from `foldkit-mixins/utilities`.

| Widget | What it does | State |
| --- | --- | --- |
| [`Table`](#table) | Sortable, selectable, expandable data table | Application |
| [`Card`](#card-and-item) | Content card with media, actions, and optional press | Application |
| [`Card.group`](#card-and-item) | Responsive card grid with optional `Card.fluid` hover | Application |
| [`Item`](#card-and-item) | Flexible list row primitive (`Item.group`) | Application |
| `Avatar` | User image or initials with status, badges, and groups | Stateless |
| `Badge` | Status pill, optional link or dismiss button | Stateless |
| `Typography` | Semantic text levels (`h1`–`h4`, `body`, `code`, `display`) | Stateless |
| `Separator` | Horizontal or vertical divider with optional label | Stateless |
| `Empty` | Empty-state placeholder with icon, title, and action | Stateless |
| `Skeleton` | Loading bars (`lines`, `avatarRow`, `card`, `tableRow`) | Stateless |
| [`Carousel`](#carousel) | Scroll-snap carousel with autoplay and dots | Small Model / Bundle |
| `Marquee` | Seamless scrolling strip that pauses on hover/focus | Small Model / Bundle |

- **Avatar.** Renders `role="img"` named by the person (and status) with initials underneath until the image loads; accepts a URL `src` or `Avatar.picture(...)` (`foldkit-media`) for responsive `1x`/`2x` images. `Avatar.group` stacks overlapping avatars and summarizes extras (`+N`).
- **Badge, Typography, Separator, Empty, Skeleton.** `Badge` styles tones via `data-tone` (`Recipes.badgeTones` maps custom attributes) and takes either `onDismiss` or `href`. `Typography` renders the semantic element for each `level` and sets `data-level`. `Separator` adapts to horizontal or flex/grid vertical orientation automatically. `Skeleton` sets `role="status"` when given a `label` and `aria-hidden="true"` otherwise.
- **Marquee.** Measures content with `Resize` and fills the viewport with `inert` clones without duplicate `id`s, pausing on hover, focus, or its pause button (and scrolling natively under reduced motion).

### Images, icons and codes

| Widget | What it does | State |
| --- | --- | --- |
| [`Image`](#image) | Responsive `<picture>` with layout and aspect ratio | Stateless |
| `Figure` | `<figure>` with `<figcaption>` placed in DOM reading order | Stateless |
| `Frame` | Grouped tray of panels with header, action, and footer | Stateless |
| `AspectRatio` | Fixed aspect-ratio frame (`square`, `video`, `portrait`) | Stateless |
| `Icon` | Inline `IconData` SVG or custom glyph with optional badge | Stateless |
| `CodeBlock` | Syntax-tokenized code with line marks, copy, and collapse | Application |
| `QrCode` | Vector SVG QR code with overlay support and PNG/SVG export | Stateless |
| [`Chart`](#chart) | Bars, line, area, or donut chart with data table fallback | Small Model |
| `ImageCropper` | Pan, zoom, rotate, and crop viewport with `Export` Command | Small Model / Bundle |
| `SignaturePad` | Pointer signature canvas with undo/redo and SVG/PNG export | Small Model / Bundle |

- **CodeBlock.** Renders syntax tokens (`{ from, to, kind }`) from `foldkit-richtext-code`, line numbers from `startLine`, whole-line `marks` (`added`, `removed`, `error`, etc.), optional `collapsed` toggle (working statically via `data-collapsed` even without `onToggle`), `onLineSelect`, `lineAction`, and `copy` with polite status announcements. Pass `CodeBlock.follow` in `mixins` to keep streaming output scrolled to the end.
- **QrCode, ImageCropper, SignaturePad.** `QrCode.encode` and `pathOf` are pure, and `QrCode.Download` saves PNG or SVG. `ImageCropper` supports mouse/touch/wheel/keyboard resizing, optional `ImageCropper.zoomSlider`, and `RequestedExport`. `SignaturePad` supports pointer filtering (`pointers: ['pen']` ignores palm touches), `fallback` typed name, form `name` submission as SVG, and `RequestedPng`.

```ts
import { parse } from 'foldkit-media/icons'
import { Style } from 'foldkit-mixins'
import { AspectRatio, AspectRatioSlots, Icon, IconSlots, Recipes } from 'foldkit-mixins-ui'

const Frame = Recipes.AspectRatio.style({ ratio: 'video' })
const Mark = Recipes.Icon.style({ size: 'sm' })

// `h` is the view's builder. `content` is `Html`.
AspectRatio.view({ content: h.span([], ['poster']), style: Frame }, h)

// An icon as data: an import from `virtual:foldkit-icons/…`, or parsed by a script.
const check = parse('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5"/></svg>', 'check')
Icon.view({ icon: check, label: 'Done', style: Mark }, h)
Icon.view({ icon: check, style: Mark }, h)
```

`Icons.glyph` is the other tool: a mask on an element that already exists.

### Table

A column with `rowHeader` draws its cells as `th scope="row"`, so a screen reader
names a row by it. A column with a `sortKey` heads with a button that sends
`sort.onSort(column)`, and the sorted column carries `aria-sort`;
`Table.nextSort(sort, column)` cycles ascending, descending and none. A column's
`sortKey` keeps the literal it is written as, so `onSort` receives `'name' | 'price'`
and not a `string`: a Message field of `Schema.Literals(['name', 'price'])` needs no guard
in `update`. Columns written in the call infer it; columns hoisted into a constant go
through `Table.defineColumns<Row>()([...])` (or `as const`), and a call that names its
type arguments (`Table.view<Row, Message>`) gets `string`. `selection`
puts a checkbox on every row and one in the heading, mixed while only some are
chosen; `expansion` opens a row's detail in a row below it (`aria-expanded`,
`aria-controls`; its buttons' column is headed `Details` for a screen reader,
`words.details` renames it); `empty` stands across the table while there are no rows
(an `Empty.view`). The sort, the chosen and the open rows are the application's. The
table stands in a `frame`, which scrolls sideways when the table is wider than the
screen (under a `static` header; a `sticky` one sticks to the application's scroller,
which scrolls it). With `fluid: Table.fluid`, one highlight behind the body rows follows the
pointer, skipping detail and empty rows. Filtering, column reorder and resize, and
virtualized rows stay with `foldkit-data-grid`. A selection draws its boxes through `control: Table.checkboxes(style?)`, which is where Checkbox is imported, and one of your own is an object with a `draw`. A column's `footer` draws a totals row after the body, its control columns left blank; a `header` that is markup holds an icon beside the words; the recipe's `header: 'hidden'` keeps the headings for a screen reader (a table read down its first column), `borders: 'cells'` boxes the cells and `layout: 'fixed'` gives each column an equal share.

A keyed row that a re-sort moves is taken out of the tree and put back, which
blurs the control focused inside it. `FocusRecovery.behavior(TableSlots)({ owner: 'frame',
parts: { expandButton: ['same'], sortButton: ['same'], control: ['same'] } })`, given
in `mixins`, finds the control again at its new place. A control you draw in a cell is
a part when you mark it: `h.DataAttribute(FOCUS_MARK.part, 'control')` and
`h.DataAttribute(FOCUS_MARK.key, rowKey)` (`FOCUS_MARK` is from `foldkit-primitives/dom`).

```ts
import { Option } from 'effect'
import { Table, TableSlots } from 'foldkit-mixins-ui'

interface Product {
  readonly name: string
  readonly price: string
}

const Sort = defineMessageUnion({ Sorted: { column: Schema.Literal('name') } })
type Sort = typeof Sort.Type

const ProductsStyle = Recipes.Table.style()

const productsTable = (
  rows: ReadonlyArray<Product>,
  sorted: Option.Option<Table.TableSort<'name'>>,
  h: HtmlBuilder<Sort>,
) =>
  Table.view(
    {
      columns: [
        { header: 'Product', sortKey: 'name', rowHeader: true, value: row => row.name },
        { header: 'Price', numeric: true, value: row => row.price },
      ],
      rows,
      rowKey: row => row.name,
      sort: { by: sorted, onSort: column => Sort.Sorted({ column }) },
      style: ProductsStyle,
    },
    h,
  )
// in update, on Sorted: modifyFields(model, { sorted: () => Table.nextSort(model.sorted, column) })
```

### Card and Item

`press` is `{ onClick }` or `{ href, external? }`: one button or link stretched over
the card (`overlay`, from `press.ts`, shared with Item; its type is `Press`), named by `label` or the title (a pressable
card with neither throws); `action`, `footer` and the dismiss button stay pressable
above it. `selected` is `aria-pressed` on the button, `aria-current="page"` on the
link. `headingLevel` (2 to 6, default 3) is the level of the title's heading. A
`disabled` card's overlay is `aria-disabled` and sends nothing, so it stays focusable
(a link loses its `href`). `dismiss: { onDismiss, always? }` is revealed on
hover and focus unless `always`, and always on a touch screen; its name and mark are
`words.dismiss` and `words.dismissMark`. `recoveryPart` marks
the dismiss button as a `FocusRecovery` part (see [Focus after
removal](#focus-after-removal)). The root carries `data-selected`, `data-disabled`,
`data-pressable` and `data-dismissible` (the header then keeps clear of the button).

In the recipe an `image` bleeds to the card's edges (16:9 when stacked); `media`
puts a bare icon (`svg`, `img`) in a tile and lets anything else, an Avatar say, lead
at its own size. `elevation` is a step of the surface ladder (lighter in a dark
scheme; a contact and an ambient shadow in a light one). `lift: 'hover'` lifts under
the pointer, which `travel` stills (not in a `Card.group` given `fluid: Card.fluid`, whose
highlight is the hover there). In a group, a card draws no hover of its own, whatever its
`surface`; divided cards are usually `surface: 'plain'`.

An `Item`'s `press` is the same stretched control, named by `label` or the title, with
`actions` staying pressable above it; `selected` is `aria-pressed` or `aria-current`.
An avatar beside a name and a line is an Item with the avatar as its media. `header` and
`footer` are bands across the row above the overlay, for a heading or a note that holds
controls of its own. An Item page does not ship `Card` or `FluidHover`: both read
`press.ts`.

### Carousel

Previous and next are `aria-disabled` at the ends unless `loop`; a dot per place the
track can rest (or `thumbnails` in their place) and a polite status name the slide
shown. Each slide is a group named "2 of 5". The track is a CSS scroll-snap scroller,
so swipes move it natively, and `ScrollSettle` reports where a swipe rests, so the
dots follow the finger. Every press, swipe and timer reaches `update`, which returns
the `Carousel.ShowSlide` Command that scrolls the track: do not keep the slide
yourself. With `autoplay` it moves on every `delay` (4s), the current dot filling as
it waits; it pauses under the pointer, stops when focus arrives by the keys, quiets
its status while it rotates, and draws the APG's rotation button first.
`reducedMotion` in `init` (the application's reading of `prefers-reduced-motion`,
from its flags or a `MediaQuery`; `init` stays pure so a server's Model equals the
client's) starts an autoplaying carousel stopped, with the rotation button to start
it. A slide out of view is `inert`, so its content takes no focus, which would scroll
the track.

### Image

A `picture` with a `source` per format the provider offers and an `img` with its
candidates, `sizes`, `width` and `height` (the box is held before the file arrives),
lazy unless `priority` (then `fetchpriority="high"`). `alt` is what the image shows in
words (a string, or `Image.described(text)`) or `Image.decorative` (`alt=""`,
`role="presentation"`), never omitted. `Provider.hosted` takes only a `HashedAsset`, so
facts without a content hash are a type error there. The `img` carries
`--fk-image-ratio`, `--fk-image-placeholder` (none behind a transparent image) and
`data-layout` (`fixed`, `constrained`, `full`); a provider with no URL for the image
leaves an empty frame marked `data-unavailable`, which keeps its box and is
`role="img"` named by its alt text (hidden when decorative). `--fk-image-focus` places
a crop at the asset's focal point. `placeholder: 'detail' | 'average'` chooses how much
of a ThumbHash to paint; by default the picture for `priority`, the color otherwise.
`Image.watchLoad`, beside the style, marks the `img`'s `data-state` (`loading`,
`loaded`, `failed`); the recipe hides a failed image, keeping its box. `Image.audit`,
beside the style in a development build, warns in the console of an image drawn wider
than its file (blurry) or far narrower (wasted bytes), and of more than one image drawn
with `priority`. `Image.preloadsIn` is a `foldkit-ssr` `Head`: the `<link
rel="preload">` of each image the rendered page drew with `priority`.

### Chart

The value axis's ticks are round and reach both ends, zero included; the plot is drawn
in percentages, so it fills its container's width with nothing measured and renders the
same on a server. The pointer lights a category's band and its tooltip, and the plot is
a tab stop whose arrows, Home and End step through the points while a polite status says
each. The drawing is hidden from assistive technology, which reads a data table,
visually hidden unless `table: 'shown'`. Series take `chart-1` to `chart-5` in order, or
the `color` they name; a sixth series throws. `kind` is a value you import, so a page ships the kinds it draws: `Chart.bars` (`stack: true` puts one series on another), `Chart.line` and `Chart.area` (`curve: 'step'` runs level to the next category before it rises; `markers: 'always'` puts a dot on every point; an area takes `stack`), and `Chart.donut` (`hole: 0` is a pie, with no total in it). A kind of your own is a `ChartKind`: its `entries`, `points` and `head` say what the legend, the status line and the data table read, and its `draw` is given a `ChartFrame` (the lit point, the legend, the plot's attributes and a `pointer(at)` attribute) and returns the plot, so the title, the legend placement, the status and the table stay the chart's.

## Feedback and status

| Widget | What it does | State |
| --- | --- | --- |
| `Alert` | Inline live region (`role="alert"`/`status`) or page banner | Application |
| [`Toast`](#toast) | Dismissible toast stack with actions and swipe | Small Model / Bundle |
| `Progress` | Determinate, stacked, or indeterminate progress bar/ring | Stateless |
| `Meter` | Scalar gauge (`good`, `fair`, `poor`) with threshold | Stateless |
| `Spinner` | Animated loading wheel (`ring`, `dots`, `bars`, `pulse`) | Stateless |
| `Timer` | Countdown or stopwatch driven by Effect's `Clock` | Small Model / Bundle |

- **Alert.** Use `layout: 'inline'` (with optional `assertive`) for dynamic feedback, or `layout: 'banner'` (with `label`) for a static `section` landmark. Supports `actions`, `onDismiss` (`words.dismiss`), and `recoveryPart` ([Focus after removal](#focus-after-removal)).
- **Progress and Meter.** `Progress` takes `value` as an `Option` (`Option.none()` renders indeterminate) or `ProgressSection`s for stacked bars, plus `buffer` and `segments`. `Meter` computes `data-level` (`good` | `fair` | `poor` via `Meter.levelOf`) and supports `orientation: 'vertical'` and `segments`.
- **Spinner and Timer.** `Spinner` sets `role="status"` when given `label` and `aria-hidden` without one. `Timer` reads Effect's `Clock` (`TestClock`-compatible), exports `Timer.phase(model)`, and packages state in `Bundles.Timer`.

### Toast

The newest stand in front, spread out while the pointer or focus holds the stack, at
most `max` (3) showing; a held stack or a hidden page pauses every countdown, keeping
the time left; a swipe toward the edge past `threshold` dismisses one. A toast is
spoken in a polite region, an error in an assertive one, each toast a keyed child of
its own (the regions are not atomic), so one added beside another, or with the same
words, is still read by itself. A toast takes `actions` (each a `{ label, value }`
that dismisses it and says its `value` in `Acted`) and a `cancel` (words for a button
that only dismisses it), drawn in an `actions` row before the close button. A toast
that is already leaving does not act again when an action is pressed. A promise toast
is `show` with `type: 'loading'`, the work run as a Command, and `settle` on the
toast's `id` when its Message comes back; through `Bundles.Toast` the helpers return
no id, so read `Toast.nextId(model)` before `show`. `words` is `{ label, close }`
(`Toast.words`); `tone: 'invert'` is the text's ink as the card, as Sonner's inverted
toasts. A payload toast that shows progress replaces what an entry holds with
`ToastView.make(schema).revise(model, entryId, payload)`, keeping its place,
animation and dismissal timing; upstream has no such operation.
`ToastView` binds upstream's `Toast.make` for the payload and swaps in the
transcribed view; the dismiss control stays inside the consumer's `entryToView`, so it
is content, not a slot. `Toast.keepFocus` hands focus from a dismissed toast to a
neighbour (see [Focus after removal](#focus-after-removal)).

## Long lists and scrolling

| Widget | What it does | State |
| --- | --- | --- |
| `ScrollArea` | Scrollable container with fade edges and overlay bars | Stateless |
| [`Resizable`](#resizable) | Split panes with keyboard and pointer drag handle | Small Model / Bundle |
| `VirtualList` | Boxed virtualized list rendering visible rows only | Adapter / Bundle |
| [`WindowList`](#windowlist) | Document-scrolled virtual list keeping focus on held rows | Small Model / Bundle |

- **ScrollArea.** Put a height on `viewport` or `root` and optional width on `root`; pass `ScrollArea.overlayBars` (imported separately) to overlay scrollbars ([Overlay scroll bars](#overlay-scroll-bars)).
- **VirtualList.** Wraps `@foldkit/ui/virtualList` (`Bundles.VirtualList` emits `NearEnd` for pagination and supports `VirtualList.overlayBars`); unmounts off-screen rows including focused ones—use `WindowList` when document scroll or held focus matters.

### Resizable

The handle is a `separator` with its value, stepped by the arrows and sent to the
bounds by Home and End (a `collapsible` panel collapses when the key reaches its
side, as the APG asks, and a collapsed one leaves the key alone); with an `id` the
handle's `aria-controls` names the first panel; a drag follows the `Move` Mount from
where it began over the group the `Resize` Mount measured. Under `direction: 'rtl'`
the first panel is on the right, so ArrowLeft and a drag to the left grow it.
`collapsible: 'first' | 'second'` (with `collapsedTo`) collapses that panel on Enter or
a double-click and puts it back where it was, easing there while a drag follows the
pointer at once; the bounds `init` was given are read by both `update` and the view. A split fills its
panel, so splits nest either way.

### WindowList

It draws the rows in view of the document's viewport between spacers as tall as the
rest, so the page keeps its own scrolling: the browser restores its offset, a `sticky`
header above the list sticks, and Space and End move it. Use `VirtualList` for a list
in a box of its own.

- **Measuring.** Its one Mount on `root`, `WindowList.Track`, reads where the viewport
  lies over the list on every scroll, resize and resize of the page (`WindowViewport`),
  so content above it, or growing above it, counts, and measures each drawn row's border
  box (`MeasureRows`; space rows with padding: a row is `flow-root`). The rows already
  drawn when it starts are read at once, so no row leaves before its height is known. A
  row not yet measured counts `estimatedHeight`, or with `unmeasured: 'mean'` the mean of
  the rows measured above 0: for rows whose height the window's width decides, which
  `init` cannot know. A row still drawn is measured again only when it resizes, so keep
  the keys of the rows drawn: `WindowList.windowOf(model, keys)` is which rows are drawn,
  for loading what is in view, and `WindowList.keep(model, keys)` drops the heights of
  rows that left. A Scene test of a page drawing the list resolves it with
  `Scene.Mount.resolveAll(WindowList.resolveTrack(onMessage,
  WindowList.Message.Placed({ top, height })))`, the reading going through the view's own
  `onMessage`.
- **Held row.** A row holding focus stays drawn beside the window while it is scrolled
  out (`Message.Focused` reports it as `Model.held`, `WindowList.heldRow(model, keys)` is
  its index, and `keep` retains its height), so the reader keeps their place in the tab
  order; `VirtualList` keeps neither.
- **Reveal.** `WindowList.reveal(model, index, align?)` is the `Reveal` Command that
  scrolls the page until row `index` is drawn and shown, however far outside the window
  (`align`: `nearest` by default, `start`, `center` or `end`); return it from an
  `update`, and it answers `Message.CompletedReveal`.
- **Find in page.** `findable: (item, index) => text` lets the browser's find in page
  match rows that are not drawn: each row outside the window is a `hidden="until-found"`
  stand-in holding that text in the spacers, which keep their height, and a match
  (`Message.Found`) reveals its row. It costs a node and a text node per row, so it is
  for lists of thousands; it is drawn once the runtime has placed the list and only where
  `WindowList.supportsFindable()` says the browser finds hidden text.
- **Server pages.** A server's page opens the list at a row with `from` (a page's
  `?from=`): the window starts at that row, with no overscan above it, and the rows above
  take no room until `Track` places the list, which gives them their room and scrolls the
  window by what that moved the first row drawn, so a reader sees the same rows before and
  after the runtime takes the page over. The first `Placed` sets `from` back to 0, and
  the list follows the window. For a page without scripts, `WindowList.pageOf(model,
  keys)` is `{ start, end, previous, next }`: the rows drawn and, as `Option`s, the rows
  the pages either side open at (`previous` the first whose window reaches this one's
  start), for links that set `?from=`.

## Chat

| Widget | What it does | State |
| --- | --- | --- |
| `ChatMessage` | User, assistant, or system message bubble (`ChatMessage.group`) | Stateless |
| [`MessageScroller`](#messagescroller) | Auto-scrolling `role="log"` with unread jump button | Small Model / Bundle |
| `ThinkingIndicator` | Polite live status indicator (`dots`, `pulse`, shimmer) | Stateless |
| `ThinkingSteps` | Collapsible trace of assistant steps and durations | Application / Bundle |
| `Questionnaire` | Multi-step chat prompt form yielding `Answered` summary | Small Model |

- **ChatMessage.** Renders `user` bubbles at the inline end and `assistant` replies at the start; supports `sending`/`sent`/`failed` states with `onRetry`, hover/focus `actions`, and `streaming: true` (`aria-busy` with `text-wrap: wrap`). Render Markdown content with `foldkit-richtext-markdown` + `foldkit-richtext-dom/view`.
- **ThinkingIndicator.** Mount with `active: false` before work starts so transitions to active announce cleanly in the polite live region; animations honor reduced motion.
- **ThinkingSteps.** Displays `pending`, `running`, `done`, `failed`, or `skipped` steps (`Option<boolean>` openness auto-opens while running and closes on finish; `Bundles.ThinkingSteps` manages open step state).
- **Questionnaire.** Composes `single`, `multiple`, and `text` `Question` schemas; `update` validates required answers, focuses missing prompts, and emits `OutMessage.Answered({ answers })` before showing the summary.

### MessageScroller

The log follows the newest message while the reader is at the end and stops when they
scroll up, or when an upward wheel or ArrowUp, PageUp or Home arrives before that
scroll. A Ctrl wheel, a wheel over a nested element that can scroll up itself, and a
key another handler prevented, with Ctrl, Meta or Alt down, or typed into an input,
textarea, select or editable element, do not count. A shorter viewport stays at the
end while following. The messages and the text of a streamed answer are the
application's.

## Mechanisms shared by many widgets

Each of these is described here once; the catalog rows link to it.

### Application key routes

A widget's own keys are `Behaviors.Keys` routes on one keydown owner, and the widgets
below take a `routes` option for keys the application answers itself (F2 renaming a
tab, Ctrl+A choosing every option, ArrowDown opening results). A route is built with
`Keys.route(name, { on: [Keys.chord('ArrowDown')], handle })` from
`foldkit-mixins`' `Behaviors`: `handle` receives the press (`key`, `modifiers`, the
widget's `input` and, for a repeated slot, `item`) and returns an `Option` of a Message,
or of `Keys.focus(id, message)` to move focus as well; `Option.none()` declines the
press.

A route on a gesture another route on the same owner already takes throws
`mixins:key-conflict`, naming both. `Keys.first(a, b)` is the way to let two routes
declare one chord: `a` is asked first, and `b` only when `a` does not take the press or
declines it.

| Widget | Widget keys | Route `input` |
| --- | --- | --- |
| `Command` | Arrows, PageUp/PageDown, Enter (Home/End stay in input) | `CommandKeyInput` (query, active row, visible rows) |
| `SearchField` | Escape (when text is non-empty) | Current field text |
| `Menubar` | Arrows, Home, End | Not read |
| `CascadeSelect` | Arrows, Home, End, Enter, Escape, printable keys (open panel) | `undefined` |
| `Tour` | Arrows, Escape (unless `closeOnEscape: false`) | `undefined` |
| `FloatingPanel` | Escape (unless `closeOnEscape: false`); drag/corner arrows | `undefined` |
| `Picker` | Arrows, Home, End on Sheet options (`item.index`) | `undefined` |
| `Nav` | Top-level links (`routes`) and panel links (`panelRoutes`) | Entry or link, `item.index` |
| `Tabs` | Delete when closable (`TabsContext.routes`) | `TabInfo` |
| `TagsInput` | Enter, delimiter, Backspace | `TagsInput.Model` |
| `FileUpload` | Enter, Space, Backspace, Delete (check via `conflict`) | `FileUpload.Model` |
| `Toolbar` | Arrows, Home, End | `undefined` |

```ts
// ArrowDown asks the first route; when there is no text to search for it declines, and
// the second moves focus into the results list and sends the same Message.
const toResults: SearchField.Route<Search> = Keys.route('Focus results', {
  on: [Keys.chord('ArrowDown')],
  handle: () => Option.some(Keys.focus('results', Search.OpenedResults())),
})

const searchWithFocus = (text: string, h: HtmlBuilder<Search>) =>
  SearchField.view(
    {
      id: 'find',
      label: 'Search products',
      value: text,
      onInput: text => Search.Typed({ text }),
      clear: { onClear: Search.Cleared() },
      routes: [Keys.first(openResults, toResults)],
    },
    h,
  )
```

#### Checking routes without drawing

Each of these widgets exports `conflict(routes, input?)`: the `mixins:key-conflict` that
drawing it with `routes` would throw, as an `Option` of the diagnostic, for a screen
where a user rebinds keys and the candidate set must be judged before anything is drawn.
It asks `Keys.conflict` of the widget's own routes and `routes` together, the own routes
being the list the view itself draws, so it names the same two routes the view would,
and also reports two application routes on one gesture. It reads gestures only: no
handler runs and nothing is drawn.

`input` is the part of the view's options that decides which keys the widget owns, with
the view's defaults. A widget whose own keys never vary takes `routes` alone. One that
draws nothing while closed (`Tour`, `FloatingPanel`, the `CascadeSelect` panel) is
checked as open, since a route that clashes in any state is a clash.

| Widget | `input` |
| --- | --- |
| `Command`, `SearchField`, `CascadeSelect`, `Picker` | none |
| `Menubar` | `{ direction? }` (`'rtl'` swaps which arrow route is named) |
| `Tour`, `FloatingPanel` | `{ closeOnEscape? }` (Escape reserved unless `false`) |
| `Toolbar` | `{ orientation? }` (default `'horizontal'`) |
| `Tabs` | `{ close? }` (Delete reserved when closable) |
| `TagsInput` | `{ delimiter?, direction? }` (default `','`) |
| `Nav` | `{ panelRoutes? }` (checks top-level and panel link keys) |

```ts
// Escape is the field's own key, so this candidate is refused with the diagnostic that
// drawing the field with it would throw; a free key gives `Option.none()`.
const candidate: SearchField.Route<Search> = Keys.route('Open results', {
  on: [Keys.chord('Escape')],
  handle: () => Option.some(Search.OpenedResults()),
})
const refusal = Option.map(SearchField.conflict([candidate]), diagnostic => diagnostic.message)
```

### Focus after removal

When the element that held focus leaves the page, the browser drops focus to `body`.
Three mechanisms keep it, all opt-in because none sends a Message, which a Scene test
of every page drawing the widget would otherwise have to resolve.

- **A neighbour takes it** (`FocusRecovery`, from `foldkit-primitives/interaction`).
  `FocusRecovery.behavior(Slots)({ owner, parts, parent? })` on the slot that holds
  the repeated items (the `owner`) marks each `parts` slot and names where focus goes
  when that part is removed, hidden, made `inert` or `disabled`: steps tried in order
  (`same`, `next`, `previous`, `parent`, `stop`, `{ part }`, `owner`) until one can take
  it, and focus that was moved elsewhere is never taken. The widgets that draw a
  removable control take the part's name: `recoveryPart` on `Alert` and `Card` marks
  their dismiss button, and `Toast.keepFocus` is such a behavior on the
  toast container: from a dismissed toast's close button focus goes to the close
  button of the toast behind it, else the one in front, and from an action to a
  neighbour's action, else a close button; with no toast left, focus is not moved.
  Without `recoveryPart`, dismissing one drops focus to the page.
- **The opener gets it back** (`focusReturn`). `Dialog.focusReturn`,
  `Tour.focusReturn` and `FloatingPanel.focusReturn` (a Sheet takes the Dialog's) give
  focus back to what had it before the widget opened, by `FocusReturn`'s rules when
  that is gone: an element with the opener's id, its `FocusRecovery` fallback steps,
  the dialog below, then the page's first tabbable element. The Tour and the
  FloatingPanel keep no opener of their own; upstream's Dialog return goes to the
  opener and, with none, to `body`.
- **A control takes it** (`keepFocus`, a Command). `Drawer.keepFocus` moves focus to
  the handle when the drawer closes with focus in its body, which the hidden body would
  otherwise drop to the page. `SearchField.Focus` and `FileInput.Focus` put focus back
  on the input after the button that held it left, and `TagsInput.update` returns a
  focus Command after a removal. `FileUpload.update` does the same: the next entry's remove
  button, else the previous, else the input, and after a retry the entry's remove button;
  `FileUploadSort.keepFocus` (opt-in, in `mixins`) covers what no widget Message causes.

```ts
import { Alert } from 'foldkit-mixins-ui'
import { FocusRecovery } from 'foldkit-primitives/interaction'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'

const Container = Slot.make({ capability: Capability.Container })
const AlertListSlots = Slots.define({ list: Container, item: Container })
const Dismissal = defineMessageUnion({ Dismissed: { name: Schema.String } })
type Dismissal = typeof Dismissal.Type

// Dismissing an alert hands its focus to the next one, else the previous one.
const alertList = (names: ReadonlyArray<string>, h: HtmlBuilder<Dismissal>) => {
  const builders = SlotView.buildersFor(
    AlertListSlots,
    [
      FocusRecovery.behavior(AlertListSlots)<undefined, Dismissal>({
        owner: 'list',
        parts: { item: ['next', 'previous'] },
      }).mixin,
    ],
    { input: undefined, h },
  )
  return h.div(
    builders.list.attrs(),
    names.map(name =>
      h.keyed('div')(
        name,
        [],
        [
          Alert.view(
            {
              layout: 'inline',
              title: name,
              onDismiss: Dismissal.Dismissed({ name }),
              recoveryPart: 'item',
            },
            h,
          ),
        ],
      ),
    ),
  )
}
```

### Form participation

Widgets that carry a value take `name` and put it where a form reads it, so a form that
submits natively needs no hand-drawn input:

| Widget | What `name` submits |
| --- | --- |
| `Input`, `Textarea`, `PasswordInput` | Text value (supports native `required`, `autocomplete`) |
| `NumberField` | Formatted display text |
| `OtpField` | Code string |
| `Slider`, `AngleSlider` | Slider value(s) or hidden angle input |
| `Rating` | Native radio value (`name` defaults to `id`) |
| `CheckboxGroup` | One hidden input per checked value, in order |
| `Segmented` | One hidden input per chosen value, in order |
| `TagsInput` | One hidden input per tag (excludes draft) |
| `CascadeSelect` | One hidden input per path level, or one empty input |
| `DatePicker` | One hidden input per chosen day (start then end) |
| `FileInput` | Native file input kept synced via `FileInput.Sync` |
| `FileUpload` | Native file input synced for local files via `Sync` |
| `Checkbox`, `Switch`, `RadioGroup`, `Listbox`, `Combobox` | Via their `hiddenInput` / `hiddenInputs` Slots |

A `disabled` Button is `aria-disabled`, not `disabled`, and still submits: refuse the
submit in `update`.

What reaches server markup is data, not closures. A page that answers before its script
runs (`foldkit-ssr`'s [resumable
pages](https://github.com/doeixd/foldkit-plus/blob/main/packages/ssr/README.md#resumable-pages-answering-before-the-runtime-boots))
cannot write a closure into the server's markup. There, give `onInput` the `OnInput`
attribute the resumable builder makes from a Message member; the view adds it as it
would the closure, and `KeepTyped` keeps what is typed before the script runs:

```ts
import { Resume } from 'foldkit-ssr/client'

const resumableEmail = (value: string, h: HtmlBuilder<Message>) => {
  const rh = Resume.builder(h)
  return Input.view(
    {
      id: 'email',
      value,
      onInput: rh.OnInput(Message.TypedEmail),
      type: 'email',
      draw: ({ input, label }) =>
        rh.div([], [rh.label(label, ['Email']), rh.input([...input, rh.KeepTyped()])]),
    },
    rh,
  )
}
```

`PasswordInput` draws its own input, so `KeepTyped` goes in its `attributes`, which adds
to a Slot before the mixins resolve. Give it only while the field is enabled: a disabled
field sends nothing, and the server refuses a kept field with nothing to replay
(`UnkeepableField`).

```ts
import { PasswordInput } from 'foldkit-mixins-ui'

const resumablePassword = (password: string, shown: boolean, h: HtmlBuilder<Message>) => {
  const rh = Resume.builder(h)
  return PasswordInput.view(
    {
      id: 'password',
      label: 'Password',
      value: password,
      onInput: rh.OnInput(Message.TypedPassword),
      visible: shown,
      onToggle: Message.ToggledPassword(),
      attributes: { input: [rh.KeepTyped()] },
    },
    rh,
  )
}
```

### Right to left

Logical properties carry most of the recipes, and a few things follow the direction
explicitly:

- **A `direction` view option.** Menu, Menubar, Nav, TreeView, Resizable, Segmented,
  Toolbar, TagsInput, CascadeSelect, FloatingPanel, Tour, Sidebar and a horizontal
  Listbox take `direction?: 'ltr' | 'rtl'` (a Toast stack takes it in `init`). Under
  `'rtl'` the view swaps ArrowLeft and ArrowRight before building its Message, so
  Messages and `update` stay in reading order, and draws the direction as its root's
  `dir`, so the CSS (a submenu's side, a chevron) reads what the keys read. Unset, the
  keys read left to right and the page's `dir` stands.
- **`readingKeys` for upstream's keys.** Tabs, RadioGroup and Calendar handle their
  arrows in upstream bundles no view option reaches, so `Tabs.readingKeys`,
  `RadioGroup.readingKeys` and `Calendar.readingKeys`, passed beside the style, are a
  Mount that reads each arrow by the element's own `:dir()` before upstream's handler
  sees it. They are opt-in for the reason `fluid` is (see [Fluid
  highlights](#fluid-highlights)). `RadioGroup.readingKeys` reads both arrow pairs
  whichever way the group stands (ArrowRight and ArrowDown go on, ArrowLeft and ArrowUp
  back; the horizontal pair swapped on a right-to-left page).
- **Indicators.** `Segmented.fluid`, `Tabs.fluid` and `Nav.fluid` measure their
  indicator again when a `dir` anywhere in the document changes, since flipping it moves
  the items without resizing anything.

```ts
const TabsStyle = Recipes.Tabs.style()

Tabs.toView([TabsStyle.mixin, Tabs.readingKeys], { h }, ({ tablist, tabs }) =>
  h.div(tablist, tabs.map(tab => h.button(tab.tab, [tab.value]))),
)
```

### Exits and reduced motion

A popup or dialog enters and leaves when drawn with `@foldkit/ui`'s `isAnimated`
(`Menu.init(id, rows, { isAnimated: true })`, a Popover's `isAnimated`): a popup fades and
grows on the fast tier, from the side its anchor placed it on, and a dialog on the slow
one, each leaving on the quicker exit. A leaving Dialog is drawn `inert` with
`isLeaving: Dialog.isLeaving(model)` in its context, and the Sheet does so itself; a
Disclosure's `animatePanel` moves the panel's height, which the recipe scales by the
`motion` knob. `Recipes.Dialog({ motion: 'none' })` (and the Sheet's) opens, closes and
steps back at once.

Durations are the theme's: the `motion` knob multiplies them (`'0'` stills every recipe
transition), and a duration of something that moves or resizes is also multiplied by
`travel`, which reduced motion zeroes so that fades stay. A Marquee's viewport scrolls
instead of moving under reduced motion, a ThinkingIndicator holds every movement, and a
Carousel's `init` takes the application's reading of `prefers-reduced-motion` and starts
an autoplaying carousel stopped.

### Fluid highlights

Tabs, Segmented, Nav, Sidebar, TreeView, Menu, Listbox and Combobox take a `fluid` mixin
list beside the style that glides one highlight, or an indicator, to the item the
pointer is near and back to the chosen one; a Table and a Card group take `fluid:
Table.fluid` and `fluid: Card.fluid`, values passed the same way. A Mount does the measuring and moves it. It
is off by default because a Scene test resolves every Mount with a Message and these
send none, so a default would burden the tests of every page that drew one; the same
reason makes `readingKeys`, `keepFocus`, `focusReturn`, `keepActiveInView` and the
`overlayBars` opt-in mixins.

`Tabs.fluid` measures the chosen tab on the tablist (`Measure`) and moves one highlight
to the tab nearest the pointer (`FluidHover`), born at the chosen tab and returning to it:

```ts
Tabs.toView([TabsStyle.mixin, ...Tabs.fluid], { h }, ({ tablist, indicator, highlight, tabs }) =>
  h.div(tablist, [h.div(indicator), h.div(highlight), ...tabs.map(tab => h.button(tab.tab, [tab.value]))]),
)
```

The recipe draws the `line` variant's rule or the `pill` variant's pill on the indicator,
which springs to a new choice, and dims the pill while another tab is hovered. Until
`Tabs.fluid` runs, as before a page hydrates, the indicator and highlight show nothing and
the chosen tab marks itself: the recipe reads the `data-fluid-hover` attribute FluidHover
sets while it runs.

Menus, listboxes and comboboxes draw their panels in the palette's `popup` tokens, so a
theme's `menu: { accent, color }` (a bold accent row; a panel on the page's surface by default, or inverted or translucent)
restyles all three, and they take `Menu.fluid`, `Listbox.fluid` and `Combobox.fluid`
beside the style in `toView`. The open panel's rows sit in a `rows` box of this package's
(the panel carries upstream's anchor, and an element holds one Mount), with a `highlight`
first in it that follows the pointer, and the keys, which mark a row `data-active`; a
listbox or combobox adds an `indicator` that glides to the chosen row. The default draw
places all three, and the rows drop their own hover and chosen fill while the highlight
runs. A press in a gap presses the lit row, except in a combobox, whose field keeps focus.

```ts
const MenuStyle = Recipes.Menu.style()

Menu.toView([MenuStyle.mixin, ...Menu.fluid], { h })
```

### Overlay scroll bars

The scrolling recipes share one overlay bar, after Fluid Functionalism's: a 10px bar over
the scroller's edge holding a thumb that rests 4px wide in a faint ink of the text, 2px
off the edge, widens to 6px under the pointer and darkens while dragged. It fades in on
`motion.moderate` while the box scrolls or the pointer moves over it, and out on
`moderate-exit` once both rest, after a `moderate` delay that lets a widened thumb narrow
first. The widening travels, so reduced motion keeps the fades alone. `ScrollBars` from
`foldkit-primitives/dom` drives it and sends no Message; the bar is how it looks, the
Mount only where the box is scrolled. On a coarse pointer the Mount does nothing, and the
browser's bar, with its physics, stays; before it runs, as before a page hydrates, so does
the browser's bar.

Every one is the same shape, a mixin list passed beside the style: `ScrollArea.overlayBars`,
`Command.overlayBars`, `Dialog.overlayBars` and `VirtualList.overlayBars` in the view's
`mixins`, and `Menu.overlayBars`, `Listbox.overlayBars` and `Combobox.overlayBars` in
`toView`'s for a popup whose list scrolls: upstream draws that `scroll` region only when
given `itemsScrollClassName` or `itemsScrollAttributes`, and its class joins the recipe's.

```ts
const ListboxStyle = Recipes.Listbox.style()

ScrollArea.view(
  {
    content: h.p([], ['A long text']),
    style: Recipes.ScrollArea.style(),
    mixins: ScrollArea.overlayBars,
  },
  h,
)
Listbox.toView([ListboxStyle.mixin, ...Listbox.fluid, ...Listbox.overlayBars], { h })
```

The bar is a Slot of each component's own (`bar` and `thumb`; a popup's `scrollBar` and
`scrollThumb`), beside the scroller rather than inside it, so the scroller's edge fade
does not erase it. ScrollArea, Command and VirtualList always draw it, and a popup
whenever its panel has a `scroll`; the recipe leaves it undrawn until `ScrollBars` marks
it scrollable. A ScrollArea also marks an edge with more past it with a hairline
(`Utilities.scrollDivider` on `root`, `Utilities.scrollTimeline` on `viewport`), drawn
where the browser lets a parent read a child's scroll timeline (`timeline-scope`).

### The top layer

The panels of Menu (submenus included), Menubar, Listbox and Combobox that stay where they
are drawn (an anchor's `portal: false`) draw in the browser's top layer, so no stacking
context or ancestor `overflow` reaches them. Such a panel carries `popover="manual"`, and
its anchor Mount is wrapped in `Anchor.topLayer`, which shows the panel as a popover around
the Mount's own acquire and hides it once the Mount releases; the wrapper keeps the Mount's
name, args and Messages, so a Scene test still resolves it, and the node stays where the
runtime drew it. Light dismiss stays the application's Messages.

- The panel sets `inset: auto`: the anchor writes only `left` and `top`, and the browser's
  `inset: 0` would otherwise leave `right: 0` winning right to left.
- An unstyled panel keeps the browser's popover border, padding and `Canvas` fill. Every
  recipe's panel replaces them; an inline reset would beat the recipes.
- `Anchor.topLayer` does nothing where the popover API or the element's `popover`
  attribute is missing (jsdom, a server render, a panel drawn without it), and the anchor
  places the panel in the page.
- A panel that upstream portals keeps upstream's behavior, since moving a shown popover
  hides it again.

Popover, Tooltip and Hover Card are drawn by upstream views whose Mounts this package cannot
wrap, so their panels go in the top layer another way: `Anchor.layer(h)`, the `layer` slot of
`PopoverSlots` and `TooltipSlots`, is an element drawn around the panel that shows itself as a
popover, and the panel inside keeps upstream's anchor (`Popover.anchor()` and
`Tooltip.anchor()` give `portal: false` and the placement: 12px and 8px off the trigger, 8px
inside the viewport, flipping and shifting). A Hover Card's panel is anchored in the top layer
by `HoverIntent.toView(mixins, { h, anchored: { id, anchor? } }, draw)`, which gives the
trigger `HoverIntent.triggerId(id)`. The DatePicker's panel and modal dialogs are not in the
top layer.

A box of your own whose Mount is not `TopLayer` takes `Anchor.layerBox(h, style?)`: the same
box without the Mount, for a Mount wrapped in `Anchor.topLayer` that sends Messages (Cascade
Select's and Tour's do), so a Scene test can resolve it. Its inline style takes `style` too,
since a second `h.Style` on the element would replace the first.

The popups' recipes take a `width` axis. `trigger` sets the panel's minimum width to its
trigger's (`--button-width`, which upstream's anchor publishes once it has placed the panel),
in place of the panel's 14rem minimum, so a narrow trigger gets a panel as narrow; `auto`
keeps the 14rem. Combobox defaults to `trigger`, Listbox to `auto`.

### Accessibility patterns

Every adapter has an `A11y.pattern` beside its Slots, under `Patterns`: the slots a widget of
that kind must publish and what each must expose. The catalog lists them with a `tier`
(`stateful` for a Submodel, `stateless` for a decorated native control), the ARIA `roles`
involved, and the platform `floor`: what the widget relies on the browser for (`focus-trap`,
`escape-dismiss`, `top-layer`, `form-submission`, ...), so nothing here reimplements it and a
reader or an agent can ask.

```ts
import { A11y, Capability, Slot, Slots } from 'foldkit-mixins'
import { Patterns } from 'foldkit-mixins-ui'

const MyTabsSlots = Slots.define({ tablist: Slot.make({ capability: Capability.Container }) })

A11y.validate(Patterns.Tabs, MyTabsSlots) // [] when a custom tabs view publishes what tabs need
Patterns.catalog.find(entry => entry.name === 'dialog')?.floor // ['focus-trap', 'escape-dismiss', ...]
```

A test iterates the catalog and validates each adapter's own Slots and `support` against its
pattern, so an adapter cannot drift from the contract it claims. The patterns are written
separately from the Slots, which is what makes the check mean something.

Where a pattern names obligations (who navigates, who makes an item reachable, who activates
it, who names it), the entry's `support` lists who provides each: Mixins that contribute
nothing, made with `A11y.base` (the widget's own markup or the upstream bundle it draws, named
by source file) or `A11y.native` (what a native element does by itself). An adapter draws
through `resolveFor`, so it has no view for `A11y.check` to read; the gate attaches `support`
to a view over the adapter's Slots and `check` judges it, so an obligation nobody provides is
a failure, and so is a provider nothing needs. These are claims found in source, not a
rendered check; the rendered check is `Conformance` from `foldkit-mixins/testing`. Pagination,
breadcrumb, table, scroll area, drawer, hover intent, picker, button group, window list, card,
search field, toolbar and file input are in the catalog beside the older widgets, and a
published `*Slots` that is neither in the catalog nor on the gate's list of Slots with nothing
to require fails the gate. None of this is a WCAG claim.

### Touch targets and icons

`Touch` and `Icons` are style mechanisms, not components: no slots, no views. Compose them into
your own slots. The recipes' own controls already stand 44px tall where the pointer is coarse:
`Defaults.reset` sets `--fk-touch-floor` there, and a control's height on the size ladder is at
least that (a region that must stay dense sets it to `0px`). For your own slots, `Touch.target`
floors one control at 44px where the pointer is coarse; `Touch.targets` floors every boxed
control a region draws. `Icons.glyph(size)` draws the icon in `--icon` before the element's
words, and `Icons.byAttribute(attribute, icons)` sets `--icon` from an attribute's value, where
`icons` maps each value to its resolved `url(…)`:

```ts
import { Layers } from 'foldkit-mixins'

const TileSlots = Slots.define({ tile: Slot.make({ capability: Capability.Container }) })

const TileStyle = Style.forSlots(TileSlots)(
  {
    tile: Style.compose(
      Touch.target,
      Icons.glyph('1rem'),
      Icons.byAttribute('data-block', { Hero: iconUrl('hero') }),
    ),
  },
  { layer: Layers.standard.layer('app') },
)
```

The icons the components draw themselves (a search field's magnifier, a toast's mark, a locked
cell's padlock) are the theme's `icon` tokens: Heroicons' outline set (MIT), restroked to 2px,
by default. An application's own pack replaces them as its own tokens: `AppStyle.make({ theme,
tokens: Icons.tokens(pack, { width?, corners? }) })`, where `pack` holds an `IconData` for each
name the components draw (`ChromeIcon` from `foldkit-mixins/theme`; one missing is a type
error), and the stroke is redrawn into each mask, which CSS cannot reach once it is a `url()`.

## Recipes

The adapters only name slots. `Recipes` gives those slots, and the views above, a look:
one `Style.recipeFor` per contract, built on the tokens of `foldkit-mixins/theme`. Select
variants (an axis's values are listed in the catalog rows) with `.style`, and attach the
result like any other Style:

```ts
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'

const DeleteStyle = Recipes.Button.style({ tone: 'danger', variant: 'outline', size: 'sm' })

// The same Style in two calls: the selection's pieces, then `Style.forSlots` of them.
// Take the pieces when you compose them with your own first (see Segmented).
const Spelled = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'danger', variant: 'outline', size: 'sm' }),
)

const L = Layers.standard
const theme = Theme.make({ accent: { hue: 280, chroma: 0.15, lightness: 60 } })

export const sheet = Style.stylesheet(
  L.declare,
  L.in('theme', Theme.root(Theme.standard(theme))),
  DeleteStyle,
)
```

`DeleteStyle.mixin` then goes to `Button.toView` as in the first example. What a recipe
assumes and does:

- **The page ships the tokens.** Every value is a `var(--fk-…)` reference to the shipped
  tokens (`Theme.standard`), so another theme's knobs restyle every recipe with no new
  CSS.
- **Bases sit in `components`, variants in `variants`** of `Layers.standard`, so an
  application's `app` layer overrides both without specificity fights. Every declaration
  is a layered rule and none is inline style, since inline style beats every layer and
  could not be overridden this way:

  ```ts
  const Red = Style.forSlots(ButtonSlots)(
    { button: Style.self({ background: 'red' }) },
    { layer: L.layer('app') },
  )
  // Style.stylesheet(L.declare, …, DeleteStyle, Red): Red's background wins.
  ```

  `.style` takes the same options as `Style.forSlots`. An application on `AppStyle` passes
  its layer, `Recipes.Button.style(selection, { layer: L.layer('app') })`: the shipped
  pieces keep their own layers either way, and a piece its `.extend` added with no layer
  lands in `app`, as `AppStyle`'s `forSlots` would place it.
- **Controls stand on one size ladder.** A button, a field, a select, a tab, a segmented
  control, a table row and the rows of a menu, listbox or combobox are all one rung tall:
  36px by default and 28px compact, their padding, gap and text stepping with them
  (`Theme.ladder`, read on the element). `--fk-knob-step: 1` on any element makes
  everything inside it compact, the popups it opens included when they stay in the page (an
  anchor's `portal: false`, as the gallery's do); a panel upstream portals out of the page
  (the default of its own anchor) is given the region's custom properties as it leaves, so
  the region reaches it too, unless the panel sets the property itself. That holds for
  Menu, Listbox, Combobox and the `Anchor` Mount; a Popover or Tooltip with `portal: true`
  is not supported (draw it in place, as `anchor()` does). A recipe's `size` (`sm` compact,
  `md` default, `lg` a half step up at 40px) sets the step on its own element and beats the
  region, and a popup's sets it on its panel too, so it holds portaled or not; unset, which
  is the default, follows the region. An icon, checkbox, radio or switch with no size stands
  on the ladder's icon rung, 16px or 14px compact.
- **Text comes in roles.** `Theme.role(name)` is a size and its leading, stepping with the
  ladder: `display`, `title`, `subtitle`, `body` (a control's text, 14px on 20), `caption`
  (badges, tooltips, a table's headings) and `micro` (keycaps). A tab's and a segmented
  option's label is trimmed to its capitals (`text-box`), centering it optically; a pressed
  segmented option and a chosen card title turn semibold without moving anything (the card
  writes its title in `data-label`; give an option its text there,
  `h.DataAttribute('label', 'Week')`, and draw its words in the `label` Slot, which holds the
  trim: on the option itself, the hidden copy took the trim's lower half); and a field's text
  is 16px on a coarse pointer, so iOS Safari does not zoom the page into it.
- **A state is a tint, not a surface.** An unfilled control's hover is a faint film of the
  state ink over whatever is under it, so it reads on a muted page, a colored band or an
  inverted panel; a press lays that film stronger (`state.press`, 1.75 of the hover's). The
  ink is the theme's `--fk-state-ink` (`state.ink`: the element's own text, or the accent's
  ink under `surface.hover: 'accent'`) unless a painted surface above names its paint in the
  local `--_fk-state-ink`: the accent and danger tones name their fill, a subtle alert band
  its ink and a bold one its fill, so a hover on blue is a deeper blue. The neutral and ink
  tones name the theme's ink back, so a neutral control on a band does not take the band's
  hue, and one `surface.hover` choice reaches every component. The neutral button is
  see-through (`state.tint`), and images carry a hairline inside their edge (`state.edge`). A
  popup's rows round concentrically inside its panel (`Theme.nested`), as a segmented option
  does inside its tray. A fluid highlight (Table's, Segmented's, pill Tabs', Nav's,
  TreeView's, a Card group's) lays that same film, so `surface.hover` and
  `surface.hoverStrength` move it with every other hover.
- **A press gives.** Held, every button scales to 98% (the 2% multiplied by `travel`, so
  reduced motion holds its size). A solid or primary button's fill also deepens to its
  family's `active` and clears the 1px border of its own color that it stands in, so the fill
  draws in by 1px a side; an outline, ghost or icon button lays a deeper film of its tone's
  ink. A pressed toggle (`aria-pressed="true"`) rests on its tone's fill, a solid one on the
  `active` fill; hovered, a solid toggle keeps it and an unfilled one takes its tone's hover
  fill; held, it deepens to the `active` fill; and its text stays the fill's throughout. A
  hovered row, tab, menu item or accordion row darkens while the press is held, and a fluid
  highlight darkens with the item it lights (`FluidHover` marks the container
  `data-fluid-held`). Chosen rows next to each other in a multiple listbox or combobox merge
  into one block. A disabled control fades by `state.disabledOpacity` (half by default), so
  one page shows one fade.
- **Raised surfaces nest.** Popups, popovers, date picker panels and toasts sit two levels
  above what holds them and dialogs four (`Theme.raise`), each painted for its level, so a
  popover in a dialog lands above the dialog: a step lighter in a dark scheme, the same flat
  surface with its own shadow in a light one.
- **State comes from the component's own attributes.** Checked, selected and disabled looks
  read `aria-checked`, `aria-selected` and `aria-disabled`, which `@foldkit/ui` already
  writes; no `whenInput` is needed.
- **Tone and variant are independent.** A tone sets a few private custom properties that
  `solid`, `outline` and `ghost` read — except `primary`, which is ink by definition, and
  `icon`, a square one rung of the size ladder on a side. A tone also carries the line an
  `outline` draws: the fill, or for `neutral`, whose fill is a quiet grey, the page's default
  line. A neutral Checkbox or Switch that is on is in the page's ink, not the neutral grey, so
  it stands out without a color.
- **On a colored band, unfilled buttons take the band's color.** `outline` and `ghost` draw
  their text in the tone's ink, which reads on the page's surface and not on a band of the
  accent. A band sets `Style.vars({ '--fk-ink': 'currentColor' })`, beside `--fk-heading` for
  its headings, and their text is the band's.

Adjust a recipe with `extend` instead of forking it. Base pieces compose per slot, a
variant's pieces compose over the shipped ones, and compounds append:

```ts
const BrandButton = Recipes.Button.extend({
  base: { button: Style.class('brand-button') },
  variants: { size: { lg: { button: Style.class('brand-button-lg') } } },
})
```

`Recipes.Badge` is a recipe of two axes, `appearance` and `size`. The tone is not an axis: the view
writes it as `data-tone`, so one style serves badges of every tone, and the six names of the tone
vocabulary are in the recipe. A badge toned by an attribute the application already writes maps its
values with `Recipes.badgeTones` through `extend`; a value the map leaves out keeps the base pill.
`Recipes.Badge.add` gives it a size or an appearance of your own. A toned pill is grounded on its
tone's `subtle`, which keeps the tone's hue over a tinted page:

```ts
const EntrySlots = Slots.define({ badge: Slot.make({ capability: Capability.Container }) })

const EntryStyle = Style.forSlots(EntrySlots)({
  badge: Recipes.Badge.extend({
    base: {
      badge: Recipes.badgeTones('data-state', { Published: 'success', Changed: 'warning' }),
    },
  })().badge,
})
```

`Badge.view({ text, icon, onDismiss })` draws an icon before the text and a dismiss button named by
`words.dismiss` (`'Dismiss {text}'`); `{ text, href, external }` draws the pill as a link. A link
holds no dismiss button, and the types refuse both.

`Recipes.InputGroup` draws a text field with a prefix or suffix, such as an address's `/`, as one
box: `group` carries the border, its hover and the focus ring (while the control inside has
focus), `affix` sits inside it, muted, and `control` makes the input inside borderless. They are
pieces for your own group, affix and control slots, as `foldkit-mixins-form`'s field publishes
them. `control` is in `variants`, so it wins over a `components` look on the same slot; over a
look of your own in a later layer, say the same in that layer:

```ts
const FieldSlots = Slots.define({
  group: Slot.make({ capability: Capability.Container }),
  affix: Slot.make({ capability: Capability.Container }),
  text: Slot.make({ capability: Capability.Container }),
})

const AddressStyle = Style.forSlots(FieldSlots)({
  group: Recipes.InputGroup.group,
  affix: Recipes.InputGroup.affix,
  text: Style.compose(Recipes.Input({}).input, Recipes.InputGroup.control),
})
```

`Recipes.Calendar` styles `CalendarSlots` in every mode: days in seven columns, months and years
in three, each button reading its state off the cell (`data-today`, `data-selected`,
`data-focused`, `data-outside-month`, `data-disabled`). Each cell is a rung of the size ladder,
so `size` (`sm`, `md`) or the region steps it. It draws no card, so the same style serves a
calendar on the page and one in a date picker's panel. `Recipes.Tabs({ variant: 'pill' })`'s
chosen tab is a raised surface with a hairline edge and shadow on the tray, in the default text
colour. To preview every recipe across variants, states, and light/dark schemes at once, browse the [component gallery](https://foldkit-plus.pages.dev/components).

## One factory for each part

A widget's look, state, drawing and features each have one place they are
given ([Look, state, drawing, features](#look-state-drawing-features-one-factory-each)).
This section shows each with code.

### State: fold it by hand, or place a Bundle

A stateful widget exports `Model`, `Message`, `init` and `update`. The
application keeps the Model in a field of its own, wraps the widget's Messages
in one of its own, and folds them. Written out, for a field of tags:

```ts standalone
import { Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { TagsInput } from 'foldkit-mixins-ui'

const Model = Schema.Struct({ labels: TagsInput.Model })
type Model = typeof Model.Type

const Message = defineMessageUnion({ GotLabelsMessage: { message: TagsInput.Message } })
type Message = typeof Message.Type

export const initial: Model = {
  labels: TagsInput.init({ id: 'labels', tags: ['urgent'], max: 3 }),
}

export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    GotLabelsMessage: ({ message }) => {
      const result = TagsInput.update(model.labels, message)
      // The field's own Commands (it refocuses after a removal) speak its Messages.
      const commands = Command.mapMessages(result.commands, message =>
        Message.GotLabelsMessage({ message }),
      )
      // Nothing changed: hand back the Model given, so nothing is drawn again.
      return result.model === model.labels
        ? { model, commands }
        : { model: modifyFields(model, { labels: () => result.model }), commands }
    },
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  TagsInput.view(
    {
      model: model.labels,
      onMessage: message => Message.GotLabelsMessage({ message }),
      label: 'Labels, up to three',
    },
    h,
  )
```

That is the whole of it, and for a page with one or two widgets it is the
smaller choice: it adds nothing to the bundle. `Bundles.X` is the same `init`
and `update` packaged for
[`foldkit-bundle`](https://github.com/doeixd/foldkit-plus/blob/main/packages/bundle/README.md),
which derives the field, the wrapper Message and the fold above from one
placement:

```ts standalone
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Bundles, TagsInput } from 'foldkit-mixins-ui'

const App = Bundle.compose({}).pipe(
  Bundle.withChild('labels', Bundles.TagsInput, {
    args: { id: 'labels', tags: ['urgent'], max: 3 },
  }),
)
type Model = typeof App.Model.Type
type Message = typeof App.Message.Type

const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  TagsInput.view(
    {
      model: model.labels,
      onMessage: message => App.Message.GotLabelsMessage({ message }),
      label: 'Labels, up to three',
    },
    h,
  )

export const config = App.placements.runtime({ Model: App.Model, initial: {}, view })
```

The first placement costs a page about 6 kB (brotli) of `foldkit-bundle`; the
second and every later one share it. `foldkit-bundle` is a peer dependency:
install it when you place a Bundle, and a page that folds by hand never loads
it.

- **A Bundle is headless.** It holds no view; draw the placed Model with the
  widget's `view`.
- **Its `args` are `init`'s options**, checked by a Schema and given to
  `update` too.
- **`Bundles` is a namespace of one file per widget**, as `Recipes` is, so
  reading `Bundles.TagsInput` keeps that file and no other Bundle.

Who owns the value follows from its type. Where the value's type is the
widget's own (a TagsInput's tags), the Bundle holds it and the application
reads it from the placed Model, `model.labels.tags`. Where the type is the
application's (the items of a Combobox), the application keeps the value in
its own field and the Bundle holds only the interaction: open or closed, the
row the keys are on, the text typed. A `Choice` says how that field is read
and folded, and the Bundle reports each change for the application to answer:

```ts standalone
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Bundles, Combobox } from 'foldkit-mixins-ui'

const cities = ['Lisbon', 'Porto', 'Faro'] as const
const City = Combobox.one(cities)

const App = Bundle.compose({ city: Schema.Option(Schema.Literals(cities)) }).pipe(
  Bundle.withChild('cityBox', Bundles.Combobox, {
    args: { id: 'city' },
    // `out` is a `ChoiceChange`; `City.picked` looks the reported value up
    // among `cities`, so `city` stays an `Option` of one of them.
    onOut: out => model => ({ model: { ...model, city: City.picked(model.city, out) } }),
  }),
)

export const initial = App.placements.initial({ city: City.empty })

// The same `Choice` reads the field for the drawing: the chosen row, the resting text.
export const cityField = (model: typeof App.Model.Type, h: HtmlBuilder<typeof App.Message.Type>): Html =>
  Combobox.view(
    {
      model: model.cityBox,
      onMessage: message => App.Message.GotCityBoxMessage({ message }),
      label: 'City',
      choice: City,
      value: model.city,
      filter: Combobox.contains,
      clear: true,
    },
    h,
  )
```

`Combobox.one(items)` holds an `Option` of an item, `Combobox.many(items)` a
list of them in the order chosen (place the Bundle with `multiple: true`, which
its `update` reads: choosing leaves the list open), and `Combobox.text(items)`
the typed text itself, with the items as suggestions. Each is a file of its
own. `Choice` is an interface you may implement; a rule of your own usually
wraps a shipped one:

```ts standalone
import { Combobox, type Choice } from 'foldkit-mixins-ui'

/** At most three: a fourth choice leaves the value as it was. */
export const upToThree = <Item extends string>(
  items: ReadonlyArray<Item>,
): Choice<Item, ReadonlyArray<Item>> => {
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

Where the value's type is the widget's own and a parent usually acts on a
change, the Bundle reports it. A Calendar holds its `Selection` and reports
`Changed`, which a placement answers or ignores by name:

```ts standalone
import { Option } from 'effect'
import { Bundle } from 'foldkit-bundle'
import * as Dates from 'foldkit/calendar'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Bundles, Calendar } from 'foldkit-mixins-ui'

const today = Dates.make(2026, 2, 11)

const App = Bundle.compose({}).pipe(
  Bundle.withChild('trip', Bundles.Calendar, {
    // The selection's tag is the mode; `months: 2` draws two side by side.
    args: { id: 'trip', today, selection: Calendar.empty('Range'), months: 2, minDate: today },
    // `Changed` carries the new selection; this page only reads it from the Model.
    onOut: Bundle.ignore,
  }),
)
type Model = typeof App.Model.Type
type Message = typeof App.Message.Type

export const nights = (model: Model): number =>
  Option.match(Calendar.rangeOf(model.trip.selection), {
    onNone: () => 0,
    onSome: ({ start, end }) => Dates.daysUntil(start, end),
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  Calendar.view(
    {
      model: model.trip,
      onMessage: message => App.Message.GotTripMessage({ message }),
      label: 'Trip dates',
      presets: [{ label: 'Next week', selection: Calendar.nextDays(today, 7) }],
      today: { label: 'This month' },
      footer: h.p([], [`${nights(model)} nights`]),
    },
    h,
  )
```

`Combobox.view(options, h)` takes that `choice` and the `value`, and draws
the rest from data:

- **Rows.** `option: item => RowContent` gives a row its `label` (which also
  names a chip and the resting text), `description`, `icon`, `trailing`,
  `content` in the label's place, and `disabled`; without it a row is its
  item. `items` narrows what is offered now (a fetched page); `filter` keeps
  the rows whose label matches the typed text, with `Combobox.contains` and
  `Combobox.startsWith` shipped as values, so a page that fetches for the
  text ships neither. `groupBy` and `heading` group adjacent rows.
- **The field.** `placeholder`, `empty` (drawn in the list's place),
  `clear` (`true` for a button with a drawn cross, or `{ content }`),
  `chips` for a choice of several, `buttonContent`, `disabled`, `invalid`,
  `readOnly`, `name`, `openOnFocus`, `anchor`, and `words` (`clear`,
  `remove`, the second with `{label}`).
- **Clearing** empties the field's text through the Combobox's own Message.
  The value follows through the `Choice`: `Combobox.text` takes the empty
  text, and a combobox placed with `nullable: true` reports
  `ClearedSelection` when an emptied field is left.
- **A value chosen before the page drew** needs the Bundle's `text` arg (the
  chosen row's label), since upstream writes the resting text only as the
  field is left.
- **`Combobox.configure({ base, presets })`** binds `filter`, `placeholder`,
  `chips`, `openOnFocus`, `anchor`, `words`, `style`, `mixins` and `clear:
  true`.
- **`Combobox.fluid` and `Combobox.overlayBars`** are files of their own: a
  page that passes neither ships neither `FluidHover`, `Measure` nor
  `ScrollBars`.

The `toView` adapter and the `ComboboxView` bundles stay as the rung below.

`Listbox.view(options, h)` and `Picker.view(options, h)` take the same `choice` and
`value` and the same `option`, `groupBy`, `heading`, `items`, `placeholder`,
`disabled`, `invalid`, `name` and `words` (`clear`, the button's name), over
`Bundles.Listbox` and `Bundles.Picker`: a Listbox's `Listbox.one(items)` or
`Listbox.many(items)` (`multiple: true` in the Bundle's args, since choosing
leaves a multiple list open), a Picker's `Picker.one(items)`. The value is the
application's, so `clear` is `{ onClear, content? }`: the button sends the
application's own Message, which empties the field through the same choice
(`ChoiceChange.ClearedSelection()`). `Listbox.fluid` and `Listbox.overlayBars` are
files of their own, like the Combobox's.

### Drawing: configure once, call with what differs

`X.configure({ base, presets })` returns the widget's own `view`, bound to
options an application would otherwise repeat at every call: its compiled
style, its words, its mixins, its structural choices.

```ts standalone
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Button, Recipes } from 'foldkit-mixins-ui'

const Message = defineMessageUnion({ Saved: {}, Deleted: {} })
type Message = typeof Message.Type

// Styles are compiled once, in a module the build may ship as data.
const Quiet = Recipes.Button.style({ tone: 'neutral', variant: 'outline' })
const Danger = Recipes.Button.style({ tone: 'danger' })

export const AppButton = Button.configure({
  base: { style: Quiet },
  presets: { danger: { style: Danger } },
})

export const actions = (h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  AppButton.view({ label: 'Save', onClick: Message.Saved() }, h),
  AppButton.view({ label: 'Delete', preset: 'danger', onClick: Message.Deleted() }, h),
]
```

- **The order is `base`, the named preset, the call.** A later one wins per
  option, so a style given at the call replaces the preset's. Two options
  merge instead: `mixins` concatenate in that order, and `words` merge word
  by word. An option given as `undefined` is not given.
- **The preset names are the keys you wrote.** `preset: 'dangr'` is a type
  error, and `preset` is no option at all where `presets` was left out. A
  name computed at run time that matches none throws, naming the ones
  declared.
- **A preset holds what takes no Message and no state**: `style`, `mixins`,
  `words` and each widget's own list (`type` for a Button; `placeholder`,
  `addOnBlur` and `direction` for a TagsInput; `weekNumbers`, `caption`,
  `paging`, `today`, `presets` and `detail` for a Calendar; `filter`,
  `placeholder`, `chips`, `openOnFocus`, `anchor` and `clear: true` for a
  Combobox). `onClick`,
  `onMessage`, `model`, `label` and anything drawn (`icon`, `aside`, `footer`)
  stay at the call.
- **A preset may hold behaviour.** A mixin with a Mount given in a preset
  attaches to every use of that preset, and the page ships that Behavior
  only because the application's own module imported it. A Mount that sends
  no Message has to be resolved by the application's Scene tests of every
  page that draws the preset.
- **It holds no state.** A widget's starting values are `init`'s options, or
  a Bundle's `args`.

### Look: recipe modules hold style and nothing else

A shipped recipe module imports style code only: `foldkit-mixins` styles,
theme references, other recipes' pieces, icon masks. It never imports a
widget, a Behavior or anything with a Mount, which is what lets a build
evaluate a style module and ship class names in its place
([Style modules shipped as data](https://github.com/doeixd/foldkit-plus/blob/main/packages/mixins/README.md#style-modules-shipped-as-data)).
An axis selects what CSS can express over the same markup. A choice that
changes the markup is a view option, which the view writes as a `data-*`
attribute for the recipe to read. A look a shipped recipe lacks is added to
it, not forked from it:

```ts standalone
import { Style } from 'foldkit-mixins'
import { Recipes } from 'foldkit-mixins-ui'

const Buttons = Recipes.Button.add({
  tone: { brand: { button: Style.self({ background: 'rebeccapurple', color: 'white' }) } },
})

export const Brand = Buttons.style({ tone: 'brand', variant: 'solid' })
```

## Why some components needed a fork

The bridge needs a **consumer-visible attribute bundle**. `Menu`, `Listbox`, `ComboBox`,
`DatePicker` and `Toast` build (parts of) their element tree internally and expose no
`toView`-style seam, so there is nothing for Mixins to attach to: a limitation of the exposed
render seam, not of Slot resolution. Each is transcribed from the pinned `@foldkit/ui` source
(attributed in its module) with the missing `toView` added, and a parity battery draws the fork
and upstream's view over the same models; state, Messages, update, Commands and Mounts stay
upstream in every case. If upstream gains seams, the forks go away.

That seam is what makes a row styleable. Drawn through `@foldkit/ui`'s own view, a Menu item or
a Listbox or Combobox option takes only a `className` (its `itemToConfig`), so no Slot's
attributes reach it and no Mixin can land on it: the page can style it only from the panel's
Slot, with a rule under it keyed on the role and the state attributes upstream writes. Drawn
through the fork, the row is the `item` Slot, styled like any other:

```ts standalone
import { Capability, Slot, Slots, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { ListboxSlots } from 'foldkit-mixins-ui'

const t = Theme.ref(Theme.standard(Theme.make({})))

// Through `Listbox.toView`: each option is the `item` Slot.
const ListboxStyle = Style.forSlots(ListboxSlots)({
  item: [{ cursor: 'pointer' }, Style.pseudo('[data-active]', { background: t.surface.muted })],
})

// Through upstream's view: the options are reached from the panel's Slot.
const PanelSlots = Slots.define({ items: Slot.make({ capability: Capability.Container }) })
const PanelStyle = Style.forSlots(PanelSlots)({
  items: Style.nest('[role="option"][data-active]', { background: t.surface.muted }),
})
```

The second keeps the rule in the panel's layer and reads only what `@foldkit/ui` publishes
(`role`, `data-active`, `data-selected`, `data-disabled`), but no Behavior or Mount can reach the
row that way. Use it for a port that keeps upstream's view; draw through the adapter otherwise.
`Listbox`, `Combobox` and `Calendar` draw the standard markup from the styled bundles when
`toView` is given no `draw`; pass a `draw` to arrange the parts yourself.

**The Menu is three layers**, each built on the one before:

```text
Menu.init / update / view      the component: rows with values, submenus, a point
        |
MenuSlots, Menu.resolve,       the panel adapter: styles any @foldkit/ui Menu
Menu.toView, fluid,            drawn through the fork, whoever keeps its Model
overlayBars, drawAtPoint,
pointTarget
        |
MenuView                       the fork: @foldkit/ui/menu's view with a toView
```

`MenuView` is the fork; the Menu's Model, `update` and Mounts are upstream's. The panel adapter
styles a Menu drawn through it: `Menu.toView(mixins, { h }, draw?)` is that Menu's `toView`, and
without a `draw` draws the panel through `drawMenu` (`Menu.toView([MenuStyle.mixin], { h })` is a
whole styled menu). Menubar draws its menus this way, and so does an application that folds
`@foldkit/ui`'s Menu itself, for typed items or groups, which the component's rows do not have.
Such a Menu opens at a point with `Menu.drawAtPoint(point, h)` as `toView`'s `draw` (its button
becomes a mark of no size at `point`, an `Option`, which the anchor places the rows against, so
give the anchor `gap: 0`) and `Menu.pointTarget({ onPress, onOpen }, h)` on the area: a right
press sends `onPress` with its point, which the application keeps, and the `contextmenu` after it
(or Shift+F10, or the ContextMenu key) sends `onOpen`, which the application answers with the
Menu's own `Opened` Message, the browser's menu kept shut. A finger's press sends `onPress` too,
so Android's `contextmenu` for a held finger opens under it; iOS fires none, which the
component's `Menu.target` answers by opening on the hold itself. The component is this package's
own, drawn through the adapter, as the Slider is; its `Menu.target` is `pointTarget` wired to its
own Messages.

`ToastView` follows the fork's shape: `ToastView.make` binds upstream's `Toast.make` for the
payload and swaps in the transcribed view. `Listbox` forks both variants over one shared
transcription (`ListboxView.create` and `ListboxView.Multi.create` bind the upstream bundles; the
single and multi Models are structurally identical, so the single adaptor maps
`maybeSelectedValue` to `selectedValues` exactly as upstream's does). The forks add one view input
upstream lacks, `direction?: 'ltr' | 'rtl'`: under `'rtl'` a horizontal listbox's ArrowLeft moves
to the next item. `Combobox` follows the same shape over its own shared transcription
(`ComboboxView.create` / `ComboboxView.Multi.create`). `DatePicker`'s bundles mix the popover's
pre-bound groups with the date picker's own attributes, so they speak only the date picker's
Message: its `toView` takes no builder of the application's, and without a `draw` draws upstream's
markup. `DragAndDrop` and `Animation` do not have adapters here yet.

## Limits

This package separates responsibilities into three layers:

```text
component state / accessibility -> @foldkit/ui
merge semantics                 -> foldkit-mixins
adapter metadata, widgets       -> foldkit-mixins-ui
```

The components that keep a Model here (Menu, Toast, Sheet and the rest) do so where
`@foldkit/ui` has no such component, or composes one beneath them (a Sheet is a Dialog, a Menubar
a row of Menus); when upstream gains one, the adapter is the better home. The recipes assume the
page ships the theme's tokens; a widget never reads a value out of a theme. Accessibility
`support` entries are claims found in source, not a WCAG conformance statement.

## Next

- Learn how Slots, Styles, and Behaviors compose: [Inside-out view composition](../../docs/mixins.md)
- Define custom extension points and theme tokens: [`foldkit-mixins`](../mixins)
- See Button and Checkbox adapted in a full app: [`examples/todo-app`](../../examples/todo-app)

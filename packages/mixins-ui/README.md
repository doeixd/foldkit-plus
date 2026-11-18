# `foldkit-mixins-ui`

The widget catalog of Foldkit Plus: about ninety styled, accessible widgets
(buttons, fields, menus, dialogs, tables, charts, a chat vocabulary) in two
families. **Adapters** take a component [`@foldkit/ui`](https://www.npmjs.com/package/@foldkit/ui)
already owns, name its attribute bundles as typed [`foldkit-mixins`](../mixins)
Slots, and run the Mixins resolver over them, so a caller styles or decorates the
component without copying its markup or merging attribute arrays by hand.
**Views and components** are this package's own, where upstream has none. A
recipe (`Recipes.X`) gives either family a look from the theme's tokens.

Every value belongs to the application's Model: what is chosen, typed, checked
or sorted. A widget's `view` is a pure function from those values to markup. The
few widgets that keep a small Model of their own hold interaction state only
(what is open, a drag, a countdown, a draft); the application places that Model
and folds it with the widget's `update`, as it folds an `@foldkit/ui` Submodel.

A widget's `view` also reads nothing from the environment (no `window`,
`navigator`, feature test, clock or default locale): a server and a browser must
draw the same markup from the same Model, or a server-rendered page is rebuilt
when it takes over. A fact about the environment, such as whether the browser has
an eyedropper, is an input the application keeps in its Model, read once in `init`
or by a Command after hydration (see [ColorPicker](#colorpicker)).

- `@foldkit/ui` owns component state, accessibility behavior and base attributes.
- `foldkit-mixins` owns Slot, Style and Behavior and the resolver that merges them
  safely.
- `foldkit-primitives` owns the interaction primitives widgets compose (focus
  recovery, roving tab stops, drags, scroll bars, clipboard).
- `foldkit-mixins-ui` names the bundles as Slots, draws the widgets that have no
  upstream, and ships their recipes and accessibility patterns.
- The application owns the values, and every transition of them.

Every shipped recipe is on the website's
[component pages](https://foldkit-plus.pages.dev/components), each with its
variants to pick and the code that draws it, and
[Create a theme](https://foldkit-plus.pages.dev/create) turns the theme's knobs
over all of them at once.

## When to use it

Use this package when:

- you want a styled, accessible widget from the catalog below;
- you already use `@foldkit/ui` and want reusable styling, ARIA decoration,
  analytics or element-level behavior around one of its components, through its
  consumer render seam (`toView`);
- you want conflicts diagnosed rather than resolved by attribute order.

It does not own application state. A Mixins `Behavior` contributes
element-level attributes and optional Mount behavior; it is not a hidden state
container. If you are building your own view rather than adapting a widget,
publish Slots directly with [`foldkit-mixins`](../mixins); for Slot / Style /
Behavior itself, read [Inside-out view composition](../../docs/mixins.md) first.
[Authoring components](../../docs/authoring-components.md) builds such a view from
primitives step by step, and lists what a widget for this catalog must carry.

## The mental model

An `@foldkit/ui` component hands its caller attribute bundles (roles, `aria-*`,
`tabindex`, event handlers, `ChildAttribute`s). A raw array is not a public
customization contract: a caller can add a second `OnClick`, replace something
structural, or repeat merge code at every call site. `foldkit-mixins-ui` gives
each bundle a stable Slot name. Style and Behavior attach to those Slots, and the
`foldkit-mixins` resolver merges them into the component's own attributes plus the
caller's safe additions.

The component keeps control of the component, and callers get a typed place to
extend it. A view of this package's own draws its markup through the same Slots,
so one extension contract covers both families.

## Install

```bash
pnpm add foldkit-mixins foldkit-mixins-ui foldkit-primitives @foldkit/ui
```

`foldkit`, `effect`, `foldkit-mixins`, `foldkit-primitives` and `@foldkit/ui` are peer dependencies. So is `foldkit-bundle`, which only `Bundles` imports: add it when you place one ([State: fold it by hand, or place a Bundle](#state-fold-it-by-hand-or-place-a-bundle)).

## Sixty seconds: style a Button without copying it

Start with a normal `@foldkit/ui` Button. The adapter publishes its consumer
attribute bundle as the `button` Slot.

```ts
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as UiButton from '@foldkit/ui/button'
import { Style } from 'foldkit-mixins'
import { Button, ButtonSlots } from 'foldkit-mixins-ui'

const Message = defineMessageUnion({ Saved: {} })
type Message = typeof Message.Type

const SaveStyle = Style.forSlots(ButtonSlots)({
  button: Style.class('btn btn-primary'),
})

const saveButton = (h: HtmlBuilder<Message>) =>
  UiButton.view(
    {
      onClick: Message.Saved({}),
      toView: Button.toView([SaveStyle.mixin], { h }, ({ button }) => h.button(button, ['Save'])),
    },
    h,
  )
```

The important line is:

```ts sketch
toView: Button.toView(mixins, { h }, draw)
```

`Button.toView(...)` takes the attributes from `@foldkit/ui` and your Style and
Behavior mixins, and calls `draw` with the resolved slot arrays.

`UiButton.view` builds the component's base attributes, including the click
Message, and calls `toView` with them. `Button.toView` applies the style to
those attributes and hands the result to `draw`, which puts it on the actual
element with `h.button`. Clicking emits `Saved` to the parent update. `toView`
performs no I/O and holds nothing: it is a pure function from the component's
bundles to your markup, run on every render, and the caller never copies the
button's behavior or merges its handlers and ARIA by hand.

Start by adding a class. Then add a non-conflicting attribute if needed. Do not
install another `OnClick` to intercept the component: the resolver rejects
competing event owners. Put every resolved bundle on its element, adding your
own attributes beside it where you need them:

```ts
import * as UiInput from '@foldkit/ui/input'
import { Input, InputSlots } from 'foldkit-mixins-ui'

const ZipStyle = Style.forSlots(InputSlots)({ input: Style.class('zip') })

const zipInput = (h: HtmlBuilder<Message>) =>
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

## Core concepts

### `toView` and `resolve`

Every component adapter (all but Anchor, which is a Behavior) has both:

```text
Adapter.toView(mixins, { h, input? }, draw)  ->  the component's toView
Adapter.resolve(attributes, mixins, { h, input? })  ->  the resolved bundles
```

`toView` is `resolve` placed where the component calls back, and is the normal
path. It fits a stateless component's `view` and a Submodel's `viewInputs`
alike. The Message type comes from `h`, and a Submodel's value type (a
RadioGroup's or Tabs' `Value`) from where the `toView` goes, so neither needs
writing out. `input` is whatever attached Style/Behavior callbacks are allowed
to read (often a Surface's projected Model); leave it out when no Mixin reads one.

Every view takes the view's `h` last, as Foldkit's own views do. At runtime it
is the same builder everywhere; its type carries the Message the part of the app
being drawn can route (the root's, or a Submodel's own), so a handler built for
another part's Message is a compile error where it is written. Pass it down as a
parameter and never keep it: a builder kept and used in another frame builds
handlers that frame cannot deliver.

<!-- docs-check standalone
import { Schema } from 'effect'
import { FieldValidation } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Capability, Slot, Slots, Style } from 'foldkit-mixins'
import { Layers } from 'foldkit-mixins'
import {
  ButtonSlots,
  Icons,
  InputSlots,
  Listbox,
  ListboxSlots,
  Menu,
  MenuSlots,
  ScrollArea,
  SegmentedSlots,
  Segmented,
  Tabs,
  TabsSlots,
  TextareaSlots,
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
const SaveStyle = Style.forSlots(ButtonSlots)({ button: Style.class('btn btn-primary') })
const FieldStyle = Style.forSlots(InputSlots)({ input: Style.class('field') })
const TextareaStyle = Style.forSlots(TextareaSlots)({ textarea: Style.class('reply') })
const Container = Slot.make({ capability: Capability.Container })
const EntrySlots = Slots.define({ badge: Container })
const FieldSlots = Slots.define({ group: Container, affix: Container, text: Container })
const TabsStyle = Style.forSlots(TabsSlots)({})
const MenuStyle = Style.forSlots(MenuSlots)({})
const ListboxStyle = Style.forSlots(ListboxSlots)({})
const ScrollAreaSlots = Slots.define({ root: Container })
const TileSlots = Slots.define({ tile: Container })
const MyTabsSlots = Slots.define({ tablist: Container })
declare const h: HtmlBuilder<Message>
declare const model: { readonly marks: ReadonlyArray<string> }
declare const iconUrl: (name: string) => string
-->

`resolve` is the seam underneath, for bundles already in hand: a view that
receives a Tabs `render` as its input, or a Calendar whose Mixins read the
mode it is showing, which is only known once the attributes arrive:

```ts
import type { CalendarAttributes } from '@foldkit/ui/calendar'
import { Calendar, CalendarSlots } from 'foldkit-mixins-ui'

const CalendarStyle = Style.forSlots(CalendarSlots)({
  root: Style.whenInput<CalendarAttributes['_tag']>(mode => mode === 'Years', Style.class('years')),
})

const resolveCalendar = (attributes: CalendarAttributes, h: HtmlBuilder<Message>) =>
  Calendar.resolve(attributes, [CalendarStyle.mixin], { input: attributes._tag, h })
```

`resolve` returns the shape the component passed to its render callback with
the published bundles resolved; values that are not Slots (`animatePanel`,
`isVisible`, `activeIndex`, `selectedValue`) pass through untouched. Each
adapter names what it returns (`ResolvedButton<Message>`, `ResolvedInput`,
`ResolvedDialog`, `ResolvedRadioGroup<Value, Message>`, `ResolvedTabs`,
`ResolvedCalendar`, `ResolvedMenu` with `ResolvedMenuGroup` and
`ResolvedMenuItem`, and so on), so a helper that draws part of a component is
typed without `ReturnType`. `ResolvedTextarea`'s `textarea` bundle is typed for
`h.textarea`, which refuses `InnerHTML`; the resolver refuses an `InnerHTML` from
any Mixin, so no cast is needed. Each adapter is both a namespace
(`Button.toView`, `Button.resolve`) and a flat Slot export (`ButtonSlots`).

### What the resolver protects

This package delegates merge semantics to `foldkit-mixins`; it does not
concatenate arrays. The resolver guarantees that:

- component/base attributes survive;
- `ChildAttribute`s survive by identity, preserving Submodel routing;
- classes are additive, and inline declarations merge by property;
- an event or scalar attribute has one owner, so a Behavior cannot silently
  install a competing `OnClick` at a Slot whose component owns the click;
- structural attributes remain protected;
- conflicting ownership produces a `DiagnosticError`, never an accidental
  second handler.

That is the main reason to use an adapter instead of another `className` or
`attributes` escape hatch.

### Submodel components remain Submodels

Dialog, Popover, Tooltip, Tabs, RadioGroup, Calendar and Menu publish
`ChildAttribute`s that carry the child state machine's dispatcher. The resolver
preserves them, so adapting the render seam does not flatten or bypass the child
boundary. Per-item components return structured groups rather than one flat
array, and the adapter keeps that shape: one Slot contribution applies to each
repeated item while every item's base attributes keep their own event ownership.

```text
Tabs       -> { tablist, tabs, activeIndex }
RadioGroup -> { group, options, selectedValue, hiddenInput }
Calendar   -> ResolvedDays | ResolvedMonths | ResolvedYears
Menu       -> { wrapper, button, backdrop, items, scroll, groups, isVisible }
Toast      -> { container, entries }
Listbox    -> { wrapper, button, backdrop, items, scroll, groups, hiddenInputs, isVisible }
Combobox   -> { wrapper, inputWrapper, input, toggleButton, backdrop, items, scroll, groups, hiddenInputs, isVisible }
```

### Look, state, drawing, features: one factory each

A variation of a widget is a call with options, never a copied file. A widget
is made of four kinds of fact, and each kind has one place it is given.

- **Look** is CSS over fixed markup: `Recipes.X(selection)`, adjusted with
  `.extend` and widened with `.add` ([Recipes](#recipes)).
- **State** is a Model and the Messages that change it: the widget's `init`
  and `update`, which an application folds by hand or places as `Bundles.X`.
- **Drawing** is markup, ARIA, events and words: `X.view(options, h)`, and
  `X.configure({ base, presets })` to give the options that never change
  once.
- **Features** are code most pages never need: another widget, a Behavior
  with a Mount, a second way to choose. A feature is a value the application
  imports and passes (`mixins: Tabs.fluid`, `Combobox.many(items)`); the
  widget imports only its type, so a page that never names it never ships it.
  A boolean that switches code on is the one thing an option is not.

`configure` ships on Button, TagsInput, Combobox, Listbox, Picker, CascadeSelect, Calendar, DatePicker and
FileUpload, and `Bundles` holds TagsInput, Combobox, Listbox, Picker, CascadeSelect, Calendar, DatePicker and
FileUpload today; the other widgets follow the same shape as they are
converted. [One factory for each part](#one-factory-for-each-part) shows
each with code.

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

| Widget | What it is | Recipe and Slots |
| --- | --- | --- |
| `Button` | Adapter over `@foldkit/ui`'s Button. `Button.view({ label, style, type?, disabled?, invalid?, busy?, pressed?, icon?, trailing?, description?, mark?, href?, external?, words?, onClick?, attributes?, mixins? }, h)`; `Button.toView` for your own `draw`. `disabled` writes `aria-disabled`, not `disabled`; `pressed` makes it a toggle (`aria-pressed`); an `icon` draws before the label, hidden from assistive technology. A button presses or it is a link: `href` draws an anchor and takes no `type` or `onClick`. | `tone`: `accent` (default), `neutral`, `danger`; `variant`: `solid` (default), `outline`, `ghost`, `primary`, `link`, `icon`; `size`: `xs`, `sm`, `md`, `lg`; `shape: 'square'`. Slots `button`, `icon`, `content`, `description`, `trailing`, `mark`. |
| `ButtonGroup` | `{ label, items, orientation?, separated? }`. A `role="group"` that joins its items: borders overlap by one and only the outer corners stay round. An item is the caller's button, field or Menu (a wrapper passes the corners to the face it holds), or a string drawn in the `text` box (a count, a field's prefix). `orientation: 'vertical'` stacks them; `separated` draws a rule on every seam, for solid buttons whose fills meet. `Segmented` is the control that selects. | `size` (`sm`, `md`, `lg`, for every item with no size of its own); `width: 'fill'` spans the container, a field taking what the buttons leave. Slots `root`, `separator`, `text`. |
| `Toolbar` | The APG's toolbar: one tab stop over controls you draw, the arrows along its orientation, Home and End. See [Toolbar](#toolbar). `Toolbar.view({ id, label, items, roving, onFocus, orientation?, direction?, loop?, disabled?, routes? }, h)`. | `size` is Button's ladder step, set on the toolbar. Slots `root`, `group`, `separator`. |
| `Command` | shadcn's Command and Fluid's CommandMenu: a search field over a list of grouped, filterable rows. `{ id, label, placeholder?, groups, query, onQuery, active, onActive, onRun, empty?, loading?, page?, routes?, hints?, kbd? }`. `Command.configure({ base, presets })` fixes the wording, hints, `kbd`, style and mixins once. See [Command](#command). | `frame`: `card` (default) or `bare`, for inside a dialog. Slots `root`, `search`, `crumbs`, `crumb`, `input`, `list`, `group`, `heading`, `item`, `icon`, `text`, `label`, `description`, `shortcut`, `chevron`, `status`, `empty`, `loading`, `frame`, `bar`, `thumb`, `footer`, `hint`. |
| `Kbd` | `{ key }` names a key, as text or as a drawing (an arrow, a modifier's glyph; it carries its own label); `Kbd.combo({ keys, joiner? }, h)` draws several in one `kbd`. | No axis. Slots `key`, `combo`, `joiner`. |

A button drawn as a button needs no `draw` at all. `Button.view` takes the
label, a style, and `@foldkit/ui`'s own config:

```ts
import { Button } from 'foldkit-mixins-ui'

const saveButton = (disabled: boolean, h: HtmlBuilder<Message>) =>
  Button.view(
    {
      label: 'Save',
      style: SaveStyle,
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

const BarStyle = Style.forSlots(ToolbarSlots)(Recipes.Toolbar({}))
const ToolStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline' }),
)

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
a chevron. `loading` says it and marks the list `aria-busy`, its rows still
shown; `hints` are a footer of keys.

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

| Widget | What it is | Recipe and Slots |
| --- | --- | --- |
| `Input` | Adapter over `@foldkit/ui`'s Input. `Input.view({ id, value, onInput, type?, placeholder?, name?, readOnly?, required?, autocomplete?, inputMode?, maxLength?, disabled?, invalid?, attributes?, style, label, description?, labelAside?, start?, end? }, h)` draws the field; with `draw` in place of `label` the application places the bundles; `Input.field` draws a whole field from a `FieldValidation.Field`. | `size`: `sm`, `md`, `lg`; `variant`: `outline` (default), `filled`, `ghost`, `underline`. Slots `input`, `label`, `description`, `root`, `header`, `labelAside`, `group`, `start`, `end`. |
| `Textarea` | `Textarea.view` takes the same and `rows`, `maxRows`, `maxLength`, `count`; `Textarea.field` is the whole field. | `size` and `variant` as Input's; `resize`: `auto` (default), `vertical`, `none`. Slots `textarea`, `label`, `description`, `count`, `frame`, `footer`, `meta`. |
| `PasswordInput` | `PasswordInput.view({ id, label, value, onInput, visible, onToggle, autocomplete?, description?, labelAside?, start?, end?, words?, invalid?, disabled?, name?, required?, attributes? }, h)`: a password field whose toggle (`aria-pressed`, `aria-controls`, one fixed name) shows it as text. `autocomplete` is `current-password` (default) or `new-password`; spellcheck and autocorrect stay off. `strength` is a gauge the app draws (`Meter.view(…, h)`) under the field, so a page with none ships no Meter; `requirements` are `{ label, met }[]` (`PasswordRequirement`), each read as met or not (`words.met`, `words.unmet`); `capsLock: { on, onKey }` says Caps Lock is on, politely, `onKey` given `capsLockOf(key, modifiers)` for each key (an `Option`). The application owns the text; the flag and the Caps Lock reading are the field's own small Model (`PasswordInput.init`, `update`, `Bundles.PasswordInput`), handed to the view by `...PasswordInput.controls(model, onMessage)`. `words`: `toggle`, `capsLock`, `met`, `unmet`. | `size` (`sm`, `md`, `lg`). Input's pieces in InputGroup's box; the eye is `Icons.glyph` by `aria-pressed`. Slots `root`, `label`, `header`, `labelAside`, `group`, `start`, `end`, `input`, `toggle`, `description`, `strength`, `requirements`, `requirement`, `requirementState`, `capsLock`. |
| `SearchField` | A native `type="search"` input named by `label`, with a clear button only while there is text. `SearchField.view({ id, label, value, onInput, clear?: { onClear, content? }, start?, end?, busy?, placeholder?, invalid?, disabled?, words?, routes?, style?, mixins? }, h)`. See [SearchField](#searchfield). | `size` and `variant` (`outline`, `filled`, `ghost`, `underline`) are Input's axes. One box (`group`) with a magnifier in `start` while it is empty, the clear button after the input (mirrored right to left), the browser's own cancel button hidden. Slots `root`, `group`, `start`, `end`, `input`, `clear`. |
| `NumberField` | The APG's editable spinbutton. `{ id, label, description?, value, onChange, min?, max?, step?, page?, locale?, name?, required?, disabled?, invalid?, readOnly?, start?, end?, words? }`, or `format` with `parse` in place of `locale`. `value` is an `Option<number>`: none is an empty field (no `aria-valuenow`, the steppers start from the bounds), and clearing the text sends `onChange(Option.none())`. `NumberField.parseNumber(text, locale?)` reads text as that locale writes a number; `NumberField.settled(value, bounds)` clamps onto the step. | `steppers`: `split` (default: a button at each side of the number), `end` (both after it) or `none`. Slots `root`, `label`, `group`, `start`, `end`, `input`, `decrement`, `increment`, `description`. `invalid` draws the error edge and marks the input; `readOnly` leaves it readable and selectable with its steppers disabled; `words` (`decrease`, `increase`) names the steppers; `start` and `end` go around the number inside the box. |
| `OtpField` | shadcn's input-otp: one real input (`autocomplete="one-time-code"`, paste and Backspace the browser's) over cells that mirror it, the next marked `data-next`. `{ id?, name?, label, value, onChange, length?, pattern?, groups?, mask?, disabled?, readOnly?, invalid? }` (`mask: true` makes the input a password field and shows a dot in each filled cell, or the string given); `OtpField.kept(text, length, pattern)` filters a code. | No axis. Slots `root`, `input`, `group`, `cell`, `separator`. |
| `TagsInput` | Zag's tags input. A small Model: `TagsInput.init({ id, tags?, delimiter?, max? })`, folded with `TagsInput.update` (which returns a focus Command). `TagsInput.view({ model, onMessage, label, placeholder?, name?, disabled?, direction?, addOnBlur?, routes?, words? }, h)`. See [TagsInput](#tagsinput). | No axis; `data-disabled` on `control`. Slots `root`, `label`, `control`, `list`, `tag`, `remove`, `input`, `message`, `hiddenInput`. |
| `InputCopy` | A read-only value with a copy button (Zag's clipboard). A small Model for the copied and failed marks. `InputCopy.view({ id, label, value, copied, failed?, onCopy, words?, copyContent?, start?, end? }, h)`; `Bundles.InputCopy` (args `{ resetAfter? }`) packages the Model. `words`: `copy`, `copied`, `failed`. `copyContent` is drawn in the button in place of its words, which stay in it for a screen reader. | No axis. Slots `root`, `label`, `group`, `start`, `end`, `input`, `button`, `buttonText`, `status`. |
| `Label` | `{ for, text, required?, optional?, disabled?, invalid?, trailing?, words? }`: a `label` that names a control by `for` (the id `FieldAssociation` derived). `required` draws a star the screen reader skips and `optional` the words `(optional)` that are read, after the text (`words`: `required`, `optional`); a field is one or the other. `disabled` and `invalid` mark the label (`data-disabled`, `data-invalid`) and do nothing to the control. `trailing` stands beside the label in a row with it, not inside it. | No axis. Slots `label`, `marker`, `trailing`, `root`. |
| `Field` | The shell around a control you drew: `Field.view({ id, label, control, description?, errors?, required? or optional?, orientation?, labelAside?, words?, style? }, h)`. The label names the control by `id`; `required` draws a mark hidden from a reader, `optional` words that are read (`words`: `required`, `optional`); `errors` are lines in an alert under the control; `orientation` is `vertical` (default) or `horizontal`. The control is drawn first, so it cannot know the shell's ids: give it `Field.describedBy(h, id, { description, errors })` as attributes. The shell owns no state. | Slots `root`, `header`, `label`, `marker`, `labelAside`, `control`, `description`, `errors`, `error`. `data-orientation` and `data-invalid` are on `root`. |
| `Fieldset` | Adapter: a `fieldset`, its `legend` and a `description`. `Fieldset.view({ id, legend, content, description?, disabled?, style?, mixins? }, h)` draws it with the `content` you drew; `toView` stays for one drawn as something else. | `variant`: `plain` (default, no box), `bordered`, `filled`. The recipe floats the legend into the group, so a box drawn round it holds the legend; a boxed group pads its fields, and a control in it takes a corner concentric with the box's; a disabled fieldset dims its legend and description. Slots `fieldset`, `legend`, `description`. |
| `FileInput` | A file picker, not a drop zone: a native `type="file"` input and the button that labels it. The application owns the files. See [FileInput](#fileinput). | `size` is Button's ladder step. Slots `root`, `input`, `trigger`, `description`, `list`, `item`, `name`, `remove`. |
| `FileUpload` | A field of files with a status each: a native `type="file"` input and the picker that labels it (`layout`: `button`, `zone`, `avatar`, `cover`), drop, previews, refusals, lanes for sending, `parts` for a layout of your own. A small Model: `FileUpload.Model`, `init`, `update`, placed by the application. See [FileUpload](#fileupload). | `layout`; `list`: `rows` (default), `grid`; `size` is Button's ladder step. Slots `root`, `input`, `picker`, `prompt`, `browse`, `constraints`, `description`, `picture`, `status`, `errors`, `error`, `summary`, `clear`, `list`, `item`, `preview`, `name`, `meta`, `state`, `progress`, `actions`, `retry`, `remove`, `grip`. |
| `FileDrop` | Adapter over `@foldkit/ui/fileDrop`: a drop zone. `FileDrop.Message` is upstream's four Messages over a `File` codec that needs no decoding services (upstream types its files as `Schema<File>`, whose services are `unknown`, so a Message holding it could not be a `Bundle.parent`'s); `FileDrop.update` of upstream takes it as it is. | The recipe rings the zone while its input has keyboard focus (a press does not) and dims a disabled one. Slots `root`, `input`. |

`Input.view` and `Textarea.view` place their own bundles, so each takes a
`draw`:

```ts
import { Input } from 'foldkit-mixins-ui'

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
      style: Style.forSlots(SearchFieldSlots)(Recipes.SearchField({})),
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

const FileFieldStyle = Style.forSlots(FileInputSlots)(Recipes.FileInput({}))

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

const UpStyle = Style.forSlots(FileUploadSlots)(Recipes.FileUpload({ layout: 'zone' }))

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
const UpAvatarStyle = Style.forSlots(FileUploadSlots)(Recipes.FileUpload({ layout: 'avatar' }))

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
import { FileUploadProgress, ProgressSlots } from 'foldkit-mixins-ui'

const UpBar = FileUploadProgress.make({
  style: Style.forSlots(ProgressSlots)(Recipes.Progress({})),
})
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

- **NumberField.** What the field draws is what it accepts: `locale` draws and
  reads that locale's marks (`de-DE`: `1.234,5`); `format` with its `parse`
  (`Option.none()` for text that is no number, which leaves the value as it was)
  is for anything else; with neither it is `String` and a plain number. Arrows,
  PageUp and PageDown, Home and End step it, a typed number commits on change, and
  the steppers sit out of the tab order and disable at their bound. `name` submits
  the text the field shows; `required` is the native `required` with
  `aria-required`.
- **OtpField.** `id` names the input for a label or a form, `readOnly` lets the
  code be read and copied, and `invalid` marks the input `aria-invalid` and each
  cell `data-invalid`.
- **InputCopy.** The view is stateless; answer `onCopy` with the
  `InputCopy.Copy({ text })` Command, which yields `foldkit-primitives/dom`'s
  `ClipboardMessage` (`Copied` or `CopyFailed`, never a throw). `InputCopy.Model`
  keeps the marks: `InputCopy.init({ resetAfter? })` (default 2000ms), folded with
  `InputCopy.update`, where `Copied` shows it copied and starts the `Reset` Command
  that sets it back unless a later copy came first, and `Failed` does the same for
  a refused copy (`failed`, never together with `copied`). Pass `model.copied` and
  `failed: model.failed`; the status region says `words.failed` (default `Copy
  failed`) while the button carries `data-failed`. The button is named `Copy
  <label>`; copied, it reads `Copied` and a polite status region says so.
- **PasswordInput.** `onInput` is a closure or a resumable builder's `OnInput`
  attribute, and `attributes` adds to any Slot (`{ input: [rh.KeepTyped()] }`), as
  [Form participation](#form-participation) shows.

## Choosing a value

The application keeps the chosen value in its Model. The widgets that submit
natively take a `name` (see [Form participation](#form-participation)).

| Widget | What it is | Recipe and Slots |
| --- | --- | --- |
| `Checkbox` | `Checkbox.view({ id, checked, onToggle, label, description?, position?, labelAside?, indeterminate?, disabled?, readOnly?, invalid?, name?, value? }, h)` draws the row: the box, its label and a line of description that also describes it; `position: 'end'` puts the words first, `labelAside` is a slot beside the label (a Badge, a Tooltip's trigger). `Checkbox.configure({ base, presets })` states the look once. `Checkbox.toView` stays the adapter, for a layout of your own. | `tone`: `accent` (default), `neutral` (checked in the page's ink), `danger`; `size`; `variant`: `plain` (default), `card` (the row boxed and filled while checked, one press target); `shape`: `square` (default), `round`. Slots `root`, `text`, `heading`, `aside`, `checkbox`, `label`, `description`, `hiddenInput`. |
| `CheckboxGroup` | `{ id, legend, options, checked, onToggle, error?, name?, selectAll? }`, each option `RowContent` (`{ value, label, description?, icon?, trailing?, content?, disabled? }`: `description` is text or Html, `icon` a mark inside the label, `trailing` a badge or count after it, `content` the words of your own drawing, `label` still the name). `variant: 'card'` boxes each row and stretches its label over it, so a press anywhere on it chooses it. `CheckboxGroup.configure`. A `fieldset` named by its `legend`, each option the APG's checkbox named by a `label` for it, so a press on the words toggles it. `toggled(checked, value)` is one option's transition; `coverage(options, checked)` is `none`, `some` or `all` (a disabled option counts for neither); `setEnabled(options, checked, on)` is every enabled option or none, a disabled one keeping the state `checked` gives it. `selectAll: { label, onSet }` draws a first row checked, `mixed` or unchecked by `coverage` that controls every option; a press sends `onSet` with `setEnabled`'s values, on unless all already are. `error` is shown under the options: the `fieldset` is described by it and each checkbox is `aria-invalid`. | `variant`: `plain` (default), `list` (checked rows fill, and merge where they stand together); `orientation`: `vertical` (default), `horizontal` (a wrapping row). The checkbox sits on the label's row, so a description does not pull it down. Slots `root`, `legend`, `options`, `option`, `checkbox`, `label`, `description`, `error`. |
| `Switch` | `Switch.view({ id, checked, onToggle, label, description?, position?, labelAside?, disabled?, readOnly?, invalid?, name?, value? }, h)`, as the Checkbox's without `indeterminate`; `Switch.configure`. `Switch.draggable(onToggle)` beside the style lets the thumb be dragged; it lives in a file of its own, so a page that never names it ships no part of it. An invalid switch's track is ringed. `Switch.toView` is the adapter. | `tone`: `accent` (default), `neutral`, `danger`; `size`; `variant`: `plain`, `card` as Checkbox. Slots `root`, `text`, `heading`, `aside`, `button`, `label`, `description`, `hiddenInput`.
| `RadioGroup` | `RadioGroup.view({ model, onMessage, legend, options, value, orientation?, hideLegend?, disabled?, readOnly?, invalid?, error?, name? }, h)` over the focus cursor `Bundles.RadioGroup` holds; `options` are `{ value, label, description?, icon?, trailing?, content?, disabled? }` (`RowContent`) and `value` is the application's `Option`, set from the `Selected` the Bundle reports. An `error` draws under the group, makes it `aria-invalid` and describes it. `RadioGroup.configure`. `RadioGroup.readingKeys` reads both arrow pairs whichever way the group stands (see [Right to left](#right-to-left)) and lives in a file of its own. `RadioGroup.toView` is the adapter: each row a `label` around its `option`, carrying the `card` bundle. | `variant`: `plain` (default), `card` (frames each card, filling the checked one); `tone`: `accent` (default), `neutral`; `size`. The recipe stacks the group unless `aria-orientation` is `horizontal`, and a row wraps. Slots `group`, `option`, `label`, `description`, `hiddenInput`, `card`. |; `layout`: `stacked` (default), `grid` (rows in columns that fill the room); `tone` adds `danger`. New Slots `root`, `legend`, `text`, `icon`, `trailing`, `error`.
| `Segmented` | A tray of buttons where pressing selects. `Segmented.view({ id, label, options: { value, label, icon?, iconOnly?, disabled? }[], pressed, onPress, multiple?, orientation?, direction?, name?, disabled? }, h)`; `Segmented.toggled(pressed, value, { multiple, optional })` is the transition `update` applies; `Segmented.configure`. `multiple` is a toggle group, `orientation: 'vertical'` stacks it. `Segmented.fluid` (the gliding pill) is a file of its own. See [Segmented](#segmented). | `tray`: `tray` (default, muted), `plain`, `underline`; `size`: `xs`, `sm`, `md`, `lg`; `width: 'fill'`. Slots `group`, `option`, `label`, `icon`, `content`, `indicator`, `highlight`, `hiddenInput`. |
| `Select` | `Select.view({ id, label, options, value?, onChange?, placeholder?, description?, disabled?, invalid?, name? }, h)` draws the native `<select>` from `options: { value, label, group?, disabled? }[]` (neighbours with one `group` sit under an `optgroup`); `Select.configure`. `Select.toView` is the adapter. For icons, descriptions or a check in the list, draw a Listbox as a custom select with `Listbox.parts`. | `size`: `sm`, `md` (default), `lg`; `variant`: `outline` (default), `filled`. Slots `root`, `select`, `label`, `description`. |
| `Listbox` | A custom select. `Listbox.view({ model, onMessage, label, choice, value, items?, option?, groupBy?, heading?, placeholder?, trigger?, clear?, disabled?, invalid?, readOnly?, name?, anchor?, direction?, words?, style?, mixins? }, h)` draws it over the interaction state `Bundles.Listbox` holds and a value the application owns, read through a `Choice` (`Listbox.one(items)`, `Listbox.many(items)`, or your own); a row is `RowContent`. The trigger is named "label: chosen rows" and shows the chosen row's icon and label, several labels joined, or the placeholder, muted; `trigger: rows => Html` draws something else for them (a stack of dots). `clear: { onClear, content? }` draws a button inside the trigger while something is chosen, and sends the application's own Message, since the value is the application's. `Listbox.configure({ base, presets })` binds `placeholder`, `anchor`, `direction`, `words`, `style` and `mixins`. A closed listbox submits its value under `name`. `Listbox.fluid` and `Listbox.overlayBars` are files of their own. `Listbox.toView`, `resolve` and `parts` are the adapter over a fork (see [Why some components needed a fork](#why-some-components-needed-a-fork)) for a drawing of your own: `parts(mixins, { h }).option(rowContent)` draws a row and `.trigger(chosenRows, placeholder, shown?)` the button's content. An invalid trigger writes `aria-invalid` and draws the error edge, a disabled one shows no hover, and a portaled panel carries the `direction`. | `width`: `auto` (default), `trigger`; `check`: `end` (default), `start`, `none`; `trigger`: `outline` (default), `filled`, `ghost`; `size`. Slots `root`, `wrapper`, `button`, `clear`, `backdrop`, `items`, `scroll`, `item`, `group`, `heading`, `separator`, `rows`, `highlight`, `indicator`, `scrollBar`, `scrollThumb`, the option's and trigger's parts (`itemIcon`, `itemLabel`, `itemDescription`, `itemTrailing`, `itemCheck`, `value`, `valueText`, `chevron`, …). |
| `Combobox` | Adapter over a fork, single and multi. `Combobox.view({ model, onMessage, label, choice, value, … }, h)` draws it from options ([State](#state-fold-it-by-hand-or-place-a-bundle)). On the adapter, the view inputs add `chips: {}` (each chosen value a chip in the field, labelled by `itemToDisplayText`, its remove button choosing it again; with `ComboboxView.Multi`, a tags field with suggestions), `clearContent` and `clearLabel` (a clear button while the field has text; `clearContent: null` draws a cross), `words: { clear?, remove? }`, and `empty` (shown, as a polite status, in the list's place while open with nothing to list; a loading line too). `Combobox.parts(mixins, { h }).option(content, query)` draws a `RowContent` and marks the typed text in its label. A closed combobox submits its value under `formName` too. Home and End move the caret in the text: the list's ends are not bound to them. An invalid combobox writes `aria-invalid` on the input and draws the error edge on the field; the clear button is a touch-sized target. | `width`: `trigger` (default), `auto`; `size`. Slots as the Listbox's with `wrapper`, `inputWrapper`, `input`, `toggleButton`, `chips`, `chip`, `chipRemove`, `clearButton`, `empty`, `itemTrailing`. |
| `Picker` | A select that is a dropdown on a desktop and a bottom sheet on a phone, with one Model and one set of Messages whatever the width. `Picker.view({ model, onMessage, label, choice, value, items?, option?, groupBy?, heading?, placeholder?, clear?, disabled?, invalid?, name?, anchor?, words?, style?, mixins?, listbox?, sheet?, routes? }, h)` takes the Listbox's `choice` (`Picker.one(items)`, or your own choice of at most one item) and draws both halves from it; `Bundles.Picker` holds the state and reports the `Selected` a choice in either half is. `Picker.configure({ base, presets })`. A small Model remains for the hand-written fold: `Picker.init({ id, sheet? })` and `Picker.update`, which returns `Picker.OutMessage.Chose({ value })`. See [Picker](#picker). | `sheetBelow`: `sm`, `md` (default), `lg`; `trigger`: `outline` (default), `filled`, `ghost`; `size`. Slots `root`, `dropdown`, `opener`, `list`, `option`, `group`, `heading`. |
| `CascadeSelect` | After Zag's: one value chosen as a path of ids through nested options. The path is the widget's own value: `Bundles.CascadeSelect` holds it (and the path the keys are on) with the options, `config: { nodes, parents?, loop?, closeOnSelect?, inline? }`, as its args, and reports `Changed` when it moves; `helpers.set(path)` sets it from the parent and reports nothing. `CascadeSelect.view({ model, config, onMessage, label, placeholder?, levels?, layout?, expandOn?, separator?, triggerText?, clear?, option?, name?, disabled?, invalid?, direction?, words?, routes?, style? }, h)`; `option: node => RowContent` draws a row's icon, description and trailing part, `triggerText` the trigger's text for the chosen labels, `config.inline` the tree in place with no trigger. `CascadeSelect.configure`. A hand-written fold stays: `CascadeSelect.init`, `update(config)`. See [CascadeSelect](#cascadeselect). | `size`; `trigger`: `outline`, `filled`, `ghost`; `width`: `trigger`, `auto`. Slots `root`, `trigger`, `valueText`, `chevron`, `clear`, `input`, `layer`, `backdrop`, `panel`, `column`, `heading`, `back`, `item`, `itemIcon`, `itemText`, `itemLabel`, `itemDescription`, `itemTrailing`, `branch`. |
| `Slider` | Native `input type="range"` thumbs, so drag, keys, right to left and the form value are the browser's. `Slider.view({ id, label, value, onChange, onCommit?, description?, min?, max?, step?, format?, marks?, showValue?, name?, disabled?, orientation?, ticks?, words? }, h)`; `value` is a number, a `{ low, high }` range or a list of numbers (a thumb each, stopping at its neighbours), and `onChange` is handed the same kind. `words` names a range's thumbs (`low`, `high`) and a list's (`thumb`, with `{index}` and `{count}`). `Slider.configure`. See [Slider](#slider). | `tone`: `accent` (default), `neutral`; `size`: `sm`, `md` (default), `lg`; `track`: `thick` (default), `thin`, `paint`; `value`: `above` (default), `inside`, `end`; `label`: `shown` (default), `hidden`. Slots `root`, `label`, `description`, `control`, `track`, `fill`, `mark`, `value`, `thumb`. |
| `AngleSlider` | After Zag's: a dial in degrees, 0 at the top and clockwise. A small Model: `AngleSlider.init({ id, value? })` is the angle and the drag, folded with `AngleSlider.update(layout)`, where `layout` (`step`, `largeStep`, `marks`, `restrictToMarks`) is the object the view spreads in too; `Bundles.AngleSlider` packages both, with the layout as its args (`Bundles.AngleSlider.with({ id, ...layout })`), and `AngleSlider.configure` states the look, layout and `words` (`degrees`, the angle read aloud) once. `AngleSlider.view({ ...layout, model, onMessage, label, name?, format?, valueText?, showValue?, disabled?, readOnly?, invalid? }, h)`. A press or drag sends `Pointed` and `Released`; the APG's slider keys reach `update` as what was pressed, and go round past 0. | `tone`; `track`: `ring`, `plain`, `disc`; `value`: `inside`, `below`; `size`. Slots `root`, `label`, `control`, `needle`, `thumb`, `markers`, `marker`, `markerLabel`, `value`, `input`. |
| `Rating` | A `radiogroup` of native radios named by its label, one per star under one name, so the browser's arrows move the choice and a form submits it. `Rating.view({ id, label, value, onChange, max?, labels?, words?, readOnly?, disabled?, name?, precision?, onClear?, showValue? }, h)`; `value` is an `Option`, none is unrated. `words` is the text with blanks (`one`, `other`, `rated`, `notRated`); `labels` names each whole number of stars. Read-only, it is one `img` whose name says the rating, and takes no `onChange`. `Rating.configure`. | `tone`: `warning` (default, gold), `accent`, `danger`, `success`, `info`, `neutral`; `glyph`: `star` (default), `heart`, `circle`; `size`. Slots `root`, `label`, `star`. |
| `ColorPicker` | After ReUI's: a saturation and brightness area, hue and alpha Sliders, an eyedropper when the application asks for one (`eyedropper`, default `false`), text in hex, rgb, hsl or oklch, and `presets` as a radio group of swatches. A small Model: `ColorPicker.init({ id, color?, format? })` holds the color, its format and a draft being typed, folded with `ColorPicker.update`. `ColorPicker.view({ model, onMessage, label, presets?, alpha?, eyedropper?, labels?, disabled?, slider? }, h)`; `ColorPicker.popover({ ...options, popover, onPopover, anchor?, popoverMixins? }, h)` draws it behind a swatch in a Popover. See [ColorPicker](#colorpicker). | `size`. Its Sliders take `Recipes.Slider({ track: 'paint', label: 'hidden' })`. Slots `root`, `label`, `area`, `areaThumb`, `controls`, `eyedropper`, `channels`, `channel`, `swatch`, `fields`, `format`, `input`, `presets`, `preset`, `picker`, `trigger`, `value`. |
| `Calendar` | One date system, inline. `Calendar.Selection` is `Single`, `Range` or `Multiple`, held by the Calendar's state (`Bundles.Calendar`), or by the application on the adapter rung. See [Calendar and DatePicker](#calendar-and-datepicker). | `size`; `outside`: `shown` (default), `hidden`; `detail`: `text`, `dot`, unset by default. Slots `frame`, `body`, `main`, `months`, `todayButton`, `aside`, `footer` (what `Calendar.view` lays around the months), `root`, `header`, `grid`, `headerRow`, `previousMonthButton`, `nextMonthButton`, `headingButton`, `previousPageButton`, `nextPageButton`, `columnHeader`, `weekRow`, `dayCell`, `dayButton`, `monthCell`, `monthButton`, `yearCell`, `yearButton`. |
| `DatePicker` | A Calendar in a popover, over a fork that keeps upstream's Popover and Calendar composition. A date, a range or many days. See [Calendar and DatePicker](#calendar-and-datepicker). | Slots `wrapper`, `trigger`, `panel`, `backdrop`. |

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
rating draws no route. `name` defaults to `id`. Tone `error` is `danger`.

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

| Widget | What it is | Recipe and Slots |
| --- | --- | --- |
| `Menu` | One menu opened three ways: by a button, at a point (a context menu) or from a long press. A small Model: `Menu.init(id, rows, { isAnimated?, isModal? })`, folded with `Menu.update`. `Menu.view({ model, rows, buttonContent, onMessage, opensAt?, direction?, anchor?, header?, footer?, isRowDisabled?, mixins, submenuMixins? }, h)`, the style being one of the `mixins` (`[MenuStyle.mixin]`). `Bundles.Menu.with({ id, rows, isAnimated?, isModal? })` holds the state (it reads the rows' structure only) and answers `Selected`; `Menu.configure({ base, presets })` fixes the look, `anchor` and `direction` once. See [Menu](#menu). | No axis. Slots `wrapper`, `button`, `backdrop`, `items`, `scroll`, `item`, `group`, `heading`, `separator`, `rows`, `highlight`, `scrollBar`, `scrollThumb`, `label`, `sub`, `chevron`, `check`, `shortcut`, `icon`, `hint`. |
| `Menubar` | A row of Menus, shadcn's and the APG's menubar. A small Model: `Menubar.init(ids, { isAnimated?, isModal? })`, folded with `Menubar.update`, whose `Selected` OutMessage names the menu and the row's `value`. `Menubar.view({ label, model, menus, onMessage, direction?, anchor?, routes?, style?, menuMixins? }, h)` (`Bundles.Menubar.with({ ids, isAnimated?, isModal? })` places the Model and reports `Selected` with the menu's index; `Menubar.configure({ base, presets })`), each menu `{ label, rows, isRowDisabled?, header?, footer? }` taking a Menu's rows (none opening a submenu). One trigger is the tab stop; ArrowLeft/ArrowRight (Home/End while all are shut) move it, and with a menu open they open the next on its first row. While one is open, pointing at another opens it, and opening any shuts the rest. | No axis. `Recipes.MenubarMenu` is the Menu recipe with a bar's flat triggers. Slots `bar`, `menu`; each menu's are `MenuSlots`. |
| `Dialog` | Adapter over `@foldkit/ui`'s Dialog. See [Dialog](#dialog). | `size`: `sm`, `md` (default), `lg`, `xl`, `full`; `title`: `shown`, `hidden`; `close`: `corner`, `none`; `motion`: `standard`, `none`. Slots `dialog`, `backdrop`, `panel`, `title`, `description`, `initialFocus`, `closeButton`, `handle`, `body`, `scroll`, `scrollBar`, `scrollThumb`, `footer`. |
| `Sheet` | A Dialog a finger drags, vaul's Drawer. A small Model: `Sheet.init({ id, side?, points?, opensAt?, dismissible?, isAnimated?, swipe? })`, folded with `Sheet.update`, opened with `Sheet.open` and `Sheet.close`. `Sheet.view({ model, onMessage, style?, mixins?, words?, hasDescription?, covered?, scalesPage?, draw }, h)`. See [Sheet and Drawer](#sheet-and-drawer). | `Recipes.Sheet`: `size`: `sm`, `md` (default), `lg`, `full`; `handle`: `bar` (default), `none`; `title`; `close` and `motion`, as on `Recipes.Dialog`. Slots are `DialogSlots`. |
| `Drawer` | A panel docked to the bottom of the screen that peeks or opens beside the page, not over it: no focus trap, backdrop or scroll lock, so the page under it stays live (a modal one is the `Sheet`). A small Model: `Drawer.init({ id, open?, swipe? })`, folded with `Drawer.update`, opened with `Drawer.open` and `Drawer.close`. `Drawer.view({ model, onMessage, label, style?, mixins?, draw }, h)`. | `Recipes.Drawer`: `dock`: `always` (default), `below-lg`, `below-xl`, above which the panel is the column it sits in, with no handle. Slots `panel`, `handle`, `body`, `grip`. |
| `Popover` | Adapter. `Popover.anchor(config?)` is the placement. The panel grows from the side it opened on and, with the Popover's `isAnimated`, fades out as it leaves; the open button keeps the hover film. | `arrow`: `shown` (default), `none`. Slots `button`, `panel`, `backdrop`, `arrow`, `layer`. |
| `Tooltip` | Adapter. `Tooltip.toView(mixins, { h, id }, draw)` takes the Tooltip's id (`model.id`), whose trigger the arrow points at; `Tooltip.anchor(config?)` is the placement, above by default. | `arrow`: `shown` (default), `none`. Slots `trigger`, `panel`, `arrow`, `layer`. |
| `HoverIntent` | Adapter: open and close delays with intent (200ms and 300ms by default), for a hover card or a menu. `anchored: { id, anchor? }` in the context anchors the panel to the trigger in the top layer (`HoverIntent.anchor()` unless given); the trigger takes `HoverIntent.triggerId(id)`, `aria-expanded` and, while open, `aria-describedby` naming the panel, whose id is `HoverIntent.panelId(id)`. `HoverCard` is its recipe. | `HoverCard`: no axis; a trigger read as a link, a raised panel fading in on the fast tier. Slots `trigger`, `panel`, `arrow`. |
| `Anchor` | A Mount and a Behavior over `@foldkit/ui/anchor`: `Anchor.behavior(Slots)({ floating, config })` positions a floating slot against a button by id; `Anchor.topLayer(mount)` shows an in-place panel in the top layer around it. | |
| `FloatingPanel` | After Zag's: a non-modal window. A small Model: `FloatingPanel.init({ id, rect, open? })` holds its rect, stage and a drag, folded with `FloatingPanel.update(limits)` (`min`, `max`, `grid`, `overflow`); `FloatingPanel.open(model)` focuses it and `close` closes it. `FloatingPanel.view({ model, onMessage, title, content, order?, draggable?, resizable?, closeOnEscape?, routes?, step?, direction?, labels? }, h)`. See [FloatingPanel](#floatingpanel). | `header`. Slots `root`, `boundary`, `panel`, `header`, `dragTrigger`, `title`, `controls`, `minimize`, `maximize`, `restore`, `close`, `body`, `handle`. |
| `Tour` | Steps anchored beside their targets in the top layer, over a dim with a cutout the target's presses reach. A small Model: `Tour.init({ id })`, started with `Tour.start(model, config)` and folded with `Tour.update(config)` (`config` is `{ steps: [{ title, description, target?, placement? }] }`). `Tour.view({ model, config, onMessage, padding?, interactive?, dismissOnOutside?, closeOnEscape?, routes?, labels?, direction? }, h)`. | No axis. Slots `layer`, `blocker`, `spotlight`, `panel`, `arrow`, `progress`, `title`, `description`, `actions`, `back`, `next`, `skip`. |

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

const DialogStyle = Style.forSlots(DialogSlots)(Recipes.Dialog({ size: 'sm' }))

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

### Tour

The target scrolls into view; Next, Back and the arrows move on, Escape and Skip
end it, and `update` returns `Ended { completed }`. A step without a target, or
whose target is missing, stands in the middle. `routes` are [application key
routes](#application-key-routes) on a step, such as a digit jumping to that step,
beside the arrows and, unless `closeOnEscape` is false, Escape. `Tour.focusReturn`
is opt-in and is the one way focus returns: ending the tour gives focus back to what
had it before it started.

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

| Widget | What it is | Recipe and Slots |
| --- | --- | --- |
| `Tabs` | `Tabs.view({ model, onMessage, label, tabs: { value, label, icon?, trailing?, disabled?, panel? }[], value, orientation?, close?, routes? }, h)` draws the tablist and the chosen row's panel; `Bundles.Tabs.with({ id, activationMode? })` holds the focus cursor and reports `Selected`, the chosen `value` being the application's. `Tabs.configure({ base, presets })`. Below it, the adapter: a tab is a flex row, so draw its words in `label` (`h.span(label, [words])`), an icon in `icon`, a Badge after them for a count. `TabsContext.close: { onClose }` makes tabs closable; `TabsContext.routes` takes [application key routes](#application-key-routes). `Tabs.readingKeys` beside the style reads the arrow keys by the tablist's direction. See [Tabs](#tabs). | `variant`: `line` (default), `pill`; `size`; `overflow`: `scroll`, `wrap`; pill-only `selection`: `raised` (default), `tint`; upstream's `orientation: 'Vertical'`. Slots `root`, `tablist`, `tab`, `panel`, `indicator`, `highlight`, `item`, `label`, `icon`, `close`. |
| `Nav` | Two layers. `Nav.toView(mixins, { h }, label, draw?)` styles `@foldkit/ui`'s stateless Nav (`nav > ul > li > a`, the current link `aria-current="page"`). `Nav.view({ model, entries, label, onMessage, orientation?, direction?, routes?, panelRoutes?, mixins? }, h)` is a navigation menu with panels of link columns; a link and a panel link take `icon` (Html before the words, in the `icon` slot, hidden from assistive technology) and a panel takes `footer` (Html after its groups, in the `panelFooter` slot). A small Model: `Nav.init(id)`, folded with `Nav.update`, or placed as `Bundles.Nav.with({ id })`; `Nav.configure({ base, presets })`. See [Nav](#nav). | `indicator`: `underline` (default), `pill`; `panel`: `list` (default), `grid` (the groups in equal columns); `orientation: 'vertical'`. Slots `nav`, `list`, `item`, `link`, `trigger`, `chevron`, `panel`, `groups`, `group`, `heading`, `links`, `panelItem`, `panelLink`, `icon`, `panelFooter`, `title`, `description`, `indicator`, `highlight`. |
| `Breadcrumb` | `{ words?, steps: { label, href?, current?, icon?, trailing?, labelHidden? }[], separator?, collapse? }`. `words` is `{ label, more, ellipsis }` (defaults `Breadcrumb.words`, merged word by word): the landmark's name (`Breadcrumb`), the ellipsis's name (`Show {count} more`, `{count}` the hidden steps) and its mark (`…`). `current` is text with `aria-current="page"`; the others are links. `trailing` draws after the label (a count), in the `trailing` slot; `labelHidden` draws no words, and the label is the step's accessible name, for an `icon` that says it. `collapse: { max, onExpand }` folds the middle of a long trail into an ellipsis (`Breadcrumb.collapsedOf(steps, max)` is the split); `collapse: BreadcrumbMenu.make({ max, menu: { model, onMessage, mixins } })` makes the ellipsis open a Menu of the hidden steps (a value from its own module, so a trail that opens none loads no Menu; any `CollapseFeature`, `{ max, draw }`, is the same seam for a fold of your own), built from `Breadcrumb.menuRows(steps, max)`, with `Breadcrumb.chosen(steps, max, value)` the step a row leads to (a row's value is its step's place among the hidden steps, so two steps of one label are two rows). | `item`: `plain` (default), `pill`, `button`. `separator`: `slash` (default), `chevron`, `dot`. The separator is drawn after each step but the last, so a wrapped trail never begins a line with one. Slots `root`, `list`, `item`, `link`, `current`, `icon`, `trailing`, `separator`, `ellipsis`, `dots`. |
| `Pagination` | `{ page, pageCount, onPage, siblings?, boundaries?, numbered?, ends?, icons?, range?, words? }`. `Pagination.itemsOf(page, pageCount, window?)` is the stops; `Pagination.summaryOf(page, { total, perPage }, summary?)` is `"1–10 of 97"`, drawn before the stops when `range` is given. See [Pagination](#pagination). | `compact`: `narrow` (default, below a 30rem window), `always`, `never`; `shape`: `square` (default), `round`; `treatment`: `ghost` (default), `outline`. Slots `root`, `summary`, `perPage`, `perPageSelect`, `first`, `prev`, `next`, `last`, `page`, `pageCount`, `ellipsis`. |
| `Steps` | A stepper, an ordered list named by `label`. `Steps.view({ label, steps: { title, description?, icon?, content?, state?, trailing? }[], current, onSelect?, words?, progress? }, h)`. The step at `current` is `aria-current="step"`, those before it `data-state="complete"` (a check replaces the number), those after `upcoming`. With `onSelect(index)`, completed steps are buttons for going back; steps ahead never are. The application owns `current`. | `orientation`: `horizontal` (default), `vertical`; `size`: `xs`, `sm`, `md`, `lg`; `marker`: `number`, `dot`; `connector`: `line`, `progress`, `segments`; `labels`: `current`, `hidden`. Slots `root`, `item`, `step`, `trigger`, `marker`, `number`, `text`, `title`, `state`, `description`, `content`, `trailing`, `connector`. |
| `Sidebar` | shadcn's sidebar with Fluid's collapse. A small Model: `Sidebar.init({ id, rows, open?, collapsed?, side?, width? })`, folded with `Sidebar.update`. `Sidebar.view({ model, onMessage, label, groups, header?, footer?, direction?, collapse?, style?, mixins?, tooltip?, sheet? }, h)`. See [Sidebar](#sidebar). | `variant`: `sidebar` (flush with the page's edge, the default), `floating`, `inset`. Slots `root`, `header`, `footer`, `opener`, `title`, `toggle`, `nav`, `section`, `heading`, `trigger`, `chevron`, `links`, `item`, `branch`, `link`, `icon`, `mark`, `detail`, `label`, `badge`, `action`, `tip`, `indicator`, `highlight`, `resize`. |
| `AppShell` | An application's page frame: `AppShell.view({ title, brand?, status?, actions?, side?, footer?, mainId?, words? }, main, h)`. A skip link to the main region, a header bar (the banner) with the title and, at its end, `status` and `actions`, an optional side column for a `Sidebar`'s view, the main region (`id` `main` by default, focusable by script so the skip link moves focus there), and a footer. It holds no state and sends no Message. The header and the side column stay in view while the page scrolls; below `md` the side column sits at the start of the header's row. `Patterns.AppShell` is its contract. | `width`: `full` (default), `contained` (the main region's content kept to the theme's `width.page`). Slots `root`, `skip`, `header`, `brand`, `mark`, `title`, `status`, `actions`, `side`, `main`, `footer`. |
| `Accordion` | `{ id, items: { id, title, content, disabled? }[], open, onToggle, headingLevel? }`; `Accordion.toggled(open, id, { multiple?, collapsible? })` is the transition `update` applies, the open ids being the application's. Each trigger is a button in a heading naming its panel; a shut panel stays drawn and `inert`. A panel shuts over the time it opens in (default the theme's `moderate`), so switching sections moves both together; `--fk-collapse-duration` sets both and `--fk-collapse-close-duration` the shutting alone, each a time of the theme (`var(--fk-motion-slow)`) so the `motion` and `travel` knobs still apply. TreeView, Sidebar and ThinkingSteps groups share the two properties. The view takes an `icon` in place of the recipe's. An item may also carry `icon` (Html before its title) and `trailing` (after it: a badge, a role); its `title` stays text. `Bundles.Accordion.with({ open?, multiple?, collapsible? })` keeps the open ids and the two rules once, `Accordion.controls(model, onMessage)` is spread into the view, and `Accordion.configure({ base, presets })` fixes the look and heading level. | `variant`: `plain` (default), `bordered`, `separated`, `filled`, `ghost`; `separators`: `on`, `off`; `indicator`: `chevron`, `plus`; `indicatorPosition`: `end`, `start`; `active`: `none`, `trigger`, `item`. Slots `root`, `item`, `heading`, `trigger`, `leading`, `label`, `trailing`, `chevron`, `icon`, `panel`, `body`, `content`. |
| `Disclosure` | `Disclosure.view({ id, isOpen, onToggle, label, content, icon?, peek?, disabled? }, h)` draws the button, its icon and label, and the panel; `@foldkit/ui`'s disclosure keeps no state, so `Bundles.Disclosure.with({ isOpen? })` holds the flag and `Disclosure.controls(model, onMessage)` is spread into the view. `peek` keeps a height of the shut panel as an inert preview. `Disclosure.configure({ base, presets })` binds the look. `toView` is the adapter for a layout of your own. Draw the panel only while open, or through upstream's `animatePanel`, which keeps a shut panel inert and moves its height itself by an inline transition that the recipe overrides with an important rule, so the `motion` knob scales it and reduced motion snaps it. | `variant`: `plain` (default), `bordered`, `ghost`; `indicator`: `chevron` (default), `none`. Slots `root`, `button`, `icon`, `label`, `panel`. |
| `TreeView` | The APG's and Zag's tree view. A small Model: `TreeView.init({ id, open?, checked? })`, folded with `TreeView.update(nodes, { checkable? })` (curried over the tree, flattened once). `TreeView.view({ label, model, nodes, onMessage, direction?, checkable?, style?, mixins? }, h)` over nodes `{ id, label, children?, disabled?, icon?, openIcon? }`. See [TreeView](#treeview). | `guides`: `none` (default), `lines`; `data-state` on a branch `item` and its `group`. Each item carries `--fk-tree-level`. Slots `root`, `item`, `row`, `chevron`, `checkbox`, `icon`, `label`, `group`. |

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

A disclosure with its recipe: the recipe draws the button and the panel's box, and
`animatePanel` keeps the shut panel inert and moves its height.

<!-- docs-check
declare const ToggledDetails: (payload: { readonly isOpen: boolean }) => Message
-->

```ts
import { Disclosure as UiDisclosure } from '@foldkit/ui'
import { Style } from 'foldkit-mixins'
import { Disclosure, DisclosureSlots, Recipes } from 'foldkit-mixins-ui'

const DetailsStyle = Style.forSlots(DisclosureSlots)(Recipes.Disclosure({ variant: 'bordered' }))

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

Stateless views: they draw what the application passes and keep nothing. Hide text
with `U.srOnly` from `foldkit-mixins/utilities`.

| Widget | What it is | Recipe and Slots |
| --- | --- | --- |
| `Table` | The presentational table. `Table.view({ columns: { header, value, numeric?, sortKey?, rowHeader? }[], rows, rowKey?, caption?, fluid?, sort?, selection?, expansion?, empty? }, h)`. A column's `value` returns text or markup. Sorting, selection and expansion are the application's. See [Table](#table). | `rows`: `lined`, `striped`, `plain`; `density`: `compact`, `regular`, `comfortable`; `header`: `static`, `sticky`. Slots `frame`, `highlight`, `root`, `caption`, `head`, `headerRow`, `headerCell`, `sortButton`, `sortIcon`, `body`, `row`, `cell`, `control`, `controlCell`, `checkboxLabel`, `expandButton`, `expandIcon`, `detailRow`, `detailCell`, `emptyRow`, `emptyCell`. |
| `Card` | `{ title?, description?, content?, image?, media?, action?, footer?, press?, label?, selected?, disabled?, dismiss?, headingLevel?, recoveryPart?, words? }`. `press` is `Press`: `{ onClick }` or `{ href, external? }`, the one type Item shares. `words`: `dismiss` (`'Dismiss {name}'`, `{name}` the title or label), `dismissAlone`, `dismissMark` and `newTab`. `Card.configure({ base, presets })` returns `{ view, group }`. See [Card and Item](#card-and-item). | `orientation`: `stacked`, `inline`, `overlay` (the image fills the card, the text lies over it on a fade to the card's surface); `surface`: `outlined`, `elevated`, `filled`, `plain`; `padding`: `compact`, `comfortable`, `roomy`, `flush`; `elevation`: `0` to `3`; `divide`: `none`, `header`, `sections` (a hairline edge to edge); `lift`: `none`, `hover`, `zoom` (the picture grows inside its frame). Slots `root`, `image`, `media`, `header`, `title`, `description`, `action`, `content`, `footer`, `overlay`, `dismiss`. |
| `Card.group` | `{ cards: (CardView & { key })[], columns?, fluid?, label?, wrap?, cardStyle? }`: a keyed list of cards in up to `columns` (default 1), wrapping to fewer where a column would be narrower than the recipe's `minColumn`. Given `fluid: Card.fluid` (from `card/fluid.ts`, so a page that never names it ships no `FluidHover`), one highlight follows the pointer and a press in a gap presses the highlighted card; without it the group draws no highlight and each card hovers on its own. `wrap(card, source)` draws around each card, such as a link. | `Recipes.CardGroup`: `layout`: `divided` (default), `separated`; `minColumn`: `none`, `sm`, `md` (default), `lg`; `border`: `none`, `outlined`. The highlight is a film over the card the pointer is on, and is that card's hover. Slots `root`, `list`, `item`, `highlight`. |
| `Item` | The row primitive: `{ header?, media?, title?, description?, content?, actions?, footer?, press?, label?, selected?, disabled?, words? }`; `content` follows the title and description, and `header` and `footer` are bands across the row, pressable above a pressable one. `words.newTab` says what a link opening a new tab says. `Item.group({ items: (ItemView & { key })[], label?, wrap?, style?, itemStyle? })` is a list of them; `wrap(row, source)` draws around each row. `Item.configure({ base, presets })` returns `{ view, group }`. Field is for form controls. | `variant`: `plain`, `outline`, `muted`; `density`: `comfortable`, `compact`, `roomy`; `media`: `plain`, `icon`, `image`. Slots `root`, `header`, `media`, `content`, `title`, `description`, `actions`, `footer`, `overlay`. `Recipes.ItemGroup({ layout: 'divided' \| 'separated' })` over `ItemGroupSlots` (`root`, `row`). |
| `Avatar` | `{ name, src?, picture?, initials?, status?, badges?, words? }`. The root is one `role="img"` named by the person (and the status, "Ada Lovelace, Online"); initials show until the picture covers them. `status` is `online`, `away`, `busy`, `offline`, read from `words`. `src` is a URL; `picture` is a value, `Avatar.picture({ asset, provider, width })` from `foldkit-media` (a file of its own, so a page that passes `src` as text ships no media code), drawn with its 1x and 2x candidates at `width` CSS pixels; a provider with no URL for it leaves the initials. Give one of the two. `Avatar.widthOf(size)` is a size's width in CSS pixels. `Avatar.group({ people, max?, label?, words?, rest?, wrap?, style?, avatarStyle? })` overlaps them and counts the rest as one more avatar (`words.more`, `'{count} more'`); `rest(count)` is what the `+N` disc holds in place of its text, an icon say; `wrap(avatar, person)` draws around each avatar, such as a Tooltip's trigger. `badges: [{ content, place, label? }]` puts a mark on a corner (`top-start`, `top-end`, `bottom-start`, `bottom-end`; the bottom end is the status dot's), hidden from assistive technology, its `label` read with the name. `Avatar.configure({ base, presets })` returns `{ view, group }`. | `size`: `xs` to `xl`; `shape`: `circle`, `rounded`, `square`; `color`: `neutral`, `name` (initials in a hue from the name); `ring`: `none`, `page`, `accent`. Slots `root`, `fallback`, `image`, `status`, `badge`. `Recipes.AvatarGroup({ overlap: 'tight' \| 'loose' \| 'none', lift: 'none' \| 'hover' })` over `AvatarGroupSlots` (`root`); `lift: 'hover'` raises the avatar under the pointer, which `travel` stills. |
| `Badge` | `{ text, tone?, icon?, onDismiss?, href?, external?, words? }` writes `data-tone`; `onDismiss` draws a dismiss button, `href` draws a link (never both). | `Recipes.Badge({ appearance?, size? })`: `appearance` `tinted` (default), `dot`, `outline`, `solid`; `size` `sm`, `md`, `lg`. The tone is the word the badge carries (`accent`, `neutral`, `info`, `success`, `warning`, `danger`); `Recipes.badgeTones(attribute, map)` through `extend` maps an attribute of your own. Slots `badge`, `icon`, `dismiss`. |
| `Typography` | `{ level, text }` or `{ level, content }`, where `content` is a list of text and `Html` (a link, emphasis) in place of `text`. The level chooses the element (`h1`–`h4`, `lead`, `body`, `small`, `muted`, `quote`, `code`, and the interface roles `display`, `title`, `subtitle`, `caption`, `micro` as paragraphs) and is written as `data-level`. | No `level` axis: the recipe reads `data-level`, so the view's level is the one fact; a role is its size and leading on the size ladder. Slot `text`. |
| `Separator` | `{ orientation?, label?, decorative? }`, horizontal by default. A `label` sits between two drawn rules and is read as text; `decorative` is `role="none"`. One style draws both orientations. A vertical rule stretches across a flex or grid row, short of it by the inset, and elsewhere (running text) stands as tall as the letters. | `line`: `solid`, `dashed`, `dotted`; `thickness`: `thin`, `thick`; `spacing`: `none`, `sm`, `md`, `lg`; `inset`: `none`, `sm`, `md`. Slots `rule`, `root`, `label`. |
| `Empty` | `{ title, description?, icon?, action? }`. The title takes the `subtitle` role; the icon is `aria-hidden`. `Empty.configure({ base, presets })` binds a look once. | `media`: `icon`, `illustration`; `frame`: `none`, `dashed`, `filled`; `tone`: `neutral`, `danger`; `size`: `compact`, `comfortable`. Slots `root`, `icon`, `title`, `description`, `action`. |
| `Skeleton` | `{ label?, inline?, block? }`: `role="status"` named by `label`, and `aria-hidden` without one, so a page of placeholders is not a page of empty live regions. `inline` and `block` are CSS lengths of a lone bar (`--fk-skeleton-inline`, `--fk-skeleton-block`). `Skeleton.lines({ lines, label? })`, `avatarRow`, `card` and `tableRow({ columns })` draw the shapes content takes, in a `group`. `Skeleton.configure({ base, presets })` returns all five with one look. | `shape`: `bar`, `circle`; `animation`: `pulse`, `shimmer`, `none`. Slots `bar`, `group`. |
| `Carousel` | The APG carousel. A small Model: `Carousel.init({ id, index?, autoplay?, delay?, reducedMotion? })`, folded with `Carousel.update({ count, perView?, loop? })`. `Carousel.view({ label, model, slides, onMessage, loop?, perView?, picker?, thumbnails?, slideLabel?, previousLabel?, nextLabel?, pickerLabel?, rotationLabels? }, h)`. See [Carousel](#carousel). | `peek`: `none`, `edge`. Slots `root`, `track`, `slide`, `controls`, `rotation`, `previous`, `next`, `picker`, `dot`, `thumbnail`, `status`. |
| `Marquee` | After Zag's: content that scrolls on without a seam. A small Model: `Marquee.init({ id })` holds what it measured and whether it is paused, folded with `Marquee.update`. `Marquee.view({ model, onMessage, label, items, side?, speed?, autoFill?, repeat?, delay?, loopCount? }, h)` measures its content (`Resize`) and draws copies to fill the viewport, `inert` after the first and drawn without their `id`s, so a document holds each once. A pointer, focus or its pause press (WCAG 2.2.2) holds it; `Marquee.Message.Paused()` holds it from outside. Its motion is CSS, and under reduced motion the viewport scrolls instead. | `spacing`; `edges`: `fade`, `none`. Slots `root`, `viewport`, `content`, `item`, `pause`. |

### Images, icons and codes

| Widget | What it is | Recipe and Slots |
| --- | --- | --- |
| `Image` | `{ asset, provider, layout, alt, priority?, sizes? }` from `foldkit-media`. `Image.watchLoad` and `Image.audit` are mixins in files of their own (`image/watchLoad.ts`, `image/audit.ts`), so a page that names neither ships neither. `Image.configure({ base, presets })` binds a layout and a look; a use with no layout from any layer throws. See [Image](#image). | `fit`: `cover`, `contain`; `edge`: `none`, `line`; `ratio`: `auto`, `square`, `video`, `portrait`; `radius`. Slots `frame`, `source`, `image`. |
| `Figure` | `{ content, caption? }`: a `figure` holding its content (an `Image.view`, a chart, a code block), then its caption in a `figcaption`, which names the figure for assistive technology by itself; no caption, no `figcaption`. `Figure.configure({ base, presets })` binds a look once. | `align`: `start`, `center`; `caption`: `after` (default), `before` (the caption is drawn above by CSS `order`; the markup keeps it after the content, so a screen reader reads it there). Slots `root`, `caption`. |
| `Frame` | `{ title?, headingLevel?, description?, action?, panels, footer? }`: a tray holding several things that belong together, each in a panel of its own (a few Alerts, a list of Items, an accordion's items); the frame places what it is given and understands none of it. `Frame.configure({ base, presets })` binds a look once. Reach for `Card` when there is one thing to hold. | `variant`: `muted` (default, a quiet step off the page), `outline`, `plain`; `padding`: `comfortable` (default), `none` where the panel's content draws its own room; `spacing`: `compact`, `comfortable`, `roomy`; `radius`: `md`, `lg`, `none`. Slots `root`, `header`, `title`, `description`, `action`, `panels`, `panel`, `footer`. |
| `AspectRatio` | `{ content? }`. `AspectRatio.configure({ base, presets })` binds a look (a ratio) once. | `ratio`: `square` (default), `video` (16/9), `portrait` (3/4); another ratio is `Recipes.AspectRatio.add({ ratio: { cinema: { frame: Style.self({ aspectRatio: '21 / 9' }) } } })`. The corner reads `radius`. Slot `frame`. |
| `Icon` | `{ icon, label?, key?, mark?, style?, mixins? }` or `{ glyph, label?, mark? }`: an `IconData` drawn as inline SVG with `foldkit-media`'s `Icon.draw`, or a drawing of your own (initials, a count, an emoji) in the box; one or the other. A `label` makes it `role="img"`; without one the glyph is `aria-hidden`. `key` parts two copies of one icon on a page. `mark` is a Badge or a dot on the corner, inside the image. | `size`: `xs`, `sm`, `md`, `lg`, `xl` on the type scale; none (the default) stands on the size ladder. `surface`: `outline`, `soft`, `solid`, `raised` makes the box a tile twice the icon's size; `tone`: `accent`, `neutral`, `info`, `success`, `warning`, `danger`; `shape`: `circle`, `square`. Slots `glyph`, `mark`. |
| `CodeBlock` | `{ code, tokens?, language?, title?, lineNumbers?, copy? }`. `tokens` are `{ from, to, kind }`, as `foldkit-richtext-code` and `foldkit-richtext-code-shiki` tokenizers return them; each is drawn with `data-kind`, and a token out of order or outside the code throws. The block's text is the code exactly. `copy: { onCopy?, copied? }`: `onCopy` gets the code, so run `copyText` from `foldkit-primitives`; without it the button has no handler, for a page whose script copies. `CodeBlock.linesOf` is the cut; a final line break is not a numbered line, and a copy is announced in the `status` slot. | No axis. Colors each kind from the theme's `syntax` group; `data-line-numbers` numbers lines, `data-copied` marks a copy done. Slots `root`, `header`, `title`, `copy`, `status`, `body`, `code`, `line`, `token`. |
| `QrCode` | After Zag's: `QrCode.view({ id, value, label?, level?, quietZone?, overlay?, tooLong?, style? }, h)`, one `img` named `QR code: <value>` (or `label`), every dark module one SVG `path` over a background that carries the quiet zone. `level` is the error correction, `M` by default and `H` under an `overlay` (a logo at the centre). `QrCode.encode(text, level)` gives the matrix, none when no version holds the text, and `pathOf` its path; both are pure. `QrCode.Download({ id, format, filename, pixels })` saves the drawn code as PNG or SVG in the colors it shows; the overlay is not in the file. | `scheme`: `light` (dark on light on any page), `page`; `size`. Slots `root`, `frame`, `background`, `pattern`, `overlay`, `fallback`. |
| `Chart` | After shadcn's Chart. A small Model for the lit point: `Chart.init()`, folded with `Chart.update`. `Chart.view({ id, label, kind: 'bar' \| 'line' \| 'area', categories, series: [{ name, values, color? }], model, onMessage, description?, format?, legend?, table?, categoryLabel? }, h)`, or `kind: 'donut'` with `slices: [{ name, value, color? }]` and `totalLabel?`. See [Chart](#chart). | `height`: `sm`, `md`, `lg`; `grid`: `lines`, `zero`; `indicator`: `dot`, `line`. Slots `root`, `title`, `description`, `legend`, `legendItem`, `swatch`, `body`, `yAxis`, `xAxis`, `yTick`, `xTick`, `plot`, `canvas`, `paths`, `grid`, `cursor`, `bar`, `line`, `area`, `dot`, `slice`, `band`, `center`, `centerValue`, `centerLabel`, `tooltip` and its parts, `status`, `table` and its parts. |
| `ImageCropper` | After Zag's: the image fitted in a viewport, a selection that a drag moves and eight handles resize, zoom by a Slider, the wheel, two fingers or `+`/`-`, a pan of the zoomed image, quarter turns, an aspect lock and a round crop. A small Model: `ImageCropper.init({ id, aspect?, shape?, crop?, min?, maxZoom? })` holds the crop, in the turned image's pixels, folded with `ImageCropper.update`. `ImageCropper.view({ model, onMessage, label, src, crossOrigin?, controls?, labels?, disabled?, slider? }, h)`. `ImageCropper.crop(model)` is the crop in whole pixels (an `Option`); `RequestedExport({ type, quality })` returns the `Export` Command, answered by `Exported({ url, width, height })` or `FailedExport`. Keys (arrows, Shift ×10, Alt to resize) step by screen pixels. | `guides`; `handles`: `all`, `corners`; `viewport`: `landscape`, `wide`, `square`. Its zoom takes `Recipes.Slider({ label: 'hidden' })`. Slots `root`, `label`, `viewport`, `stage`, `pan`, `image`, `selection`, `guides`, `handle`, `controls`, `zoom`, `rotate`, `reset`. |
| `SignaturePad` | After Zag's: strokes drawn by one pointer over a dashed line and "Sign here", undo, clear, and a typed name instead. A small Model: `SignaturePad.init({ id, pen? })` holds the strokes (points with pressure, in the pad's coordinates), folded with `SignaturePad.update`. `SignaturePad.view({ model, onMessage, label, fallback?, labels?, disabled? }, h)`. `pathOf(stroke, pen)` and `toSvg(model, { color?, font? })` are pure; `RequestedPng({ scale, background })` returns `ExportPng`, answered by `ExportedPng({ url, width, height })` or `FailedExport`. | `surface`: `plain`, `muted`, `dashed`; `size`. Slots `root`, `label`, `control`, `segments`, `stroke`, `guide`, `placeholder`, `typedName`, `controls`, `undo`, `clear`, `fallback`, `fallbackLabel`, `input`. |

```ts
import { parse } from 'foldkit-media/icons'
import { Style } from 'foldkit-mixins'
import { AspectRatio, AspectRatioSlots, Icon, IconSlots, Recipes } from 'foldkit-mixins-ui'

const Frame = Style.forSlots(AspectRatioSlots)(Recipes.AspectRatio({ ratio: 'video' }))
const Mark = Style.forSlots(IconSlots)(Recipes.Icon({ size: 'sm' }))

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
`headerLabel` renames it); `empty` stands across the table while there are no rows
(an `Empty.view`). The sort, the chosen and the open rows are the application's. The
table stands in a `frame`, which scrolls sideways when the table is wider than the
screen (under a `static` header; a `sticky` one sticks to the application's scroller,
which scrolls it). With `fluid`, one highlight behind the body rows follows the
pointer, skipping detail and empty rows. Filtering, column reorder and resize, and
virtualized rows stay with `foldkit-data-grid`.

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

const ProductsStyle = Style.forSlots(TableSlots)(Recipes.Table({}))

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
the `color` they name; a sixth series throws.

## Feedback and status

| Widget | What it is | Recipe and Slots |
| --- | --- | --- |
| `Alert` | `{ layout, title, description?, icon?, actions?, onDismiss?, words?, recoveryPart? }`, and by `layout`: `'inline'` takes `assertive?` and is a live region inside the content, of something that just happened (`role="alert"` when assertive, `role="status"` otherwise); `'banner'` takes `label` and is a full-width strip across a page or a section, there on load, so a `section` landmark named by `label` rather than a live region, which would say nothing on load. Each action is `{ label, href }` (a link) or `{ label, onClick }` (a button); `onDismiss` draws a close button named by `words.dismiss` (`'Dismiss {name}'`, `{name}` the title inline and the label as a banner) with the mark `words.dismissMark`. The icon is `aria-hidden`; whether it shows is the application's. The root writes `data-layout` and `data-dismissible`. `recoveryPart`: see [Focus after removal](#focus-after-removal). `Alert.configure({ base, presets })` binds a look and words. | `tone`: `info` (default), `success`, `warning`, `danger`, `neutral`, `accent`; `emphasis`: `subtle` (default, the family's tint), `bold` (its fill; the neutral tone inverts the page). Slots `root`, `icon`, `title`, `description`, `actions`, `action`, `dismiss`. |
| `Toast` | A stack of toasts, Sonner's. A small Model: `Toast.init(id, { position?, direction?, duration?, max?, threshold? })`, folded with `Toast.update`, whose `Acted` OutMessage names a pressed action. `Toast.show(model, { type?, title, description?, actions?, cancel?, duration? })` returns the stack and the new toast's `id`; `Toast.settle(model, id, input)` turns a toast into its outcome; `Toast.dismiss(model, id)` takes it away; `Toast.nextId(model)` is the id the next `show` will give. `Toast.view({ model, onMessage, label?, words?, expand?, icons? }, h)`, with `Toast.configure({ base, presets })` and `Bundles.Toast.with({ id, position?, direction?, duration?, max?, threshold? })`, whose `helpers` are `show`, `settle` and `dismiss`. Adapter over the `ToastView` fork for toasts that carry their own payload. See [Toast](#toast). | `tone`: `plain` (default), `invert` (the text's ink as the card), `rich` (each type on its tint). Slots `container`, `entry`, `list`, `icon`, `body`, `title`, `description`, `actions`, `action`, `cancel`, `close`, `status`, `alert`. |
| `Progress` | `@foldkit/ui`'s Progress. `Progress.view({ id, label, value, min?, max?, valueText?, showValue?, buffer?, segments? }, h)` draws a `progressbar` named by its label. `value` is an `Option`; none is indeterminate, and the bar's fill sweeps toward the inline end, leftward right to left. The root carries the share done as `--fk-progress`. `showValue` draws the value (`valueText`, else a percentage) at the end of a bar's label line and inside a ring. A `value` given as `ProgressSection`s is one stacked bar of toned parts, read aloud as their sum; `buffer` draws how far the work could go behind the fill; `segments` cuts the track into steps. | `shape`: `bar` (default), `ring`; `tone`: `accent`, `neutral`, `success`, `warning`, `error`, `info`; `stripes`: `none`, `still`, `moving` (travel-aware); `size`. Slots `root`, `label`, `track`, `indicator`. |
| `Meter` | `@foldkit/ui`'s Meter, a measurement where `Progress` is work. `Meter.view({ id, label, value, min?, max?, low?, high?, optimum?, valueText? }, h)` draws a `meter` named by its label. The root says how good the value is as `data-level` (`good`, `fair`, `poor`), as the HTML meter judges it; `Meter.levelOf` is that judgment. | No axis; the fill takes success, warning or error by level. Slots `root`, `label`, `track`, `fill`. |
| `Spinner` | `{ label?, showLabel? }`. `role="status"` named by `label`, and `aria-hidden` without one; `showLabel` draws the label beside the wheel. A turn is about 720ms times `travel`. | `kind`: `ring` (default), `dots`, `bars`, `pulse`, `orbit`; `size`; `tone`: `accent`, `neutral`, `current`, and the status tones `info`, `success`, `warning`, `danger`. Slots `wheel`, `part`, `root`, `text`. |
| `Timer` | After Zag's: a countdown (`Timer.init({ id, countdown: true, duration })`) or a stopwatch (`Timer.init({ id, interval? })`), folded with `Timer.update`, whose Commands (`Timer.Stamp`, `Timer.Tick`) read Effect's `Clock`, so TestClock drives a run. `Timer.view({ model, onMessage, label, units?, separator?, controls?, words? }, h)`: a `role="timer"` with each unit in a Slot, one press that says what comes next, and reset; `words` renames the presses (`Timer.words` are the defaults). `Bundles.Timer.with({ id, countdown?, duration?, interval? })` places the state (a countdown without a `duration` throws at placement), and `Timer.configure({ base, presets })` fixes the look, units and words once. `Timer.phase(model)` is `idle`, `running`, `paused` or `done`; to start at once, return `Timer.update(model, Timer.Message.Pressed({ action: 'start' }))` from `init`. | `tone`, `look`, `progress`, `size`. Slots `root`, `label`, `area`, `item`, `separator`, `controls`, `action`. |

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

| Widget | What it is | Recipe and Slots |
| --- | --- | --- |
| `ScrollArea` | `{ content }`. The height that makes it scroll is the caller's mixin, on `viewport` or `root`; a width goes on `root`, which the viewport fills and the bars lie over. The viewport is tabbable; a `label` makes it a `region` landmark of that name. A bar per axis is drawn beside the viewport, and `ScrollArea.overlayBars` lays them over its edge (see [Overlay scroll bars](#overlay-scroll-bars)). | `orientation`: `vertical` (default), `horizontal`, `both`; `vertical` and `horizontal` fade the content toward an edge with more past it and draw a hairline there. Slots `root`, `viewport`, `bar`, `thumb`. |
| `Resizable` | shadcn's Resizable and the APG's window splitter. A small Model: `Resizable.init(share)`, its `Message`, and `update(model, message, bounds)`. `Resizable.view({ model, onMessage, id?, label, first, second, orientation?, direction?, min?, max?, step?, collapsible?, collapsedTo? })`. See [Resizable](#resizable). | `handle`: `line` (default), `grip`; `data-orientation` lays it out. Slots `root`, `first`, `handle`, `second`. |
| `VirtualList` | `@foldkit/ui`'s virtual list. `VirtualList.view({ model, items, itemToKey, itemToView, onMessage, overscan?, itemToRowHeightPx? \| dynamicRowHeights? }, h)` draws only the rows in view. Its Model is upstream's (`@foldkit/ui/virtualList`'s `init`), kept by the application and folded with that module's `update`. A row's mixins may style it, not handle its events, since it is drawn inside the list's submodel. A bar is drawn beside the list, and `VirtualList.overlayBars` lays it over the list's edge. It keeps no row drawn once it leaves the window, the one holding focus included, which `WindowList` does. | No axis. Slots `root` (the box it scrolls within: 18rem tall by default and as wide as its container, offering 20rem where the container takes its width from it), `row`, `bar`, `thumb`. |
| `WindowList` | A virtual list that scrolls with the window. A small Model: `WindowList.init({ id, estimatedHeight, unmeasured?, overscan?, viewportHeight?, from? })`, folded with `WindowList.update`, which returns an `Update.Return` (the model and, for a `Found` match, the `Reveal` Command), so the application's own `update` returns the commands too. `WindowList.view({ model, items, itemToKey, itemToView, onMessage, label?, findable? }, h)`. See [WindowList](#windowlist). | `Recipes.WindowList`: no look, only the spacers hidden where no script runs (`Utilities.scriptedOnly`); `.extend` it with the list's look. Slots `root` (`role="list"`), `spacer` (`data-edge` `start` or `end`, hidden from assistive technology), `row` (`role="listitem"`). |

### Resizable

The handle is a `separator` with its value, stepped by the arrows and sent to the
bounds by Home and End (a `collapsible` panel collapses when the key reaches its
side, as the APG asks, and a collapsed one leaves the key alone); with an `id` the
handle's `aria-controls` names the first panel; a drag follows the `Move` Mount from
where it began over the group the `Resize` Mount measured. Under `direction: 'rtl'`
the first panel is on the right, so ArrowLeft and a drag to the left grow it.
`collapsible: 'first' | 'second'` (with `collapsedTo`) collapses that panel on Enter or
a double-click and puts it back where it was, easing there while a drag follows the
pointer at once; pass the same bounds to `update` and the view. A split fills its
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

| Widget | What it is | Recipe and Slots |
| --- | --- | --- |
| `ChatMessage` | One message of a chat. `ChatMessage.view({ from, content, author?, avatar?, time?, status?, onRetry?, actions?, pinActions?, streaming? }, h)`, `from` being `user`, `assistant` or `system`. The user's sits at the end in a bubble, an answer as text at the start. `status` is `sending`, `sent` or `failed`, which draws a retry; `actions` are named buttons (`{ key, label, onClick, icon?, pressed?, disabled? }`) shown on hover and focus unless pinned. A streamed answer is the same message drawn again with more `content` and `streaming: true` (`aria-busy`); its body wraps with `text-wrap: wrap`, so no earlier word moves line. `ChatMessage.group({ items, continues?, style?, messageStyle? }, h)` draws a run, a sender's following messages continued. Markdown is the application's to render (`foldkit-richtext-markdown`'s `parse`, `foldkit-richtext-dom/view`'s `renderDocument`). | `layout`: `chat`, `thread`; `bubble`: `muted`, `accent`; `content`: `text`, `markdown`. `Recipes.ChatMessageGroup` for the group. Slots `root`, `avatar`, `main`, `header`, `author`, `time`, `bubble`, `body`, `footer`, `status`, `retry`, `actions`, `action`. |
| `MessageScroller` | A conversation's log that follows the newest message while the reader is at the end. A small Model: `MessageScroller.init({ id })` holds only whether it follows and how many arrived unseen; the scroll position is the browser's, read by its `FollowEnd` Mount. Fold `MessageScroller.update`, and send `Message.Appended({ count })` when your update appends messages (not when it loads older ones, which it holds in place). `MessageScroller.view({ model, label, content, onMessage, jumpLabel?, unseenLabel?, areaStyle?, areaMixins? }, h)` draws a named `role="log"` in a ScrollArea, with a jump button counting what arrived while away; give its parent a height. | No axis. Slots `root`, `log`, `jump`, `count`. |
| `ThinkingIndicator` | An assistant at work: `ThinkingIndicator.view({ label?, detail?, active?, icon? }, h)` draws dots, a pulse or the view's icon beside words a band of light sweeps, and a detail line, in a polite status. Keep it drawn with `active: false` before work starts, so what it says when it starts is announced. Every movement holds under reduced motion. | `mark`: `dots`, `pulse`, `none`; `label`: `shimmer`, `plain`, `hidden`; `tone`: `muted`, `accent`. Slots `root`, `mark`, `dot`, `icon`, `label`, `detail`. |
| `ThinkingSteps` | The trace of what an assistant did. `ThinkingSteps.view({ id, steps, open, onToggle, duration?, summary?, openSteps?, onToggleStep?, stateWords? }, h)`. Each step is `{ id, title, state, duration?, detail?, icon?, steps? }`, `state` being `pending`, `running`, `done` or `failed`, said in words too. The button says the running step's title, or "Thought for 4s". Its openness is an `Option<boolean>`: none opens it while a step runs and shuts it once all are done, and the press sends the state the reader asked for. `openSteps` and `onToggleStep` make each step's detail collapsible (`Accordion.toggled`). | `variant`: `plain`, `card`; `connector`: `line`, `none`. Slots `root`, `trigger`, `summary`, `chevron`, `panel`, `list`, `step`, `head`, `marker`, `title`, `state`, `duration`, `body`, `detail`. |
| `Questionnaire` | An assistant's questions answered in the chat. A small Model: `Questionnaire.init({ id, questions, layout? })` with `Questionnaire.single`, `multiple` and `text` questions (`Question` is a Schema, so a tool's input decodes into it), folded with `Questionnaire.update`, which says what is missing and focuses it, and returns `OutMessage.Answered({ answers })` once every required question is answered; the form then gives way to a summary. `Questionnaire.view({ model, onMessage, title?, radioGroup?, checkboxGroup?, input?, textarea?, button?, submitButton? }, h)`: the controls are the package's RadioGroup, CheckboxGroup, Input and Textarea, each taking its own style. | `variant`: `plain`, `card`; `actions`: `end`, `start`. Slots `root`, `title`, `progress`, `question`, `prompt`, `words`, `field`, `other`, `otherLabel`, `error`, `actions`, `summary`, `asked`, `answer`. |

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

| Widget | Keys the application's routes sit beside | The route's `input` |
| --- | --- | --- |
| `Command` | The field's: arrows, PageUp/PageDown, Enter; Home and End are the caret's. | `CommandKeyInput`: the query, the highlighted row and the rows the keys step through (`CommandRoute`). |
| `SearchField` | Escape, which acts only on a field with text. | The field's text. |
| `Menubar` | The arrows, Home and End. | Not read. |
| `CascadeSelect` | On the open panel: the arrows, Home, End, Enter, Escape and every printable character (Space included, which still chooses). The closed trigger's keys are not open to routes. | `undefined` |
| `Tour` | The arrows and, unless `closeOnEscape` is false, Escape. | `undefined` |
| `FloatingPanel` | Escape (unless `closeOnEscape` is false); the arrows on the drag trigger and the corner are the panel's own, and a press they handled still reaches the panel. | `undefined` |
| `Picker` | On a Sheet option: the arrows, Home and End (`item.index` is its place). The dropdown's keys are the Listbox's. | `undefined` |
| `Nav` | `routes`: the row's own keys on the top-level links and triggers; `panelRoutes`: a panel's links. | `routes`: the entry, `item.index` its place; `panelRoutes`: the link, `item.index` its place among the panel's links. |
| `Tabs` | `TabsContext.routes`: Delete, when tabs are closable. A tab with no key to answer draws no keydown at all. | The tab's `TabInfo`. |
| `TagsInput` | The input's: Enter, the delimiter and Backspace. | The tags Model. |
| `FileUpload` | The input's: Enter and Space (the dialog's, never routed) and Backspace and Delete (the last file). `FileUpload.conflict(routes)` names a clash. | The `FileUpload.Model`. |
| `Toolbar` | The arrows, Home and End. | `undefined` |

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
| `Menubar` | `{ direction? }`: the same keys clash either way, and `'rtl'` changes which own route the diagnostic names. |
| `Tour`, `FloatingPanel` | `{ closeOnEscape? }`: Escape is the widget's only while it is not `false`. |
| `Toolbar` | `{ orientation? }`, default `'horizontal'`: the arrows along it. |
| `Tabs` | `{ close? }`: Delete is the tabs' own key only when they are closable. |
| `TagsInput` | `{ delimiter?, direction? }`: the Model's delimiter, default `,`, and which arrow enters the chips. |
| `Nav` | `{ panelRoutes? }`: `routes` is checked against the row's keys, then `panelRoutes` against a panel's links'. |

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
import { SlotView } from 'foldkit-mixins'

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
| `Input`, `Textarea`, `PasswordInput` | The text. Input also takes the native `required`, `readOnly`, `autocomplete`, `inputMode` and `maxLength`; Textarea `required` and `autocomplete`; PasswordInput `required`. |
| `NumberField` | The text the field shows. |
| `OtpField` | The code. |
| `Slider`, `AngleSlider` | The slider's value (a range submits both, low first); the angle's hidden input. |
| `Rating` | The native radio's value (`name` defaults to `id`). |
| `CheckboxGroup` | One hidden input per checked value, in the options' order. |
| `Segmented` | One hidden input per chosen value, in the options' order. |
| `TagsInput` | One hidden input per tag, not the draft. |
| `CascadeSelect` | One hidden input per level of the chosen path, or one empty input. |
| `DatePicker` | One hidden input per chosen day; a range's start then its end. |
| `FileInput` | The files, through the native input that `FileInput.Sync` keeps equal to the list. |
| `FileUpload` | The local files, through the native input that `Sync` keeps equal to the list; stored files are not in it. |
| `Checkbox`, `Switch`, `RadioGroup`, `Listbox`, `Combobox` | Their `hiddenInput` Slots (`hiddenInputs` for the popups). |

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
pointer is near and back to the chosen one. A Mount does the measuring and moves it. It
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
ScrollArea.view(
  {
    content: h.p([], ['A long text']),
    style: Style.forSlots(ScrollAreaSlots)(Recipes.ScrollArea({})),
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
import { A11y } from 'foldkit-mixins'
import { Patterns } from 'foldkit-mixins-ui'

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
variants (an axis's values are listed in the catalog rows), hand the pieces to
`Style.forSlots`, and attach the result like any other Style:

```ts
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'

const DeleteStyle = Style.forSlots(ButtonSlots)(
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
colour. To look at every recipe in every variant and state at once, in both schemes, write the
specimen page: `pnpm --filter foldkit-mixins-ui specimen <out.html> [hue]`.

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
import { Style } from 'foldkit-mixins'
import { Button, ButtonSlots, Recipes } from 'foldkit-mixins-ui'

const Message = defineMessageUnion({ Saved: {}, Deleted: {} })
type Message = typeof Message.Type

// Styles are compiled once, in a module the build may ship as data.
const Quiet = Style.forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))
const Danger = Style.forSlots(ButtonSlots)(Recipes.Button({ tone: 'danger' }))

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
import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'

const Buttons = Recipes.Button.add({
  tone: { brand: { button: Style.self({ background: 'rebeccapurple', color: 'white' }) } },
})

export const Brand = Style.forSlots(ButtonSlots)(Buttons({ tone: 'brand', variant: 'solid' }))
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

## Limits and status

The API is still settling in the `0.x` series. This package should stay small:

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

## See also

- [Inside-out view composition](../../docs/mixins.md) — Slot / Style / Behavior mental model.
- [`foldkit-mixins`](../mixins) — resolver and extension contracts.
- [`foldkit-mixins-surface`](../mixins-surface) — derives a SlotView boundary from a Surface.
- [`examples/todo-app`](../../examples/todo-app) — Button and Checkbox adapted in a complete application.

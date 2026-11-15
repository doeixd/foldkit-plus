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

```text
@foldkit/ui          owns component state, accessibility behavior and base attributes
foldkit-mixins       owns Slot / Style / Behavior and the resolver that merges them safely
foldkit-primitives   owns the interaction primitives widgets compose (focus recovery,
                     roving tab stops, drags, scroll bars, clipboard)
foldkit-mixins-ui    names the bundles as Slots, draws the widgets that have no upstream,
                     and ships their recipes and accessibility patterns
the application      owns the values, and every transition of them
```

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

## The mental model

An `@foldkit/ui` component hands its caller attribute bundles (roles, `aria-*`,
`tabindex`, event handlers, `ChildAttribute`s). A raw array is not a public
customization contract: a caller can add a second `OnClick`, replace something
structural, or repeat merge code at every call site. `foldkit-mixins-ui` gives
each bundle a stable Slot name:

```text
@foldkit/ui component
        |
        | attribute bundles
        v
foldkit-mixins-ui Slots
        |
        | Style + Behavior
        v
foldkit-mixins resolver
        |
        v
component-owned attrs + safe additions
```

The component keeps control of the component, and callers get a typed place to
extend it. A view of this package's own draws its markup through the same Slots,
so one extension contract covers both families.

## Install

```bash
pnpm add foldkit-mixins foldkit-mixins-ui foldkit-primitives @foldkit/ui
```

`foldkit`, `effect`, `foldkit-mixins`, `foldkit-primitives` and `@foldkit/ui` are peer dependencies.

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

```text
attributes from @foldkit/ui
          +
Style / Behavior mixins
          |
          v
Button.toView(...)
          |
          v
draw(resolved slot arrays)
```

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

## Finding a widget

| I need... | Use |
| --- | --- |
| a button, toggle button or icon button; a row of them | [Button](#buttons-actions-and-commands), ButtonGroup, [Toolbar](#toolbar) |
| a command palette | Command in a Dialog |
| a text field, a textarea, a password, a search box | [Input, Textarea](#text-and-number-fields), PasswordInput, [SearchField](#searchfield) |
| a number, a one-time code, tags, a copyable value | NumberField, OtpField, TagsInput, InputCopy |
| a file picker, a drop zone | [FileInput](#fileinput), FileDrop |
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
| `Button` | Adapter over `@foldkit/ui`'s Button. `Button.view({ label, style, type?, disabled?, pressed?, icon?, shape?, onClick?, attributes?, mixins? }, h)`; `Button.toView` for your own `draw`. `disabled` writes `aria-disabled`, not `disabled`; `pressed` makes it a toggle (`aria-pressed`); an `icon` draws before the label, hidden from assistive technology. | `tone`: `accent` (default), `neutral`, `danger`; `variant`: `solid` (default), `outline`, `ghost`, `primary`, `icon`; `size`: `sm`, `md`, `lg`; `shape: 'square'`. Slots `button`, `icon`. |
| `ButtonGroup` | `{ label, items, orientation?, separated? }`. A `role="group"` that joins its items: borders overlap by one and only the outer corners stay round. An item is the caller's button, field or Menu (a wrapper passes the corners to the face it holds), or a string drawn in the `text` box (a count, a field's prefix). `orientation: 'vertical'` stacks them; `separated` draws a rule on every seam, for solid buttons whose fills meet. `Segmented` is the control that selects. | `size` (`sm`, `md`, `lg`, for every item with no size of its own); `width: 'fill'` spans the container, a field taking what the buttons leave. Slots `root`, `separator`, `text`. |
| `Toolbar` | The APG's toolbar: one tab stop over controls you draw, the arrows along its orientation, Home and End. See [Toolbar](#toolbar). `Toolbar.view({ id, label, items, roving, onFocus, orientation?, direction?, loop?, disabled?, routes? }, h)`. | `size` is Button's ladder step, set on the toolbar. Slots `root`, `group`, `separator`. |
| `Command` | shadcn's Command and Fluid's CommandMenu: a search field over a list of grouped, filterable rows. `{ id, label, placeholder?, groups, query, onQuery, active, onActive, onRun, empty?, loading?, page?, routes?, hints?, kbd? }`. See [Command](#command). | `frame`: `card` (default) or `bare`, for inside a dialog. Slots `root`, `search`, `crumbs`, `crumb`, `input`, `list`, `group`, `heading`, `item`, `icon`, `text`, `label`, `description`, `shortcut`, `chevron`, `status`, `empty`, `loading`, `frame`, `bar`, `thumb`, `footer`, `hint`. |
| `Kbd` | `{ key }` names a key; `Kbd.combo({ keys, joiner? }, h)` draws several in one `kbd`. | No axis. Slots `key`, `combo`, `joiner`. |

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

`roving` is the `{ current }` slice of a `RovingTabindex` (here kept by hand;
`examples/widgets` places the Bundle), and `onFocus(id)` is answered by setting
it. `control.attributes` goes on the one focusable element, and `control.disabled`
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
| `Input` | Adapter over `@foldkit/ui`'s Input. `Input.view({ id, value, onInput, type?, placeholder?, name?, readOnly?, required?, autocomplete?, inputMode?, maxLength?, disabled?, invalid?, attributes?, style, draw }, h)`; `Input.field` draws a whole field from a `FieldValidation.Field`. | `size`: `sm`, `md`, `lg`; `variant`: `outline` (default), `filled`. Slots `input`, `label`, `description`. |
| `Textarea` | `Textarea.view` takes the same and `rows`, `maxRows`, `maxLength`, `count`; `Textarea.field` is the whole field. | `size` and `variant` as Input's; `resize`: `auto` (default), `vertical`, `none`. Slots `textarea`, `label`, `description`, `count`, `frame`, `footer`, `meta`. |
| `PasswordInput` | `PasswordInput.view({ id, label, value, onInput, visible, onToggle, autocomplete?, toggleLabel?, description?, invalid?, disabled?, name?, required?, attributes? }, h)`: a password field whose toggle (`aria-pressed`, `aria-controls`, one fixed name) shows it as text. `autocomplete` is `current-password` (default) or `new-password`; spellcheck and autocorrect stay off. `strength` is a gauge the app draws (`Meter.view(…, h)`) under the field, so a page with none ships no Meter; `requirements` are `{ label, met }[]` (`PasswordRequirement`), each read as met or not (`requirementStates`); `capsLock: { on, onKey }` says Caps Lock is on, politely, `onKey` given `capsLockOf(key, modifiers)` for each key (an `Option`). The application owns the text, the flag and the Caps Lock reading. | `size` (`sm`, `md`, `lg`). Input's pieces in InputGroup's box; the eye is `Icons.glyph` by `aria-pressed`. Slots `root`, `label`, `group`, `input`, `toggle`, `description`, `strength`, `requirements`, `requirement`, `requirementState`, `capsLock`. |
| `SearchField` | A native `type="search"` input named by `label`, with a clear button only while there is text. `SearchField.view({ id, label, value, onInput, onClear, placeholder?, invalid?, disabled?, words?, routes?, style?, mixins? }, h)`. See [SearchField](#searchfield). | `size` and `variant` are Input's axes. A magnifier at the start, the clear button at the end (mirrored right to left), the browser's own cancel button hidden. Slots `root`, `input`, `clear`. |
| `NumberField` | The APG's editable spinbutton. `{ id, label, description?, value, onChange, min?, max?, step?, page?, locale?, name?, required?, disabled? }`, or `format` with `parse` in place of `locale`. `value` is an `Option<number>`: none is an empty field (no `aria-valuenow`, the steppers start from the bounds), and clearing the text sends `onChange(Option.none())`. `NumberField.parseNumber(text, locale?)` reads text as that locale writes a number; `NumberField.settled(value, bounds)` clamps onto the step. | No axis. Slots `root`, `label`, `group`, `input`, `decrement`, `increment`, `description`. |
| `OtpField` | shadcn's input-otp: one real input (`autocomplete="one-time-code"`, paste and Backspace the browser's) over cells that mirror it, the next marked `data-next`. `{ id?, name?, label, value, onChange, length?, pattern?, groups?, disabled?, readOnly?, invalid? }`; `OtpField.kept(text, length, pattern)` filters a code. | No axis. Slots `root`, `input`, `group`, `cell`, `separator`. |
| `TagsInput` | Zag's tags input. A small Model: `TagsInput.init({ id, tags?, delimiter?, max? })`, folded with `TagsInput.update` (which returns a focus Command). `TagsInput.view({ model, onMessage, label, placeholder?, name?, disabled?, direction?, addOnBlur?, routes?, words? }, h)`. See [TagsInput](#tagsinput). | No axis; `data-disabled` on `control`. Slots `root`, `label`, `control`, `list`, `tag`, `remove`, `input`, `message`, `hiddenInput`. |
| `InputCopy` | A read-only value with a copy button (Zag's clipboard). A small Model for the copied and failed marks. `InputCopy.view({ id, label, value, copied, failed?, onCopy, copyLabel?, copiedLabel?, failedLabel? }, h)`. | No axis. Slots `root`, `label`, `group`, `input`, `button`, `status`. |
| `Label` | `{ for, text }`; `for` is the control's id. | No axis. Slot `label`. |
| `Fieldset` | Adapter: a `fieldset`, its `legend` and a `description`. | `variant`: `plain` (default, no box), `bordered`, `filled`. The recipe floats the legend into the group, so a box drawn round it holds the legend; a boxed group pads its fields, and a control in it takes a corner concentric with the box's; a disabled fieldset dims its legend and description. Slots `fieldset`, `legend`, `description`. |
| `FileInput` | A file picker, not a drop zone: a native `type="file"` input and the button that labels it. The application owns the files. See [FileInput](#fileinput). | `size` is Button's ladder step. Slots `root`, `input`, `trigger`, `description`, `list`, `item`, `name`, `remove`. |
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
typing, and `onClear` is what the button and Escape send. Escape acts only on a
field with text, so on an empty one it still reaches an enclosing dialog.
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
      onClear: Search.Cleared(),
      routes: [openResults],
      style: Style.forSlots(SearchFieldSlots)(Recipes.SearchField({})),
    },
    h,
  )
```

The search `update` answers `Cleared` with `SearchField.Focus({ id: 'find' })`.

### TagsInput

The tags are a list of chips named by the label, each with a `Remove <tag>`
button (`words` words its name and its `×`), then a text input. Enter or the
delimiter (default `,`) adds the draft split at the delimiter and trimmed,
refusing empty and repeated parts and parts past `max`: a refusal
(`TagsInput.Refusal`: `Repeat`, `Empty`, `Full`) is said in a polite `message`
(worded by `refusalText`) and shakes the field once, the shake travel-aware.
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
`SearchField.Focus` does; both answer `FileInput.Message.CompletedSync` and
`CompletedFocus`. Each row has a `remove` button named `Remove {name}` (`words: {
remove? }`). `name`, `accept`, `multiple` and `required` are the native
attributes; `invalid` is `aria-invalid`, and `description` is read after the name.
A disabled field takes no pick and its rows no remove.

```ts
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { FileInput, FileInputSlots } from 'foldkit-mixins-ui'

const FilesModel = Schema.Struct({ files: Schema.Array(Schema.instanceOf(File)) })
const FilesMessage = defineMessageUnion({
  Picked: { files: Schema.Array(Schema.instanceOf(File)) },
  Removed: { file: Schema.instanceOf(File) },
  CompletedSync: {},
  CompletedFocus: {},
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
  `failed: model.failed`; the status region says `failedLabel` (default `Copy
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
| `Checkbox` | Adapter. The `checkbox` Slot declares `aria-invalid`: an invalid one carries `h.AriaInvalid(true)` beside the resolved bundle (the view takes no option for it), and the recipe draws the error edge on the box. | `tone`: `accent` (default), `neutral` (checked in the page's ink); `size`. Slots `checkbox`, `label`, `description`, `hiddenInput`. |
| `CheckboxGroup` | `{ id, legend, options: { value, label, description?, disabled? }[], checked, onToggle, error?, name?, selectAll? }`. A `fieldset` named by its `legend`, each option the APG's checkbox named by a `label` for it, so a press on the words toggles it. `toggled(checked, value)` is one option's transition; `coverage(options, checked)` is `none`, `some` or `all` (a disabled option counts for neither); `setEnabled(options, checked, on)` is every enabled option or none, a disabled one keeping the state `checked` gives it. `selectAll: { label, onSet }` draws a first row checked, `mixed` or unchecked by `coverage` that controls every option; a press sends `onSet` with `setEnabled`'s values, on unless all already are. `error` is shown under the options: the `fieldset` is described by it and each checkbox is `aria-invalid`. | `variant`: `plain` (default), `list` (checked rows fill, and merge where they stand together); `orientation`: `vertical` (default), `horizontal` (a wrapping row). The checkbox sits on the label's row, so a description does not pull it down. Slots `root`, `legend`, `options`, `option`, `checkbox`, `label`, `description`, `error`. |
| `Switch` | Adapter. `Switch.draggable(onToggle)` beside the style lets the thumb be dragged. The `button` Slot declares `aria-invalid` as the Checkbox's does, and an invalid switch's track is ringed. | `tone`, `size` as Checkbox. Slots `button`, `label`, `description`, `hiddenInput`. |
| `RadioGroup` | Adapter. Upstream's `option` is a `button` and its `label` bundle only an id, so draw each row as a `label` element around its `option`, carrying the option's `card` bundle (`h.label(option.card, [h.button(option.option, []), …])`); the browser then sends a press on the words to the radio. `card` is `data-checked` while its option is. The `group` Slot declares `aria-invalid` (the group is what is invalid, not one radio): an invalid one carries `h.AriaInvalid(true)` beside the resolved bundle, and the recipe reddens the radios' edges. `RadioGroup.readingKeys` reads both arrow pairs whichever way the group stands (see [Right to left](#right-to-left)). | `variant`: `plain` (default), `card` (frames each card, filling the checked one); `tone`: `accent` (default), `neutral`; `size`. The recipe stacks the group unless `aria-orientation` is `horizontal`, and a row wraps. Slots `group`, `option`, `label`, `description`, `hiddenInput`, `card`. |
| `Segmented` | A tray of buttons where pressing selects. `Segmented.view({ id, label, options: { value, label, icon?, iconOnly?, disabled? }[], pressed, onPress, multiple?, direction?, name?, disabled? }, h)`; `Segmented.toggled(pressed, value, { multiple, optional })` is the transition `update` applies. See [Segmented](#segmented). | `tray`: `tray` (default, muted), `plain`, `underline`; `size`: `xs`, `sm`, `md`, `lg`; `width: 'fill'`. Slots `group`, `option`, `label`, `icon`, `content`, `indicator`, `highlight`, `hiddenInput`. |
| `Select` | Adapter over the native `<select>`; the recipe draws its own chevron and mutes a chosen placeholder. For icons, descriptions, groups or a check in the list, draw a Listbox as a custom select with `Listbox.parts`. | `size`: `sm`, `md` (default), `lg`; `variant`: `outline` (default), `filled`. Slots `select`, `label`, `description`. |
| `Listbox` | Adapter over a fork (see [Why some components needed a fork](#why-some-components-needed-a-fork)); single and multi share one transcription. A custom select is a Listbox drawn with `Listbox.parts(mixins, { h })`: `part.option({ label, description?, icon? })` as an item's content and `part.trigger(chosen, placeholder)` as the button's, its value or the placeholder (muted, `data-placeholder`) and a chevron. An invalid trigger (`isInvalid`) writes `aria-invalid` and draws the error edge, a disabled one shows no hover, and a portaled panel carries the `direction`, so a right-to-left page places it for its side. | `width`: `auto` (default), `trigger`; `check`: `end` (default), `start`, `none`; `trigger`: `outline` (default), `filled`, `ghost`; `size`. Slots `wrapper`, `button`, `backdrop`, `items`, `scroll`, `item`, `group`, `heading`, `separator`, `rows`, `highlight`, `indicator`, `scrollBar`, `scrollThumb`, the option's and trigger's parts (`itemIcon`, `itemLabel`, `itemDescription`, `itemCheck`, `value`, `valueText`, `chevron`, …). |
| `Combobox` | Adapter over a fork, single and multi. The view inputs add `chips: { label?, removeLabel? }` (each chosen value a chip in the field, its remove button choosing it again; with `ComboboxView.Multi`, a tags field with suggestions), `clearContent` and `clearLabel` (a clear button while the field has text), and `empty` (shown, as a polite status, in the list's place while open with nothing to list; a loading line too). `Combobox.parts(mixins, { h }).option(content, query)` marks the typed text in an option's label. Home and End move the caret in the text: the list's ends are not bound to them. An invalid combobox writes `aria-invalid` on the input and draws the error edge on the field; the clear button is a touch-sized target. | `width`: `trigger` (default), `auto`; `size`. Slots as the Listbox's with `wrapper`, `inputWrapper`, `input`, `toggleButton`, `chips`, `chip`, `chipRemove`, `clearButton`, `empty`. |
| `Picker` | A select that is a dropdown on a desktop and a bottom sheet on a phone, with one Model and one set of Messages whatever the width. A small Model: `Picker.init({ id, sheet? })`, folded with `Picker.update`, which returns `Picker.OutMessage.Chose({ value })` for a choice made either way. `Picker.view({ model, onMessage, label, options, value, placeholder, anchor?, style?, mixins?, listbox?, sheet?, routes? }, h)`; `options` are `{ value, label, description?, icon? }`. See [Picker](#picker). | `sheetBelow`: `sm`, `md` (default), `lg`; `trigger`: `outline` (default), `filled`, `ghost`; `size`. Slots `root`, `dropdown`, `opener`, `list`, `option`. |
| `CascadeSelect` | After Zag's: one value chosen as a path of ids through nested options. A small Model: `CascadeSelect.init({ id })` holds the chosen path and the one the keys are on, folded with `CascadeSelect.update(config)`. `CascadeSelect.view({ model, config, onMessage, label, placeholder?, levels?, layout?, expandOn?, clearable?, separator?, name?, disabled?, invalid?, direction?, routes?, style? }, h)`. See [CascadeSelect](#cascadeselect). | `size`; `trigger`: `outline`, `filled`, `ghost`; `width`: `trigger`, `auto`. Slots `root`, `trigger`, `valueText`, `chevron`, `clear`, `input`, `layer`, `backdrop`, `panel`, `column`, `heading`, `back`, `item`, `itemText`, `branch`. |
| `Slider` | Native `input type="range"` thumbs, so drag, keys, right to left and the form value are the browser's. `Slider.view({ id, label, value, onChange, onCommit?, description?, min?, max?, step?, format?, marks?, showValue?, name?, disabled?, orientation?, ticks?, thumbLabels? }, h)`; `value` is a number or a `{ low, high }` range, and `onChange` is handed the same kind. See [Slider](#slider). | `tone`: `accent` (default), `neutral`; `size`: `sm`, `md` (default), `lg`; `track`: `thick` (default), `thin`, `paint`; `value`: `above` (default), `inside`, `end`; `label`: `shown` (default), `hidden`. Slots `root`, `label`, `description`, `control`, `track`, `fill`, `mark`, `value`, `thumb`. |
| `AngleSlider` | After Zag's: a dial in degrees, 0 at the top and clockwise. A small Model: `AngleSlider.init({ id, value? })` is the angle and the drag, folded with `AngleSlider.update(layout)`, where `layout` (`step`, `largeStep`, `marks`, `restrictToMarks`) is the object the view spreads in too. `AngleSlider.view({ ...layout, model, onMessage, label, name?, format?, valueText?, showValue?, disabled?, readOnly?, invalid? }, h)`. A press or drag sends `Pointed` and `Released`; the APG's slider keys reach `update` as what was pressed, and go round past 0. | `tone`; `track`: `ring`, `plain`, `disc`; `value`: `inside`, `below`; `size`. Slots `root`, `label`, `control`, `needle`, `thumb`, `markers`, `marker`, `markerLabel`, `value`, `input`. |
| `Rating` | A `radiogroup` of native radios named by its label, one per star under one name, so the browser's arrows move the choice and a form submits it. `Rating.view({ id, label, value, onChange, max?, starLabel?, readOnly?, disabled?, name?, precision?, onClear?, showValue? }, h)`; `value` is an `Option`, none is unrated. Read-only, it is one `img` whose name says the rating, and takes no `onChange`. | `tone`: `warning` (default, gold), `accent`, `error`; `glyph`: `star` (default), `heart`, `circle`; `size`. Slots `root`, `label`, `star`. |
| `ColorPicker` | After ReUI's: a saturation and brightness area, hue and alpha Sliders, an eyedropper where the browser has one, text in hex, rgb, hsl or oklch, and `presets` as a radio group of swatches. A small Model: `ColorPicker.init({ id, color?, format? })` holds the color, its format and a draft being typed, folded with `ColorPicker.update`. `ColorPicker.view({ model, onMessage, label, presets?, alpha?, eyedropper?, labels?, disabled?, slider? }, h)`; `ColorPicker.popover({ ...options, popover, onPopover, anchor?, popoverMixins? }, h)` draws it behind a swatch in a Popover. See [ColorPicker](#colorpicker). | `size`. Its Sliders take `Recipes.Slider({ track: 'paint', label: 'hidden' })`. Slots `root`, `label`, `area`, `areaThumb`, `controls`, `eyedropper`, `channels`, `channel`, `swatch`, `fields`, `format`, `input`, `presets`, `preset`, `picker`, `trigger`, `value`. |
| `Calendar` | One date system, inline. `Calendar.Selection` is `Single`, `Range` or `Multiple`, owned by the application. See [Calendar and DatePicker](#calendar-and-datepicker). | `size`; `outside`: `shown` (default), `hidden`; `detail`: `text`, `dot`, unset by default. Slots `root`, `header`, `grid`, `headerRow`, `previousMonthButton`, `nextMonthButton`, `headingButton`, `previousPageButton`, `nextPageButton`, `columnHeader`, `weekRow`, `dayCell`, `dayButton`, `monthCell`, `monthButton`, `yearCell`, `yearButton`. |
| `DatePicker` | A Calendar in a popover, over a fork that keeps upstream's Popover and Calendar composition. A date, a range or many days. See [Calendar and DatePicker](#calendar-and-datepicker). | Slots `trigger`, `panel`, `backdrop`. |

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
closing it. The application keeps the value (`Option`), as with the Listbox, and
`Value` is inferred from the options. Opening the Sheet closes a Listbox left
open. `listbox` takes `Recipes.Listbox`, which also draws the options' and the
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

### Slider

`onCommit` is sent with the value when the reader lets go (the range input's
native `change`, which fires on release after a drag and on each key press, where
`onChange` has sent every step on the way), and `description` is a line under the
slider that each thumb is described by. One number is one thumb across the track,
named by the label; a press anywhere on the track moves it. A range is a `group`
named by its label holding two thumbs named by `thumbLabels` (default `Minimum`
and `Maximum`), each bounded by the other, so the browser stops a drag or a key at
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
`showValue` shows `starLabel` of the rating beside the stars. Home and End on a
star are a key route that focuses the first or last star by its id
(`<id>-<value>`) and chooses it, as the arrows would; a read-only or disabled
rating draws no route. `name` defaults to `id`.

### ColorPicker

Keys and drags reach `update` as what was pressed, so fast keys each step from the
last color. `ColorPicker.popover` takes a Popover made with `contentFocus: true`
(it throws for one without): the panel opens on the area's thumb, a press or a
drag inside never closes it, and focus leaving it closes one the keys or a finger
opened (a mouse's stays open, as upstream's Popover does).
`ColorPicker.color('#3b82f6')` reads a literal in code (it throws on a typo);
`format`, `parse` (an `Option`) and `toOklch` are pure. `ColorPicker.Eyedrop` and
`canEyedrop` are the eyedropper's Command and check.

### Calendar and DatePicker

Fold each `SelectedDate` through `Calendar.picked`; `Calendar.empty(mode)` starts
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
onShow }` (month and year selects; answer `onShow` with `Calendar.show`), `paging`
with `Calendar.alongside(model, other, offset)` for two months side by side,
`preview: { date, onPreview }` for a range under the pointer, and `detail: date =>
Option<string>` for a line under a day's number (a price, "2 events") that
describes its button (`ResolvedDayCell.detail`). `ResolvedDays`' paging buttons
are `Option`s and its heading is a `caption`. Presets: `Calendar.lastDays`,
`nextDays`, `monthOf`, `day`, drawn by `Calendar.presetsView`.

A DatePicker also picks a whole `Calendar.Selection`. Fold it with
`DatePicker.update(selection)`, given the selection the application keeps:
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
| `Menu` | One menu opened three ways: by a button, at a point (a context menu) or from a long press. A small Model: `Menu.init(id, rows, { isAnimated?, isModal? })`, folded with `Menu.update`. `Menu.view({ model, rows, buttonContent, onMessage, opensAt?, direction?, isRowDisabled?, mixins, submenuMixins? }, h)`, the style being one of the `mixins` (`[MenuStyle.mixin]`). See [Menu](#menu). | No axis. Slots `wrapper`, `button`, `backdrop`, `items`, `scroll`, `item`, `group`, `heading`, `separator`, `rows`, `highlight`, `scrollBar`, `scrollThumb`, `label`, `sub`, `chevron`, `hint`, `icon`. |
| `Menubar` | A row of Menus, shadcn's and the APG's menubar. A small Model: `Menubar.init(ids, { isAnimated?, isModal? })`, folded with `Menubar.update`, whose `Selected` OutMessage names the menu and the row's `value`. `Menubar.view({ label, model, menus, onMessage, direction?, routes?, style?, menuMixins? }, h)`, each menu `{ label, rows, isRowDisabled? }` taking a Menu's rows (none opening a submenu). One trigger is the tab stop; ArrowLeft/ArrowRight (Home/End while all are shut) move it, and with a menu open they open the next on its first row. While one is open, pointing at another opens it, and opening any shuts the rest. | No axis. `Recipes.MenubarMenu` is the Menu recipe with a bar's flat triggers. Slots `bar`, `menu`; each menu's are `MenuSlots`. |
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

## Navigation and structure

| Widget | What it is | Recipe and Slots |
| --- | --- | --- |
| `Tabs` | Adapter. A tab is a flex row, so draw its words in `label` (`h.span(label, [words])`), an icon in `icon`, a Badge after them for a count. `TabsContext.close: { onClose }` makes tabs closable; `TabsContext.routes` takes [application key routes](#application-key-routes). `Tabs.readingKeys` beside the style reads the arrow keys by the tablist's direction. See [Tabs](#tabs). | `variant`: `line` (default), `pill`; `size`; `overflow`: `scroll`, `wrap`; pill-only `selection`: `raised` (default), `tint`; upstream's `orientation: 'Vertical'`. Slots `tablist`, `tab`, `panel`, `indicator`, `highlight`, `item`, `label`, `icon`, `close`. |
| `Nav` | Two layers. `Nav.toView(mixins, { h }, label, draw?)` styles `@foldkit/ui`'s stateless Nav (`nav > ul > li > a`, the current link `aria-current="page"`). `Nav.view({ model, entries, label, onMessage, orientation?, direction?, routes?, panelRoutes?, mixins? }, h)` is a navigation menu with panels of link columns. A small Model: `Nav.init(id)`, folded with `Nav.update`. See [Nav](#nav). | `indicator`: `underline` (default), `pill`; `orientation: 'vertical'`. Slots `nav`, `list`, `item`, `link`, `trigger`, `chevron`, `panel`, `groups`, `group`, `heading`, `links`, `panelItem`, `panelLink`, `title`, `description`, `indicator`, `highlight`. |
| `Breadcrumb` | `{ label?, steps: { label, href?, current?, icon? }[], separator?, collapse? }`. `label` names the landmark (default `Breadcrumb`). `current` is text with `aria-current="page"`; the others are links. `collapse: { max, onExpand, label? }` folds the middle of a long trail into an ellipsis (`Breadcrumb.collapsedOf(steps, max)` is the split); `collapse: { max, menu: { model, onMessage, mixins } }` makes the ellipsis open a Menu of the hidden steps, built from `Breadcrumb.menuRows(steps, max)`, with `Breadcrumb.chosen(steps, max, value)` the step a row leads to (a row's value is its step's place among the hidden steps, so two steps of one label are two rows). | `separator`: `slash` (default), `chevron`, `dot`. Slots `root`, `list`, `item`, `link`, `current`, `icon`, `separator`, `ellipsis`, `dots`. |
| `Pagination` | `{ page, pageCount, onPage, label?, siblings?, boundaries?, numbered?, ends?, range?, words? }`. `Pagination.itemsOf(page, pageCount, window?)` is the stops; `Pagination.summaryOf(page, { total, perPage, text? })` is `"1–10 of 97"`, drawn before the stops when `range` is given. See [Pagination](#pagination). | `compact`: `narrow` (default, below a 30rem window), `always`, `never`. Slots `root`, `summary`, `perPage`, `perPageSelect`, `first`, `prev`, `next`, `last`, `page`, `pageCount`, `ellipsis`. |
| `Steps` | A stepper, an ordered list named by `label`. `Steps.view({ label, steps: { title, description?, icon?, content? }[], current, onSelect?, words?, progress? }, h)`. The step at `current` is `aria-current="step"`, those before it `data-state="complete"` (a check replaces the number), those after `upcoming`. With `onSelect(index)`, completed steps are buttons for going back; steps ahead never are. The application owns `current`. | `orientation`: `horizontal` (default), `vertical`; `size`: `xs`, `sm`, `md`, `lg`; `marker`: `number`, `dot`; `connector`: `line`, `progress`. Slots `root`, `item`, `step`, `trigger`, `marker`, `number`, `text`, `title`, `state`, `description`, `content`, `connector`. |
| `Sidebar` | shadcn's sidebar with Fluid's collapse. A small Model: `Sidebar.init({ id, rows, open?, collapsed?, side?, width? })`, folded with `Sidebar.update`. `Sidebar.view({ model, onMessage, label, groups, header?, footer?, direction?, collapse?, style?, mixins?, tooltip?, sheet? }, h)`. See [Sidebar](#sidebar). | `variant`: `sidebar` (flush with the page's edge, the default), `floating`, `inset`. Slots `root`, `header`, `footer`, `opener`, `title`, `toggle`, `nav`, `section`, `heading`, `trigger`, `chevron`, `links`, `item`, `branch`, `link`, `icon`, `mark`, `detail`, `label`, `badge`, `action`, `tip`, `indicator`, `highlight`, `resize`. |
| `AppShell` | An application's page frame: `AppShell.view({ title, brand?, status?, actions?, side?, footer?, mainId?, words? }, main, h)`. A skip link to the main region, a header bar (the banner) with the title and, at its end, `status` and `actions`, an optional side column for a `Sidebar`'s view, the main region (`id` `main` by default, focusable by script so the skip link moves focus there), and a footer. It holds no state and sends no Message. The header and the side column stay in view while the page scrolls; below `md` the side column sits at the start of the header's row. `Patterns.AppShell` is its contract. | `width`: `full` (default), `contained` (the main region's content kept to the theme's `width.page`). Slots `root`, `skip`, `header`, `brand`, `mark`, `title`, `status`, `actions`, `side`, `main`, `footer`. |
| `Accordion` | `{ id, items: { id, title, content, disabled? }[], open, onToggle, headingLevel? }`; `Accordion.toggled(open, id, { multiple?, collapsible? })` is the transition `update` applies, the open ids being the application's. Each trigger is a button in a heading naming its panel; a shut panel stays drawn and `inert`. The view takes an `icon` in place of the recipe's. | `variant`: `plain` (default), `bordered`, `separated`, `filled`, `ghost`; `separators`: `on`, `off`; `indicator`: `chevron`, `plus`; `indicatorPosition`: `end`, `start`; `active`: `none`, `trigger`, `item`. Slots `root`, `item`, `heading`, `trigger`, `label`, `chevron`, `icon`, `panel`, `body`, `content`. |
| `Disclosure` | Adapter. Draw the panel only while open, or through upstream's `animatePanel`, which keeps a shut panel inert and moves its height itself by an inline transition that the recipe overrides with an important rule, so the `motion` knob scales it and reduced motion snaps it. | `variant`: `plain` (default), `bordered`, `ghost`; `indicator`: `chevron` (default), `none`. Slots `button`, `panel`. |
| `TreeView` | The APG's and Zag's tree view. A small Model: `TreeView.init({ id, open?, checked? })`, folded with `TreeView.update(nodes, { checkable? })` (curried over the tree, flattened once). `TreeView.view({ label, model, nodes, onMessage, direction?, checkable?, style?, mixins? }, h)` over nodes `{ id, label, children?, disabled?, icon?, openIcon? }`. See [TreeView](#treeview). | `guides`: `none` (default), `lines`; `data-state` on a branch `item` and its `group`. Each item carries `--fk-tree-level`. Slots `root`, `item`, `row`, `chevron`, `checkbox`, `icon`, `label`, `group`. |

### Tabs

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
the page-size select. `range.choose: { sizes, onPerPage, label? }` adds a select of
rows per page (labelled `Rows per page` by default) that sends `onPerPage` with the
size; the application sets `perPage` and a page that keeps its rows in view.
`numbered: false` leaves previous and next alone; `ends` draws first and last.
`words: { first?, previous?, next?, last?, stopLabel? }` are the stops' words and,
through `stopLabel(word)` (default `"<word> page"`), their names, for another
language. A stop at an end is `aria-disabled`, not `disabled`, so it keeps focus and
sends nothing. The current stop reads `aria-current` and holds ` / 12` in a
`pageCount` span hidden from assistive technology; compact shows only that stop and
no ellipses.

### Steps

The marker is hidden from assistive technology, so `words: { complete?, current?,
upcoming? }` (default `Completed`, none, `Upcoming`; the current step's
`aria-current="step"` already says it) say each step's state in text after its
title, in the `state` slot. `progress` (0 to 1) fills the connector after the
current step when the recipe's connector is a progress bar. A horizontal row
narrower than 32rem shows only the current step's words, wrapping inside an even
share so the markers stay evenly spaced (a word longer than 40% of the row is cut),
and narrower than 17rem draws them on a line of their own under the markers.

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
| `Table` | The presentational table. `Table.view({ columns: { header, value, numeric?, sortKey?, rowHeader? }[], rows, rowKey?, caption?, fluid?, sort?, selection?, expansion?, empty? }, h)`. A column's `value` returns text or markup. Sorting, selection and expansion are the application's. See [Table](#table). | `rows`: `lined`, `striped`, `plain`; `density`: `compact`, `regular`, `comfortable`; `header`: `static`, `sticky`. Slots `frame`, `highlight`, `root`, `caption`, `head`, `headerRow`, `headerCell`, `sortButton`, `sortIcon`, `body`, `row`, `cell`, `controlCell`, `checkboxLabel`, `expandButton`, `expandIcon`, `detailRow`, `detailCell`, `emptyRow`, `emptyCell`. |
| `Card` | `{ title?, description?, content?, image?, media?, action?, footer?, press?, label?, selected?, disabled?, dismiss?, headingLevel?, recoveryPart? }`. See [Card and Item](#card-and-item). | `orientation`: `stacked`, `inline`; `surface`: `outlined`, `elevated`, `filled`, `plain`; `padding`: `compact`, `comfortable`, `roomy`, `flush`; `elevation`: `0` to `3`; `lift`: `none`, `hover`. Slots `root`, `image`, `media`, `header`, `title`, `description`, `action`, `content`, `footer`, `overlay`, `dismiss`. |
| `Card.group` | `{ cards: (CardView & { key })[], columns?, fluidHover?, label?, cardStyle? }`: a keyed list of cards in up to `columns` (default 1), wrapping to fewer where a column would be narrower than the recipe's `minColumn`. With `fluidHover` (default) one highlight follows the pointer through `FluidHover` from `foldkit-primitives/dom`, and a press in a gap presses the highlighted card. | `Recipes.CardGroup`: `layout`: `divided` (default), `separated`; `minColumn`: `none`, `sm`, `md` (default), `lg`; `border`: `none`, `outlined`. The highlight is a film over the card the pointer is on, and is that card's hover. Slots `root`, `list`, `item`, `highlight`. |
| `Item` | The row primitive: `{ content?, media?, title?, description?, actions?, press?, label?, selected?, disabled? }`; `content` follows the title and description. `Item.group({ items: (ItemView & { key })[], label?, style?, itemStyle? })` is a list of them. Field is for form controls. | `variant`: `plain`, `outline`, `muted`; `density`: `comfortable`, `compact`; `media`: `plain`, `icon`, `image`. Slots `root`, `media`, `content`, `title`, `description`, `actions`, `overlay`. `Recipes.ItemGroup({ layout: 'divided' \| 'separated' })` over `ItemGroupSlots` (`root`, `row`). |
| `Avatar` | `{ name, src?, initials?, status?, statusLabel? }`. The root is one `role="img"` named by the person (and the status, "Ada Lovelace, Online"); initials show until the picture covers them. `status` is `online`, `away`, `busy`, `offline`. `src` may be an `AvatarPicture` (`{ asset, provider, width }` from `foldkit-media`), drawn with its 1x and 2x candidates at `width` CSS pixels; a provider with no URL for it leaves the initials. `Avatar.widthOf(size)` is a size's width in CSS pixels. `Avatar.group({ people, max?, label?, moreLabel?, style?, avatarStyle? })` overlaps them and counts the rest as one more avatar. | `size`: `xs` to `xl`; `shape`: `circle`, `rounded`, `square`; `color`: `neutral`, `name` (initials in a hue from the name); `ring`: `none`, `page`, `accent`. Slots `root`, `fallback`, `image`, `status`. `Recipes.AvatarGroup({ overlap: 'tight' \| 'loose' \| 'none' })` over `AvatarGroupSlots` (`root`). |
| `Badge` | `{ text, tone? }` writes `data-tone`. | `Recipes.Badge({ attribute, tones, appearance? })` maps that attribute; values outside the map keep the base. `appearance`: `tinted` (default), `dot`, `outline`, `solid`. Slot `badge`. |
| `Typography` | `{ level, text }`. The level chooses the element (`h1`–`h4`, `lead`, `body`, `small`, `muted`, `quote`, `code`, and the interface roles `display`, `title`, `subtitle`, `caption`, `micro` as paragraphs). | `level`, same set; a role is its size and leading on the size ladder. Defaults to `body`. Slot `text`. |
| `Separator` | `{ orientation?, label?, decorative? }`, horizontal by default. A `label` sits between two drawn rules and is read as text; `decorative` is `role="none"`. One style draws both orientations. A vertical rule stretches across a flex or grid row, short of it by the inset, and elsewhere (running text) stands as tall as the letters. | `line`: `solid`, `dashed`, `dotted`; `thickness`: `thin`, `thick`; `spacing`: `none`, `sm`, `md`, `lg`; `inset`: `none`, `sm`, `md`. Slots `rule`, `root`, `label`. |
| `Empty` | `{ title, description?, icon?, action? }`. The title takes the `subtitle` role; the icon is `aria-hidden`. | `media`: `icon`, `illustration`; `frame`: `none`, `dashed`, `filled`; `tone`: `neutral`, `danger`; `size`: `compact`, `comfortable`. Slots `root`, `icon`, `title`, `description`, `action`. |
| `Skeleton` | `{ label? }`: `role="status"` named by `label`, and `aria-hidden` without one, so a page of placeholders is not a page of empty live regions. `Skeleton.lines({ lines, label? })`, `avatarRow`, `card` and `tableRow({ columns })` draw the shapes content takes, in a `group`. | `shape`: `bar`, `circle`; `animation`: `pulse`, `shimmer`, `none`. Slots `bar`, `group`. |
| `Carousel` | The APG carousel. A small Model: `Carousel.init({ id, index?, autoplay?, delay?, reducedMotion? })`, folded with `Carousel.update({ count, perView?, loop? })`. `Carousel.view({ label, model, slides, onMessage, loop?, perView?, picker?, thumbnails?, slideLabel?, previousLabel?, nextLabel?, pickerLabel?, rotationLabels? }, h)`. See [Carousel](#carousel). | `peek`: `none`, `edge`. Slots `root`, `track`, `slide`, `controls`, `rotation`, `previous`, `next`, `picker`, `dot`, `thumbnail`, `status`. |
| `Marquee` | After Zag's: content that scrolls on without a seam. A small Model: `Marquee.init({ id })` holds what it measured and whether it is paused, folded with `Marquee.update`. `Marquee.view({ model, onMessage, label, items, side?, speed?, autoFill?, repeat?, delay?, loopCount? }, h)` measures its content (`Resize`) and draws copies to fill the viewport, `inert` after the first and drawn without their `id`s, so a document holds each once. A pointer, focus or its pause press (WCAG 2.2.2) holds it; `Marquee.Message.Paused()` holds it from outside. Its motion is CSS, and under reduced motion the viewport scrolls instead. | `spacing`; `edges`: `fade`, `none`. Slots `root`, `viewport`, `content`, `item`, `pause`. |

### Images, icons and codes

| Widget | What it is | Recipe and Slots |
| --- | --- | --- |
| `Image` | `{ asset, provider, layout, alt, priority?, sizes? }` from `foldkit-media`. See [Image](#image). | `fit`: `cover`, `contain`; `edge`: `none`, `line`; `ratio`: `auto`, `square`, `video`, `portrait`; `radius`. Slots `frame`, `source`, `image`. |
| `Figure` | `{ content, caption? }`: a `figure` holding its content (an `Image.view`, a chart, a code block), then its caption in a `figcaption`, which names the figure for assistive technology by itself; no caption, no `figcaption`. | `align`: `start`, `center`. Slots `root`, `caption`. |
| `AspectRatio` | `{ content? }`. | `ratio`: `square` (default), `video` (16/9), `portrait` (3/4). The corner reads `radius`. Slot `frame`. |
| `Icon` | `{ icon, label?, key?, style?, mixins? }`: an `IconData` drawn as inline SVG with `foldkit-media`'s `Icon.draw`. A `label` makes it `role="img"`; without one the glyph is `aria-hidden`. `key` parts two copies of one icon on a page. | `size`: `sm`, `md`, `lg` on the type scale; none (the default) stands on the size ladder. Slot `glyph`. |
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
`Table.nextSort(sort, column)` cycles ascending, descending and none. `selection`
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

```ts
import { Option } from 'effect'
import { Table, TableSlots } from 'foldkit-mixins-ui'

interface Product {
  readonly name: string
  readonly price: string
}

const Sort = defineMessageUnion({ Sorted: { column: Schema.String } })
type Sort = typeof Sort.Type

const ProductsStyle = Style.forSlots(TableSlots)(Recipes.Table({}))

const productsTable = (
  rows: ReadonlyArray<Product>,
  sorted: Option.Option<Table.TableSort>,
  h: HtmlBuilder<Sort>,
) =>
  Table.view<Product, Sort>(
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
the card (`overlay`, shared with Item), named by `label` or the title (a pressable
card with neither throws); `action`, `footer` and the dismiss button stay pressable
above it. `selected` is `aria-pressed` on the button, `aria-current="page"` on the
link. `headingLevel` (2 to 6, default 3) is the level of the title's heading. A
`disabled` card's overlay is `aria-disabled` and sends nothing, so it stays focusable
(a link loses its `href`). `dismiss: { onDismiss, label?, always? }` is revealed on
hover and focus unless `always`, and always on a touch screen. `recoveryPart` marks
the dismiss button as a `FocusRecovery` part (see [Focus after
removal](#focus-after-removal)). The root carries `data-selected`, `data-disabled`,
`data-pressable` and `data-dismissible` (the header then keeps clear of the button).

In the recipe an `image` bleeds to the card's edges (16:9 when stacked); `media`
puts a bare icon (`svg`, `img`) in a tile and lets anything else, an Avatar say, lead
at its own size. `elevation` is a step of the surface ladder (lighter in a dark
scheme; a contact and an ambient shadow in a light one). `lift: 'hover'` lifts under
the pointer, which `travel` stills (not in a `Card.group` with a highlight, which is
the hover there). In a group, a card draws no hover of its own, whatever its
`surface`; divided cards are usually `surface: 'plain'`.

An `Item`'s `press` is the same stretched control, named by `label` or the title, with
`actions` staying pressable above it; `selected` is `aria-pressed` or `aria-current`.
An avatar beside a name and a line is an Item with the avatar as its media.

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
| `Alert` | `{ layout, title, description?, icon?, actions?, onDismiss?, dismissLabel?, recoveryPart? }`, and by `layout`: `'inline'` takes `assertive?` and is a live region inside the content, of something that just happened (`role="alert"` when assertive, `role="status"` otherwise); `'banner'` takes `label` and is a full-width strip across a page or a section, there on load, so a `section` landmark named by `label` rather than a live region, which would say nothing on load. Each action is `{ label, href }` (a link) or `{ label, onClick }` (a button); `onDismiss` draws a close button named `Dismiss <title>` inline, `Dismiss <label>` as a banner. The icon is `aria-hidden`; whether it shows is the application's. The root writes `data-layout` and `data-dismissible`. `recoveryPart`: see [Focus after removal](#focus-after-removal). | `tone`: `info` (default), `success`, `warning`, `error`; `emphasis`: `subtle` (default, the family's tint), `bold` (its fill). Slots `root`, `icon`, `title`, `description`, `actions`, `action`, `dismiss`. |
| `Toast` | A stack of toasts, Sonner's. A small Model: `Toast.init(id, { position?, direction?, duration?, max?, threshold? })`, folded with `Toast.update`, whose `Acted` OutMessage names a pressed action. `Toast.show(model, { type?, title, description?, action?, duration? })` returns the stack and the new toast's `id`; `Toast.settle(model, id, input)` turns a toast into its outcome; `Toast.dismiss(model, id)` takes it away. `Toast.view({ model, onMessage, label?, closeLabel?, expand?, icons? }, h)`. Adapter over the `ToastView` fork for toasts that carry their own payload. See [Toast](#toast). | `tone`: `plain` (default), `rich` (each type on its tint). Slots `container`, `entry`, `list`, `icon`, `body`, `title`, `description`, `action`, `close`, `status`, `alert`. |
| `Progress` | `@foldkit/ui`'s Progress. `Progress.view({ id, label, value, min?, max?, valueText?, showValue?, buffer?, segments? }, h)` draws a `progressbar` named by its label. `value` is an `Option`; none is indeterminate, and the bar's fill sweeps toward the inline end, leftward right to left. The root carries the share done as `--fk-progress`. `showValue` draws the value (`valueText`, else a percentage) at the end of a bar's label line and inside a ring. A `value` given as `ProgressSection`s is one stacked bar of toned parts, read aloud as their sum; `buffer` draws how far the work could go behind the fill; `segments` cuts the track into steps. | `shape`: `bar` (default), `ring`; `tone`: `accent`, `neutral`, `success`, `warning`, `error`, `info`; `stripes`: `none`, `still`, `moving` (travel-aware); `size`. Slots `root`, `label`, `track`, `indicator`. |
| `Meter` | `@foldkit/ui`'s Meter, a measurement where `Progress` is work. `Meter.view({ id, label, value, min?, max?, low?, high?, optimum?, valueText? }, h)` draws a `meter` named by its label. The root says how good the value is as `data-level` (`good`, `fair`, `poor`), as the HTML meter judges it; `Meter.levelOf` is that judgment. | No axis; the fill takes success, warning or error by level. Slots `root`, `label`, `track`, `fill`. |
| `Spinner` | `{ label?, showLabel? }`. `role="status"` named by `label`, and `aria-hidden` without one; `showLabel` draws the label beside the wheel. A turn is about 720ms times `travel`. | `kind`: `ring` (default), `dots`, `bars`, `pulse`, `orbit`; `size`; `tone`: `accent`, `neutral`, `current`. Slots `wheel`, `part`, `root`, `text`. |
| `Timer` | After Zag's: a countdown (`Timer.init({ id, countdown: true, duration })`) or a stopwatch (`Timer.init({ id, interval? })`), folded with `Timer.update`, whose Commands (`Timer.Stamp`, `Timer.Tick`) read Effect's `Clock`, so TestClock drives a run. `Timer.view({ model, onMessage, label, units?, separator?, labels? }, h)`: a `role="timer"` with each unit in a Slot, one press that says what comes next, and reset. `Timer.phase(model)` is `idle`, `running`, `paused` or `done`; to start at once, return `Timer.update(model, Timer.Message.Pressed({ action: 'start' }))` from `init`. | `tone`, `look`, `progress`, `size`. Slots `root`, `label`, `area`, `item`, `separator`, `controls`, `action`. |

### Toast

The newest stand in front, spread out while the pointer or focus holds the stack, at
most `max` (3) showing; a held stack or a hidden page pauses every countdown, keeping
the time left; a swipe toward the edge past `threshold` dismisses one. A toast is
spoken in a polite region, an error in an assertive one, each toast a keyed child of
its own (the regions are not atomic), so one added beside another, or with the same
words, is still read by itself. A toast that is already leaving does not act again
when its action is pressed. A promise toast is `show` with `type: 'loading'`, the work
run as a Command, and `settle` on the toast's `id` when its Message comes back.
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
      onClear: Search.Cleared(),
      routes: [Keys.first(openResults, toResults)],
    },
    h,
  )
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
  focus Command after a removal.

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
theme's `menu: { accent, color }` (a bold accent row, an inverted or translucent panel)
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

`Recipes.Badge` is a function rather than a variant selection: one style serves badges in every
state, so every tone is present at once and there is no axis to select. It takes the attribute
carrying the value and the value-to-tone map; values the map leaves out keep the base pill. It
reads the shipped tokens, keeps the base in `components` with each tone in `variants`, and a
toned pill is grounded on its tone's `subtle`, which keeps the tone's hue over a tinted page:

```ts
const EntryStyle = Style.forSlots(EntrySlots)(
  {
    badge: Recipes.Badge({
      attribute: 'data-state',
      tones: { Published: 'success', Changed: 'warning' },
    }).badge,
  },
)
```

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

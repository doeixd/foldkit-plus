# `foldkit-mixins-ui`

Adapts [`@foldkit/ui`](https://www.npmjs.com/package/@foldkit/ui) render seams into
[`foldkit-mixins`](../mixins) slots.

Use it when an `@foldkit/ui` component already owns the difficult state and
accessibility behavior, but you want callers to style or decorate the component
through a typed extension contract instead of copying its markup or manually
merging attribute arrays.

The ownership rule stays simple:

```text
@foldkit/ui
  owns component state
  owns accessibility behavior
  owns its base attributes

foldkit-mixins-ui
  names the component's public attribute bundles as Slots

foldkit-mixins
  safely merges Style + Behavior into those Slots
```

This package adds **no component state and no renderer**. It is only a bridge
between an existing `@foldkit/ui` render seam and the Mixins resolver.

Every shipped recipe is on the website's
[component pages](https://foldkit-plus.pages.dev/components), each with its
variants to pick and the code that draws it, and
[Create a theme](https://foldkit-plus.pages.dev/create) turns the theme's knobs
over all of them at once.

## The mental model

An `@foldkit/ui` component commonly hands its caller one or more attribute
bundles:

```text
roles
aria-*
tabindex
event handlers
ChildAttributes
...
```

Those bundles are meaningful, but a raw array is not a public customization
contract. A caller can accidentally add a second `OnClick`, replace something
structural, or repeat bespoke merge code at every call site.

`foldkit-mixins-ui` gives each supported bundle a stable Slot name:

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

So the component author keeps control of the component, while callers get a
typed place to extend it.

## When to use it

Use this package when:

- you already use `@foldkit/ui`;
- the component exposes a consumer render seam such as `toView`;
- you want reusable styling, ARIA decoration, analytics, or element-level
  behavior around that component;
- you want conflicts to be diagnosed rather than resolved by attribute order.

Do **not** use it to add application/component state. State belongs in the
component's Submodel or the application Model. A Mixins `Behavior` contributes
element-level attributes and optional Mount behavior; it is not a hidden state
container.

If you are building your own view rather than adapting `@foldkit/ui`, publish
Slots directly with [`foldkit-mixins`](../mixins).

For Slot / Style / Behavior itself, read [Inside-out view
composition](../../docs/mixins.md) first.

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

```ts
toView: Button.toView(mixins, { h }, draw)
```

Conceptually:

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

The caller never copies Button's internal behavior and never has to know how to
merge its handlers/ARIA/structural attributes safely.

## Follow the click

`UiButton.view` builds the component's base attributes, including the click
Message, and calls `toView` with them. `Button.toView` applies the style to
those attributes and hands the result to `draw`, which puts it on the actual
element with `h.button`. Clicking emits `Saved` to the parent update. The name
`Saved` is just the example's Message name—it does not mean this adapter wrote
anything to storage.

`toView` performs no I/O and holds nothing: it is a pure function from the
component's bundles to your markup, run on every render.

Start by adding a class. Then add a non-conflicting attribute if needed.
Do not install another `OnClick` to intercept the component: the resolver
rejects competing event owners. Put every resolved bundle on its element,
adding your own attributes beside it where you need them:

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

## `toView` and `resolve`

Every component adapter (all but Anchor, which is a Behavior) has both:

```text
Adapter.toView(mixins, { h, input? }, draw)  ->  the component's toView
Adapter.resolve(attributes, mixins, { h, input? })  ->  the resolved bundles
```

`toView` is `resolve` placed where the component calls back, and is the normal
path. It fits a stateless component's `view` and a Submodel's `viewInputs`
alike. The Message type comes from `h`, and a Submodel's value type (a
RadioGroup's or Tabs' `Value`) from where the `toView` goes, so neither needs
writing out.

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

A toggle button, shadcn's Toggle, is a Button with `pressed`: it writes
`aria-pressed`, and each variant has its on look.

An input or a textarea places its own bundles, so its `view` takes a `draw`.
`Input.view` and `Textarea.view` take the value and Messages, a style, and
`@foldkit/ui`'s own config (`type` and `placeholder`, `rows` for a textarea):

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

`Input.field` and `Textarea.field` draw a whole field from a
`FieldValidation.Field`: the value, its first error or checking mark as the
description, and `aria-invalid` where the field is invalid. `changed` maps the
typed value to a Message; `label` is the text over the control; and `draw`
places the resolved `label`, `control`, and `description` bundles (the default
stacks them):

```ts
import { Input } from 'foldkit-mixins-ui'

const titleField = (field: FieldValidation.Field<string>, h: HtmlBuilder<Message>) =>
  Input.field(
    { id: 'title', label: 'Title', field, changed: value => Message.TypedTitle({ value }) },
    h,
  )
```

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

## What `resolve` does

`resolve(attributes, mixins, { input, h })` receives the shaped value the
component passed to its render callback and returns the same shape with published
attribute bundles resolved through Mixins.

For a simple Button:

```text
{ button: baseAttributes }
        |
        v
Button.resolve(...)
        |
        v
{ button: resolvedAttributes }
```

For richer components, non-slot values pass through untouched. Values such as
`animatePanel`, `isVisible`, `activeIndex`, or `selectedValue` remain component
data rather than becoming Mixins slots.

`input` is whatever attached Style/Behavior callbacks are allowed to read. In a
feature view that is often the Surface's projected Model; leave it out when no
attached Mixin reads one.

What `resolve` returns (and `draw` receives) has a name for each adapter:
`ResolvedButton<Message>`, `ResolvedInput<Message>`, `ResolvedDialog<Message>`,
`ResolvedRadioGroup<Value, Message>` and `ResolvedRadioOption<Value, Message>`,
`ResolvedTabs<Value, Message>`, `ResolvedCalendar<Message>`,
`ResolvedMenu<Message>` (with `ResolvedMenuGroup`/`ResolvedMenuItem` per
entry), and so on, so a
helper that draws part of a component can be typed without `ReturnType`.
`ResolvedTextarea`'s `textarea` bundle is typed for `h.textarea`, which refuses
`InnerHTML`; the resolver refuses an `InnerHTML` from any Mixin, so no cast is
needed.

Every adapter is available as both a component namespace (`Button.toView`,
`Button.resolve`, `Button.ButtonSlots`) and flat Slot exports such as
`ButtonSlots`.

## What the resolver protects

This package delegates merge semantics to core `foldkit-mixins`; it does not
simply concatenate arrays.

The resolver guarantees that:

- component/base attributes survive;
- `ChildAttribute`s survive by identity, preserving Submodel routing;
- classes are additive;
- inline declarations merge by property;
- an event or scalar attribute has one owner;
- structural attributes remain protected;
- conflicting ownership produces a `DiagnosticError` rather than an accidental
  second handler.

For example, if the Button already owns its click transition, a Behavior cannot
silently install a competing `OnClick` at the same Slot.

That is the main reason to use this adapter instead of another `className` or
`attributes` escape hatch.

## Submodel components remain Submodels

Some `@foldkit/ui` components publish `ChildAttribute`s carrying the child
state-machine dispatcher.

The resolver preserves those attributes, so adapting the render seam does **not**
flatten or bypass the child boundary:

```text
parent view
   |
resolved Slot attrs
   |
ChildAttribute
   |
component Submodel dispatcher
```

Dialog, Popover, Tooltip, Tabs, RadioGroup, Calendar, and Menu all rely on this
behavior.

Per-item components can also return structured groups rather than one flat Slot
array. The adapter preserves that shape. For example:

```text
Tabs       -> { tablist, tabs, activeIndex }
RadioGroup -> { group, options, selectedValue, hiddenInput }
Calendar   -> ResolvedDays | ResolvedMonths | ResolvedYears
Menu       -> { wrapper, button, backdrop, items, scroll, groups, isVisible }
Toast      -> { container, entries }
Listbox    -> { wrapper, button, backdrop, items, scroll, groups, hiddenInputs, isVisible }
Combobox   -> { wrapper, inputWrapper, input, toggleButton, backdrop, items, scroll, groups, hiddenInputs, isVisible }
```

One Slot contribution can apply to each repeated item while every item's base
attributes keep their own event ownership.

## Supported components

This is reference material; you do not need to memorize it to understand the
adapter.

| Component | Slots |
| --- | --- |
| Button | `button` |
| Input | `input`, `label`, `description` |
| Textarea | `textarea`, `label`, `description` |
| Select | `select`, `label`, `description` |
| Checkbox | `checkbox`, `label`, `description`, `hiddenInput` |
| Switch | `button`, `label`, `description`, `hiddenInput` |
| Fieldset | `fieldset`, `legend`, `description` |
| Disclosure | `button`, `panel` |
| Dialog | `dialog`, `backdrop`, `panel`, `title`, `description`, `initialFocus`, `closeButton`, and `handle`, the Sheet's grabber (this package's, `aria-hidden`; draw it in a Sheet's panel). An alert dialog is this one with `role: 'alertdialog'` in its context (`Dialog.toView(mixins, { h, role: 'alertdialog' }, draw)`), which puts `role="alertdialog"` on the `dialog` bundle; draw no close button, and drop the Messages `Dialog.isDismissal` names (Escape, the backdrop, the close button) in `update`, so only its own buttons, closing with `@foldkit/ui`'s `close`, answer it |
| Popover | `button`, `panel`, `backdrop`, `arrow` |
| Tooltip | `trigger`, `panel` |
| HoverIntent | `trigger`, `panel` (open and close delays with intent, for a hover card or a menu) |
| Tabs | `tablist`, `tab`, `panel`, and this package's `indicator` and `highlight` (drawn first in the tablist, for `Tabs.fluid`) |
| RadioGroup | `group`, `option`, `label`, `description`, `hiddenInput`. Upstream's `option` is a `button` and its `label` bundle only an id, so a bare `label` takes no press: draw each row as a `label` element around its `option`, and the browser sends a press on the words to the radio. The recipe stacks the group unless `aria-orientation` is `horizontal` |
| Anchor | a Mount and a Behavior over `@foldkit/ui/anchor`: `Anchor.behavior(Slots)({ floating, config })` positions a floating slot against a button by id |
| Calendar | `root`, `header` (the heading's row, this package's own), `grid`, `headerRow`, `previousMonthButton`, `nextMonthButton`, `headingButton`, `previousPageButton`, `nextPageButton`, `columnHeader`, `weekRow`, `dayCell`, `dayButton`, `monthCell`, `monthButton`, `yearCell`, `yearButton` |
| Menu | `wrapper`, `button`, `backdrop`, `items`, `scroll`, `item`, `group`, `heading`, `separator`, and this package's `rows`, `highlight` (over the `MenuView` fork; see below) |
| FileDrop | `root`, `input` |
| Toast | `container`, `entry` (over the `ToastView` fork; the dismiss control stays inside the consumer's `entryToView`) |
| Listbox | `wrapper`, `button`, `backdrop`, `items`, `scroll`, `item`, `group`, `heading`, `separator`, and this package's `rows`, `highlight`, `indicator` (over the `ListboxView` fork; single and multi share one transcription) |
| Combobox | `wrapper`, `inputWrapper`, `input`, `toggleButton`, `backdrop`, `items`, `scroll`, `item`, `group`, `heading`, `separator`, and this package's `rows`, `highlight`, `indicator` (over the `ComboboxView` fork; single and multi share one transcription) |
| DatePicker | `trigger`, `panel`, `backdrop` (over the `DatePickerView` fork, which keeps upstream's Popover+Calendar composition and seams only the popover assembly) |

## Stateless vocabulary

These views own no Model, no Message, and no bundle. Call `X.view(options, h)`.
Every one takes an optional `style` of its slots and `mixins` beside it. Style
the slots with the matching recipe. Hide text with `U.srOnly` from
`foldkit-mixins/utilities`. Name a control with `FieldAssociation`;
`Label.view` takes the id that derived.

```ts
import { Style } from 'foldkit-mixins'
import { AspectRatio, AspectRatioSlots, Icon, IconSlots, Recipes } from 'foldkit-mixins-ui'

const Frame = Style.forSlots(AspectRatioSlots)(Recipes.AspectRatio({ ratio: 'video' }))
const Mark = Style.forSlots(IconSlots)(Recipes.Icon({ size: 'sm' }))

// `h` is the view's builder. `content` is `Html`.
AspectRatio.view({ content: h.span([], ['poster']), style: Frame }, h)
Icon.view({ content: h.span([], ['!']), label: 'Warning', style: Mark }, h)
Icon.view({ content: h.span([], ['!']), style: Mark }, h)
```

A `label` makes the icon `role="img"`. Without one the glyph is `aria-hidden`.
`Icons.glyph` is the other tool: a mask on an element that already exists.

| View | Call | Recipe |
| --- | --- | --- |
| `Accordion` | `{ id, items: { id, title, content, disabled? }[], open, onToggle, headingLevel? }`; `Accordion.toggled(open, id, { multiple?, collapsible? })` is the transition `update` applies, the open ids being the application's. Each trigger is a button in a heading naming its panel; a shut panel stays drawn and `inert`. The panel opens on a `0fr`-`1fr` grid row, the chevron turns, and the open title turns semibold in its own width. | `variant`: `divided` (default), `plain`. Slots `root`, `item`, `heading`, `trigger`, `label`, `chevron`, `panel`, `body`, `content`. |
| `Alert` | `{ layout, title, description?, icon?, actions?, onDismiss?, dismissLabel? }`, and by `layout`: `'inline'` takes `assertive?` and is a live region inside the content, of something that just happened (`role="alert"` when assertive, `role="status"` otherwise); `'banner'` takes `label` and is a full-width strip across a page or a section, there on load, so a `section` landmark named by `label` rather than a live region, which would say nothing on load. Each action is `{ label, href }` (a link) or `{ label, onClick }` (a button); `onDismiss` draws a close button named `Dismiss <title>` inline, `Dismiss <label>` as a banner. The icon is `aria-hidden`. Whether it shows is the application's. The root writes `data-layout` and `data-dismissible`. | `tone`: `info` (default), `success`, `warning`, `error`; `emphasis`: `subtle` (default, the family's tint) or `bold` (its fill). Slots `root`, `icon`, `title`, `description`, `actions`, `action`, `dismiss`. |
| `AspectRatio` | `{ content? }`. Slot `frame`. | `ratio`: `square` (default), `video` (16/9), `portrait` (3/4). The corner reads `radius`. |
| `Avatar` | `{ name, src }`. Initials show until the image covers them. | `size`: `sm`, `md` (default), `lg`. Slots `root`, `fallback`, `image`. |
| `Badge` | `{ text, tone? }` writes `data-tone`. | `Recipes.Badge({ attribute, tones, appearance? })` maps that attribute; values outside the map keep the base. `appearance`: `tinted` (default), `dot`, `outline`, `solid`. Slot `badge`. |
| `Breadcrumb` | `{ steps: { label, href?, current?, icon? }[], separator?, collapse? }`. `current` is text with `aria-current="page"`; the others are links. An `icon` draws before its label, hidden from assistive technology. `separator` is drawn between steps in place of the recipe's; `collapse: { max, onExpand, label? }` folds the middle of a long trail into an ellipsis (`Breadcrumb.collapsedOf(steps, max)` is the split). | No axis. Slots `root`, `list`, `item`, `link`, `current`, `icon`, `separator`, `ellipsis`. |
| `ButtonGroup` | `{ label, items }`. `role="group"`. The buttons stay the caller's. `Segmented` is the control that selects. | No axis. Slot `root`. |
| `Card` | `{ title?, description?, content?, image?, media?, action?, footer?, press?, label?, selected?, disabled?, dismiss? }`. `press` is `{ onClick }` or `{ href, external? }`: one button or link stretched over the card, named by `label` or the title (a pressable card with neither throws); `action`, `footer` and the dismiss button stay pressable above it. `selected` is `aria-pressed` on the button, `aria-current` on the link. `dismiss: { onDismiss, label?, always? }` is revealed on hover and focus unless `always`, and always on a touch screen. The root carries `data-selected`, `data-disabled`, `data-pressable`, `data-dismissible` (the header then keeps clear of the button). | `orientation`: `stacked` (default), `inline` (image or media leading, footer trailing). `surface`: `outlined` (default), `elevated`, `filled`, `plain`. `padding`: `compact`, `comfortable` (default), `roomy`, `flush`. Slots `root`, `image`, `media`, `header`, `title`, `description`, `action`, `content`, `footer`, `overlay`, `dismiss`. |
| `Card.group` | `{ cards: (CardView & { key })[], columns?, fluidHover?, label?, cardStyle? }`. A keyed list of cards in `columns` (default 1); each item carries `data-row` and `data-column`. With `fluidHover` (default) one highlight follows the pointer to the nearest card through `FluidHover` from `foldkit-primitives/dom`, reading both directions when there is more than one column, and a press in a gap presses the highlighted card. `cardStyle` styles every card that names no style of its own. | `Recipes.CardGroup`: `layout`: `divided` (default, hairlines between rows and columns), `separated`. `border`: `none` (default), `outlined`. Use cards of `surface: 'plain'` inside. Slots `root`, `list`, `item`, `highlight`. |
| `Carousel` | The APG carousel, never rotating by itself: `Carousel.view({ id, label, slides, index, onIndex, loop?, picker?, slideLabel?, previousLabel?, nextLabel?, pickerLabel?, style? }, h)`. A group with `aria-roledescription="carousel"`, each slide a group named "2 of 5"; previous and next (`aria-disabled` at the ends unless `loop`), a dot per slide, and a polite status naming the slide shown. The track is a CSS scroll-snap scroller, so swipes move it natively. The application keeps `index` and answers `onIndex` with the `Carousel.ShowSlide({ id, index })` Command, which scrolls the slide into place once the render commits. A swipe is not reported back, so `index` stays where the last Message left it. | `peek`: `none` (default) or `edge`. Slots `root`, `track`, `slide`, `controls`, `previous`, `next`, `picker`, `dot`, `status`. |
| `CheckboxGroup` | `{ id, legend, options: { value, label, description?, disabled? }[], checked, onToggle }`; `CheckboxGroup.toggled(checked, value)` is the transition. A `fieldset` named by its `legend`, each option the APG's checkbox (`role="checkbox"`) named by a `label` for it, so a press on the words toggles it. | `variant`: `plain` (default), `list` (checked rows fill, and merge where they stand together). The checkbox and label are the Checkbox recipe's pieces. Slots `root`, `legend`, `option`, `checkbox`, `label`, `description`. |
| `CodeBlock` | `{ code, tokens?, language?, title?, lineNumbers?, copy? }`. `tokens` are `{ from, to, kind }`, as `foldkit-richtext-code` and `foldkit-richtext-code-shiki` tokenizers return them; each is drawn with `data-kind`, and a token out of order or outside the code throws. The block's text is the code exactly. `copy: { onCopy?, copied? }`: `onCopy` gets the code, so run `copyText` from `foldkit-primitives`; without it the button has no handler, for a page whose script copies. `CodeBlock.linesOf` is the cut. | No axis. Colors each kind from the theme's `syntax` group; `data-line-numbers` numbers lines, `data-copied` marks a copy done. Slots `root`, `header`, `title`, `copy`, `body`, `code`, `line`, `token`. |
| `ColorPicker` | `ColorPicker.view({ id, label, value, onChange, presets?, presetsLabel?, channelLabels?, disabled?, style? }, h)`: an OKLCH color (`ColorPicker.Oklch`, `{ l, c, h }`) as a `group` of three labelled native ranges, each saying its value with its unit in `aria-valuetext`, a swatch, the color as text, and `presets` as a `radiogroup` of native radios. `format`/`parse` (an `Option`) turn it to and from CSS text; `withChannel` sets one channel within its range. | `size`: `sm`, `md` (default), `lg`. Tracks paint gradients from the root's `--fk-color-l`/`-c`/`-h` by `[data-channel]`. Slots `root`, `label`, `swatch`, `value`, `channel`, `channelLabel`, `slider`, `presets`, `preset`. |
| `Command` | `{ id, label, placeholder?, groups: { heading?, items: { value, label, keywords?, shortcut?, disabled? }[] }[], query, onQuery, active, onActive, onRun, empty? }`; `Command.filtered(groups, query)` is what a query leaves. shadcn's Command and Fluid's CommandMenu: the field points at the highlighted row through `aria-activedescendant`, ↑ and ↓ wrap through enabled rows, Enter runs the highlighted one; rows never re-sort, and a filtered-away highlight moves to the first enabled row. With `overlayBars`, the list stands in a `frame` beside an overlay bar (see [Overlay scroll bars](#overlay-scroll-bars)). | No axis. Slots `root`, `input`, `list`, `group`, `heading`, `item`, `shortcut`, `empty`, and `frame`, `bar`, `thumb` with `overlayBars`. |
| `Calendar` | One date system, inline: `Calendar.Selection` is `Single`, `Range` or `Multiple`, owned by the application (`Calendar.empty(mode)`, fold each `SelectedDate` through `Calendar.picked`, `Calendar.isComplete` says when a picker may close). Draw with `Calendar.toView(selection, mixins, { h })` and `maybeSelectedDate: Calendar.selectedDate(selection)`, which marks each chosen day `aria-selected`: a range's ends `data-selected` with `data-range-start`/`data-range-end`, every day between `data-in-range`. | `size` (the Calendar's). Slots `CalendarSlots`. |
| `Empty` | `{ title, description?, icon?, action? }`. | No axis. Slots `root`, `icon`, `title`, `description`, `action`. |
| `HoverCard` (recipe) | Styles `@foldkit/ui`'s HoverIntent (`HoverIntentSlots`): a trigger read as a link, a raised panel fading in on the fast tier as it is drawn. Place the panel with the `Anchor` Mount; the open and close delays are HoverIntent's (200ms and 300ms by default). | No axis. Slots `trigger`, `panel`. |
| `Icon` | `{ content, label? }`. A `label` is `role="img"`; without one the glyph is `aria-hidden`. | `size`: `sm`, `md`, `lg` on the type scale; none (the default) stands on the size ladder, 16px or 14px compact. Slot `glyph`. |
| `InputCopy` | A read-only value with a copy button, Zag's clipboard: `InputCopy.view({ id, label, value, copied, onCopy, copyLabel?, copiedLabel?, style? }, h)`. The view is stateless: answer `onCopy` with the `InputCopy.Copy({ text })` Command, which yields `foldkit-primitives/dom`'s `ClipboardMessage` (`Copied` or `CopyFailed`, never a throw); the application sets and clears `copied`. The button is named `Copy <label>`; copied, it reads `Copied` and a polite status region says so. | No axis. Slots `root`, `label`, `group`, `input`, `button`, `status`. |
| `Item` | `{ content?, media?, title?, description?, actions? }`; `content` follows the title and description. | `density`: `comfortable` (default), `compact`. Slots `root`, `media`, `content`, `title`, `description`, `actions`. |
| `Kbd` | `{ key }`. Names the key. `Kbd.combo({ keys, joiner? }, h)` draws several in one `kbd`, with an optional joiner between them. | No axis. Slots `key`, `combo`, `joiner`. |
| `Label` | `{ for, text }`. `for` is the control's id. | No axis. Slot `label`. |
| `Menubar` | A row of `@foldkit/ui` Menus, shadcn's and the APG's menubar: `Menubar.view({ label, model, menus, onMessage, direction?, style?, menuMixins }, h)`, its Model (`Menubar.init(ids)`) folded with `Menubar.update`, whose `Selected` OutMessage names the menu and the row. One trigger is the tab stop; ArrowLeft/ArrowRight (Home/End while all are shut) move it, swapped under `direction: 'rtl'`, and with a menu open they open the next on its first row. While one is open, pointing at another opens it, and opening any shuts the rest. `Recipes.MenubarMenu` is the Menu recipe with a bar's flat triggers. | No axis. Slots `bar`, `menu`; each menu's are `MenuSlots`. |
| `Meter` | `@foldkit/ui`'s Meter: `Meter.view({ id, label, value, min?, max?, low?, high?, optimum?, valueText?, style? }, h)` draws a `meter` named by its label. The root says how good the value is as `data-level` (`good`, `fair`, `poor`), as the HTML meter judges it; `Meter.levelOf` is that judgment. A measurement, where `Progress` is work. | No axis; the fill takes success, warning or error by level. Slots `root`, `label`, `track`, `fill`. |
| `Nav` | `@foldkit/ui`'s Nav adapted: `Nav.toView(mixins, { h }, label, draw?)` as the Nav's `toView`, drawing `nav > ul > li > a` with the current link `aria-current="page"`; `Nav.fluid` beside the style glides a line to the current link and a faint pill to the one the pointer nears. shadcn's navigation menu without its dropdown panels; the keys are the browser's. | No axis. Slots `nav`, `list`, `item`, `link`, `indicator`, `highlight`. |
| `Menu` | One menu, opened three ways: `Menu.init(id, rows)` (a row with `items` hosts a submenu, one level deep), folded with `Menu.update`, drawn with `Menu.view({ model, rows, buttonContent, onMessage, opensAt?, direction?, isRowDisabled?, style?, mixins, submenuMixins? }, h)`. By a button (`opensAt` unset); at a point (`opensAt: 'point'`, with `Menu.target(onMessage, h)` on the area: a right press records its point and the `contextmenu` after it opens the menu there). A submenu's row is a `menuitem` with `aria-haspopup="menu"` and `aria-expanded`; ArrowRight, Enter or Space opens it on its first row, ArrowLeft or Escape closes it back to the row (under `direction: 'rtl'` the submenu opens on the left and the arrows swap), a pointer resting 150ms opens it, and choosing a leaf closes everything. `Selected` names the value and the submenu it came from. Pass `Menu.fluid` beside the style (in `submenuMixins`, not `mixins`, where rows open submenus). | No axis. Slots `MenuSlots` plus `sub`, `label`, `chevron`; with `overlayBars`, `scrollBar`, `scrollThumb`. |
| `NumberField` | `{ id, label, description?, value, onChange, min?, max?, step?, page?, format?, disabled? }`; `NumberField.settled(value, bounds)` clamps a value onto its step. The APG's editable spinbutton: an input with `role="spinbutton"` that the arrows, PageUp and PageDown, Home and End step, a typed number committing on change, between steppers out of the tab order that disable at their bound. | No axis. Slots `root`, `label`, `group`, `input`, `decrement`, `increment`, `description`. |
| `OtpField` | `{ label, value, onChange, length?, pattern?, groups?, disabled? }`; `OtpField.kept(text, length, pattern)` filters a code. shadcn's input-otp: one real input (`autocomplete="one-time-code"`, paste and Backspace the browser's) over cells that mirror it, the next cell marked `data-next` for its caret. | No axis. Slots `root`, `input`, `group`, `cell`, `separator`. |
| `Pagination` | `{ page, pageCount, onPage, label?, siblings?, boundaries?, numbered?, ends?, range? }`. Fewer than two pages draws nothing. `Pagination.itemsOf(page, pageCount, window?)` is the stops; `Pagination.summaryOf(page, { total, perPage, text? })` is `"1–10 of 97"`. `numbered: false` leaves previous and next alone; `ends` draws first and last. | No axis. The current stop reads `aria-current`. Slots `root`, `summary`, `first`, `prev`, `next`, `last`, `page`, `ellipsis`. |
| `PasswordInput` | `PasswordInput.view({ id, label, value, onInput, visible, onToggle, autocomplete?, toggleLabel?, description?, invalid?, disabled? }, h)`: a password field whose toggle button (`aria-pressed`, `aria-controls`, one fixed name) shows it as text. `autocomplete` is `current-password` (default) or `new-password`; spellcheck and autocorrect stay off. The app owns the text and the flag. | `size` (`sm`, `md`, `lg`). Input's pieces in InputGroup's box; the eye is `Icons.glyph` by `aria-pressed`. Slots `root`, `label`, `group`, `input`, `toggle`, `description`. |
| `Progress` | `@foldkit/ui`'s Progress: `Progress.view({ id, label, value, min?, max?, valueText?, style? }, h)` draws a `progressbar` named by its label. `value` is an `Option`; none is indeterminate, and the bar's fill sweeps toward the inline end, leftward right to left. The root carries the share done as `--fk-progress`. | `shape`: `bar` (default) or `ring`, Circular Progress. Slots `root`, `label`, `track`, `indicator`. |
| `Rating` | `Rating.view({ id, label, value, onChange, max?, starLabel?, readOnly?, disabled?, style? }, h)`: a `radiogroup` of native radios named by its label, one per star under one name, so the browser's arrows move the choice and a form submits it. `value` is an `Option`; none is unrated. Read-only, it is one `img` whose name says the rating. | `tone`: `warning` (default, gold) or `accent`; `size`: `sm`, `md`, `lg`. Stars are a CSS `clip-path` on each radio's `::before`; pointing previews the rating. Slots `root`, `label`, `star`. |
| `ScrollArea` | `{ content, overlayBars? }`. The height that makes it scroll is the caller's mixin, on `viewport` or `root`; a width goes on `root`, which the viewport fills and the bars lie over. The viewport is tabbable. With `overlayBars`, a bar per axis lies over the viewport's edge, driven by `ScrollBars` from `foldkit-primitives/dom`: a thumb that rests 4px wide, widens to 6px under the pointer, and fades once scrolling and the pointer rest; a coarse pointer keeps the browser's bar. See [Overlay scroll bars](#overlay-scroll-bars). | `orientation`: `vertical` (default), `horizontal`, `both`; `vertical` and `horizontal` fade the content toward an edge with more past it and draw a hairline there. Slots `root`, `viewport`, `bar`, `thumb`. |
| `Resizable` | `Resizable.Model` (`init(share)`), its `Message` and `update(model, message, bounds)`, which the application keeps and folds; `Resizable.view({ model, onMessage, label, first, second, orientation?, direction?, min?, max?, step? })`. shadcn's Resizable and the APG's window splitter: the handle is a `separator` with its value, stepped by the arrows and sent to the bounds by Home and End; a drag follows the `Move` Mount from where it began over the group the `Resize` Mount measured. Under `direction: 'rtl'` the first panel is on the right, so ArrowLeft and a drag to the left grow it. | No axis; `data-orientation` lays it out. Slots `root`, `first`, `handle`, `second`. |
| `Separator` | `{ orientation? }`, horizontal by default. A vertical rule needs its container to set the cross size. | `orientation`: `horizontal` (default), `vertical`. Slot `rule`. |
| `Sheet` (recipe) | Style `@foldkit/ui`'s Dialog (`DialogSlots`), drawn as a Dialog is, with `h.div(dialog.handle)` in the panel: the panel pinned to an edge of the viewport, sliding in from it on the slow tier as it fades (reduced motion keeps only the fade), bordered on the side facing the page. `handle: 'bar'` shows the handle on that edge (a row first or last in the panel from the bottom or top, a bar standing on the edge from the left or right) and rounds the inner corners: `Sheet({ side: 'bottom', handle: 'bar' })` is vaul's Drawer. The focus trap, Escape and backdrop dismissal stay the Dialog's. | `side`: `top`, `right` (default), `bottom`, `left`; `handle`: `none` (default), `bar`. Slots are `DialogSlots`. |
| `Sidebar` | `{ id, label, sections: { id, title, links: { label, href, current? }[] }[], open, onToggleSection, collapsed, onToggleCollapsed }`; `Sidebar.toggled(open, id)` flips a section. shadcn's sidebar with Fluid's collapse: a named navigation landmark of sections that open like an accordion's (several at once), a toggle that collapses the whole column off the page (no icon rail), the current page `aria-current`. Shut sections and a collapsed column stay drawn and `inert`. | No axis. Slots `root`, `toggle`, `nav`, `section`, `trigger`, `chevron`, `links`, `item`, `link`. |
| `Skeleton` | `{ label? }`. `role="status"`. Stack one bar per line. | `shape`: `bar` (default), `circle`. Slot `bar`. |
| `Slider` | `Slider.view({ id, label, value, onChange, min?, max?, step?, format?, marks?, showValue?, name?, disabled?, style? }, h)`, where `value` is a number or a `{ low, high }` range and `onChange` is handed the same kind. Native `input type="range"` thumbs, so drag, keys, right to left and the form value are the browser's. One number is one thumb across the track, named by the label; a press anywhere on the track moves it. A range is a `group` named by its label holding two thumbs named by `thumbLabels` (default `Minimum` and `Maximum`), each bounded by the other (the low one's `max` is the high value), so the browser stops a drag or a key at the other thumb; `Slider.moved(range, 'low' \| 'high', value, bounds)` snaps, bounds and orders a range, and returns the same range when nothing changed. `marks` are values dotted on the track (`data-filled` where the fill covers them) and `showValue` draws each value, both hidden from assistive technology, which hears `aria-valuetext`. `@foldkit/ui`'s Slider is not adapted: draw its Submodel with Slots of your own. | `tone`: `accent` (default) or `neutral`; `size`: `sm`, `md` (default), `lg`, the thumb's edge; `track`: `thick` (default; the fill reaches each thumb's far edge, Fluid's look) or `thin`; `value`: `above` (default) or `inside` (widens the thumb into a pill; best at `md` or `lg`). Slots `root`, `label`, `control`, `track`, `fill`, `mark`, `value`, `thumb`. |
| `Spinner` | `{ label? }`. `role="status"`. | `size`: `sm`, `md` (default). Slot `wheel`. |
| `Steps` | `Steps.view({ label, steps: { title, description?, icon?, content? }[], current, onSelect?, style? }, h)`: a stepper, an ordered list named by `label`. The step at `current` is `aria-current="step"`, those before it `data-state="complete"` (a check replaces the number), those after `upcoming`. An `icon` stands in the marker for its number; `content` follows the step, beside the line in a vertical stepper. With `onSelect(index)`, completed steps are buttons for going back; steps ahead never are. The application owns `current`. | `orientation`: `horizontal` (default) or `vertical`. Slots `root`, `item`, `step`, `trigger`, `marker`, `text`, `title`, `description`, `content`, `connector`. |
| `Table` | `{ columns: { header, value, numeric? }[], rows, caption?, fluid? }`. With `fluid`, one highlight behind the body rows follows the pointer, and the lines beside the lit row go. Sorting and selection stay with `foldkit-data-grid`. | No axis. Slots `frame`, `highlight` (with `fluid`), `root`, `caption`, `head`, `headerRow`, `headerCell`, `body`, `row`, `cell`. |
| `TagsInput` | Zag's tags input, a small Model of its own: `TagsInput.init({ id, tags?, delimiter? })`, folded with `TagsInput.update` (which returns a focus Command), drawn with `TagsInput.view({ model, onMessage, label, placeholder?, disabled? }, h)`. The tags are a list of chips named by the label, each with a `Remove <tag>` button, then a text input. Enter or the delimiter (default `,`) adds the draft split at the delimiter and trimmed, refusing empty and repeated parts; Backspace on an empty draft removes the last tag; a removal returns focus to the input. Keys reach `update`, which decides from its own draft. | No axis; `data-disabled` on `control`. Slots `root`, `label`, `control`, `list`, `tag`, `remove`, `input`. |
| `TreeView` | The APG's and Zag's tree view, a small Model of its own: `TreeView.init({ id, open? })`, folded with `TreeView.update(nodes)` (curried over the tree, flattened once), drawn with `TreeView.view({ label, model, nodes, onMessage, direction?, style?, mixins? }, h)` over nodes `{ id, label, children?, disabled? }`. One tab stop; Up/Down move through the rows showing, stepping over shut and disabled ones; Right opens or steps in, Left shuts or steps out (swapped under `direction: 'rtl'`); Home/End; a character moves to the next showing row that starts with it; Enter, Space or a click chooses a row and opens or shuts a branch. Keys reach `update`, which decides from its own Model and sends a focus Command. Each item carries `--fk-tree-level`; a shut group stays drawn and `inert`. | No axis; `data-state` on a branch `item` and its `group`. Slots `root`, `item`, `row`, `chevron`, `label`, `group`. |
| `Typography` | `{ level, text }`. The level chooses the element (`h1`–`h4`, `lead`, `body`, `small`, `muted`, `quote`, `code`, and the interface roles `display`, `title`, `subtitle`, `caption`, `micro` as paragraphs). | `level`, same set; a role is its size and leading on the size ladder. Defaults to `body`. Slot `text`. |
| `VirtualList` | `@foldkit/ui`'s virtual list: `VirtualList.view({ model, items, itemToKey, itemToView, onMessage, overscan?, itemToRowHeightPx? \| dynamicRowHeights?, style? }, h)` draws only the rows in view. Its Model is upstream's (`@foldkit/ui/virtualList`'s `init`), kept by the application and folded with that module's `update`. A row's mixins may style it, not handle its events, since it is drawn inside the list's submodel. With `overlayBars`, an overlay bar lies over the list's edge; `root` runs `ScrollBars` for upstream's list, which holds a Mount of its own. | No axis. Slots `root` (the box it scrolls within, 18rem tall by default), `row`, and `bar`, `thumb` with `overlayBars`. |

## Recipes

The adapters only name slots. `Recipes` gives those slots, and the vocabulary
above, a look: one `Style.recipeFor` per contract, built on the tokens of
`foldkit-mixins/theme`.
Select variants, hand the pieces to `Style.forSlots`, and attach the result
like any other Style:

```ts
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'

const DeleteStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'danger', variant: 'outline', size: 'sm' }),
)

const L = Layers.standard
const palette = Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } })

export const sheet = Style.stylesheet(
  L.declare,
  L.in('tokens', Theme.root(Theme.tokens)),
  L.in('theme', Theme.root(palette)),
  DeleteStyle,
)
```

`DeleteStyle.mixin` then goes to `Button.toView` as in the first example.

What a recipe assumes and does:

- **The page ships the tokens.** Every value is a `var(--fk-…)` reference to
  `Theme.tokens` or a `Theme.oklch` palette, so a scoped theme or a knob
  override restyles every recipe with no new CSS.
- **Bases sit in `components`, variants in `variants`** of `Layers.standard`,
  so an application's `app` layer overrides both without specificity fights.
  Every declaration is a layered rule and none is inline style, since inline
  style beats every layer and could not be overridden this way:

  ```ts
  const Red = Style.forSlots(ButtonSlots)(
    { button: Style.self({ background: 'red' }) },
    { layer: L.layer('app') },
  )
  // Style.stylesheet(L.declare, …, DeleteStyle, Red): Red's background wins.
  ```
- **Controls stand on one size ladder.** A button, a field, a select, a tab,
  a segmented control, a table row and the rows of a menu, listbox or
  combobox are all one rung tall: 36px by default and 28px compact, their
  padding, gap and text stepping with them (`Theme.ladder`, read on the
  element). `--fk-knob-step: 1` on any element makes everything inside it
  compact, the popups it opens included when they stay in the page (an
  anchor's `portal: false`, as the gallery's do); upstream portals a panel
  out of the page by default, where no region reaches it. A recipe's `size`
  (`sm` compact, `md` default, `lg` a half step up at 40px) sets the step on
  its own element and beats the region, and a popup's sets it on its panel
  too, so it holds portaled or not; unset, which is the default, follows the
  region. An icon, checkbox, radio or switch with no size stands on the
  ladder's icon rung, 16px or 14px compact.
- **Text comes in roles.** `Theme.role(name)` is a size and its leading,
  stepping with the ladder: `display`, `title`, `subtitle`, `body` (a
  control's text, 14px on 20), `caption` (badges, tooltips, a table's
  headings) and `micro` (keycaps). A tab's and a segmented option's label is
  trimmed to its capitals (`text-box`), centering it optically; a pressed
  segmented option and a chosen card title turn semibold without moving
  anything (the card writes its title in `data-label`; give an option its
  text there, `h.DataAttribute('label', 'Week')`, and draw its words in the
  `label` Slot, which holds the trim: on the option itself, the hidden copy
  took the trim's lower half); and a field's text is 16px on a coarse
  pointer, so iOS Safari does not zoom the page into it.
- **A state is a tint, not a surface.** A hover lays the palette's
  `state.hover`, a mix of the control's own text color, over whatever is under
  it, so it reads on a muted page, a colored band or an inverted panel; the
  neutral button is see-through (`state.tint`), and images carry a hairline
  inside their edge (`state.edge`). A popup's rows round concentrically inside
  its panel (`Theme.nested`), as a segmented option does inside its tray.
- **Popups and dialogs enter and leave** when drawn with `@foldkit/ui`'s
  `isAnimated` (`Menu.init({ id, isAnimated: true })`): a popup fades and
  grows on the fast tier, from the side its anchor placed it on, and a
  dialog on the slow one, each leaving on the quicker exit.
- **A press shrinks a button by 1px a side.** A solid or primary button's
  border carries its fill and clears while held, so the fill stands exactly
  1px in at any width; chosen rows next to each other in a multiple listbox or
  combobox merge into one block.
- **Raised surfaces nest.** Popups, popovers, date picker panels and toasts
  sit two levels above what holds them and dialogs four (`Theme.raise`), each
  painted for its level, so a popover in a dialog lands above the dialog: a
  step lighter in a dark scheme, the same flat surface with its own shadow in
  a light one.
- **State comes from the component's own attributes.** Checked, selected, and
  disabled looks read `aria-checked`, `aria-selected`, and `aria-disabled`,
  which `@foldkit/ui` already writes; no `whenInput` is needed.
- **Tone and variant are independent.** A tone sets a few private custom
  properties that `solid`, `outline`, and `ghost` read — except `primary`,
  which is ink by definition, and `icon`, a square one rung of the size
  ladder on a side. A tone
  also carries the line an `outline` draws: the fill, or for `neutral`, whose
  fill is a quiet grey, the page's default line. A neutral Checkbox or Switch
  that is on is in the page's ink, not the neutral grey, so it stands out
  without a color.
- **On a colored band, unfilled buttons take the band's color.** `outline` and
  `ghost` draw their text in the tone's ink, which reads on the page's surface
  and not on a band of the accent. A band sets
  `Style.vars({ '--fk-ink': 'currentColor' })`, beside `--fk-heading` for its
  headings, and their text is the band's.

Adjust a recipe with `extend` instead of forking it. Base pieces compose per
slot, a variant's pieces compose over the shipped ones, and compounds append:

```ts
const BrandButton = Recipes.Button.extend({
  base: { button: Style.class('brand-button') },
  variants: { size: { lg: { button: Style.class('brand-button-lg') } } },
})
```

`Recipes.Badge` is a function rather than a variant selection: one style serves
badges in every state, so every tone is present at once and there is no axis
to select. It takes the attribute carrying the value and the value-to-tone
map; values the map leaves out keep the base pill:

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

Like the variant recipes it reads `Theme.tokens` and `Theme.oklch` tokens and
keeps the base in `components` with each tone in `variants`. A toned pill is
grounded on its tone's `subtle`, which keeps the tone's hue over a tinted page.

`Recipes.InputGroup` draws a text field with a prefix or suffix, such as an
address's `/`, as one box: `group` carries the border, its hover and the
focus ring (while the control inside has focus), `affix` sits inside it,
muted, and `control` makes the input inside borderless. They are pieces for
your own group, affix and control slots, as `foldkit-mixins-form`'s field
publishes them:

```ts
const AddressStyle = Style.forSlots(FieldSlots)({
  group: Recipes.InputGroup.group,
  affix: Recipes.InputGroup.affix,
  text: Style.compose(Recipes.Input({}).input ?? Style.empty, Recipes.InputGroup.control),
})
```

`control` is in `variants`, so it wins over a `components` look on the same
slot; over a look of your own in a later layer, say the same in that layer.

`Recipes.Calendar` styles `CalendarSlots` in every mode: days in seven
columns, months and years in three, each button reading its state off the
cell (`data-today`, `data-selected`, `data-focused`, `data-outside-month`,
`data-disabled`). Each cell is a rung of the size ladder, so `size`
(`sm`, `md`) or the region steps it. It draws no card, so the same style serves a calendar on the page
and one in a date picker's panel.

Tabs glide when drawn with their `indicator` and `highlight` and given
`Tabs.fluid` beside the style. `Tabs.fluid` measures the chosen tab on the
tablist (`Measure`) and moves one highlight to the tab nearest the pointer
(`FluidHover`), born at the chosen tab and returning to it:

```ts
Tabs.toView([TabsStyle.mixin, ...Tabs.fluid], { h }, ({ tablist, indicator, highlight, tabs }) =>
  h.div(tablist, [h.div(indicator), h.div(highlight), ...tabs.map(tab => h.button(tab.tab, [tab.value]))]),
)
```

The recipe draws the `line` variant's rule or the `pill` variant's pill on the
indicator, which springs to a new choice, and dims the pill while another tab
is hovered. Until `Tabs.fluid` runs, as before a page hydrates, the indicator
and highlight show nothing and the chosen tab marks itself: the recipe reads
the `data-fluid-hover` attribute FluidHover sets while it runs. (`Tabs.fluid`
is opt-in because a Scene test resolves every Mount with a Message, and these
send none.)

Menus, listboxes and comboboxes draw their panels in the palette's `popup`
tokens, so a theme's `menu: { accent, color }` (a bold accent row, an
inverted or translucent panel) restyles all three. They take the same opt-in: `Menu.fluid`,
`Listbox.fluid` and `Combobox.fluid`, beside the style in `toView`. The open
panel's rows sit in a `rows` box of this package's (the panel carries
upstream's anchor, and an element holds one Mount), with a `highlight` first
in it that follows the pointer, and the keys, which mark a row `data-active`;
a listbox or combobox adds an `indicator` that glides to the chosen row. The
default draw places all three, and the rows drop their own hover and chosen
fill while the highlight runs. A press in a gap presses the lit row, except in
a combobox, whose field keeps focus.

```ts
Menu.toView([MenuStyle.mixin, ...Menu.fluid], { h })
```

### Overlay scroll bars

The scrolling recipes share one overlay bar, after Fluid Functionalism's: a
10px bar over the scroller's edge holding a thumb that rests 4px wide in a
faint ink of the text, 2px off the edge, widens to 6px under the pointer and
darkens while dragged. It fades in on `motion.moderate` while the box scrolls
or the pointer moves over it, and out on `moderate-exit` once both rest, after
a `moderate` delay that lets a widened thumb narrow first. The widening
travels, so reduced motion keeps the fades alone. `ScrollBars` from
`foldkit-primitives/dom` drives it and sends no Message; the bar is how it
looks, the Mount only where the box is scrolled. On a coarse pointer the Mount
does nothing, and the browser's bar, with its physics, stays; before it runs,
as before a page hydrates, so does the browser's bar.

Like `fluid`, it is opt-in, since a Scene test resolves every Mount with a
Message: `overlayBars: true` on `ScrollArea`, `Command` and `VirtualList`, and
`Menu.overlayBars`, `Listbox.overlayBars` and `Combobox.overlayBars` beside the
style for a popup whose list scrolls (given `itemsScrollAttributes`).

```ts
ScrollArea.view(
  {
    content: h.p([], ['A long text']),
    overlayBars: true,
    style: Style.forSlots(ScrollAreaSlots)(Recipes.ScrollArea({})),
  },
  h,
)
Listbox.toView([ListboxStyle.mixin, ...Listbox.fluid, ...Listbox.overlayBars], { h })
```

The bar is a Slot of each component's own (`bar` and `thumb`; a popup's
`scrollBar` and `scrollThumb`), beside the scroller rather than inside it, so
the scroller's edge fade does not erase it. A ScrollArea also marks an edge
with more past it with a hairline (`Utilities.scrollDivider` on `root`,
`Utilities.scrollTimeline` on `viewport`), drawn where the browser lets a
parent read a child's scroll timeline (`timeline-scope`).

`Recipes.Tabs({ variant: 'pill' })`'s chosen tab is the accent's tint and ink,
as a pressed Segmented option is. To look at every recipe in every variant and
state at once, in both schemes, write the specimen page:
`pnpm --filter foldkit-mixins-ui specimen <out.html> [hue]`.

`Recipes.Segmented` is a tray of toggle buttons where pressing selects — plain
buttons, not `Tabs` (the group is `role="group"`, each option `aria-pressed`).
The pressed option takes the accent's tint, flat: that rule lives on the
group, in `variants`, so icon tiles take the group piece alone, and an icon
button's own background, a variant too, does not hide it. `tray` is a muted tray or a plain row (which
sets no `display`: the Builder owns its narrow tabs' visibility); `size` steps
the tray and its options on the ladder (`xs` a half step below compact, 24px), the
tray's inset counted in, so a tray is as tall as a button beside it. Its `indicator` and `highlight` slots, drawn first in the group
and given `Segmented.fluid`, slide the pressed option's pill to a new press
and move a faint pill to the option the pointer is on; until it runs the
pressed option fills itself:

```ts
const SegmentedStyle = Style.forSlots(SegmentedSlots)(
  {
    group: Recipes.Segmented({ tray: 'plain', size: 'sm' }).group ?? Style.empty,
    option: Recipes.Segmented({ tray: 'plain', size: 'sm' }).option ?? Style.empty,
  },
  { layer: L.layer('app') },
)
```

`Segmented.view` draws the options in one call from the application's
pressed values, and `Segmented.toggled(pressed, value, { multiple, optional })`
is the transition `update` applies. With `multiple` it is a toggle group,
shadcn's and Zag's: any number pressed, each filling itself (draw it without
`Segmented.fluid`, whose pill marks one):

```ts
Segmented.view(
  {
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

## Mechanisms

`Touch` and `Icons` are style mechanisms, not components: no slots, no views.
Compose them into your own slots. `Touch.target` floors one control at 44px
where the pointer is coarse; `Touch.targets` floors every boxed control a
region draws. `Icons.glyph(size)` draws the icon in `--icon` before the
element's words, and `Icons.byAttribute(attribute, icons)` sets `--icon` from
an attribute's value, where `icons` maps each value to its resolved `url(…)`:

```ts
const TileStyle = Style.forSlots(TileSlots)(
  {
    tile: Style.compose(
      Touch.target,
      Icons.glyph('1rem'),
      Icons.byAttribute('data-block', { Hero: iconUrl('hero') }),
    ),
  },
  { layer: L.layer('app') },
)
```

## Accessibility patterns

Every adapter has an `A11y.pattern` beside its Slots, under `Patterns`: the
slots a widget of that kind must publish and what each must expose. The
catalog lists them with a `tier` (`stateful` for a Submodel, `stateless` for
a decorated native control), the ARIA `roles` involved, and the platform
`floor`: what the widget relies on the browser for (`focus-trap`,
`escape-dismiss`, `top-layer`, `form-submission`, ...), so nothing here
reimplements it and a reader or an agent can ask.

```ts
import { A11y } from 'foldkit-mixins'
import { Patterns } from 'foldkit-mixins-ui'

A11y.validate(Patterns.Tabs, MyTabsSlots) // [] when a custom tabs view publishes what tabs need
Patterns.catalog.find(entry => entry.name === 'dialog')?.floor // ['focus-trap', 'escape-dismiss', ...]
```

A test iterates the catalog and validates each adapter's own Slots against
its pattern, so an adapter cannot drift from the contract it claims. The
patterns are written separately from the Slots, which is what makes the
check mean something.

## Why some components needed a fork

The bridge needs a **consumer-visible attribute bundle**. `Listbox`,
`ComboBox`, `DatePicker`, and `Toast` build (parts of) their
element tree internally and expose no `toView`-style seam, so there is
nothing for Mixins to attach to — a limitation of the exposed render seam,
not of Slot resolution. Each is transcribed from the pinned `@foldkit/ui`
source (attributed in its module) with the missing `toView` added, as
described above; state, Messages, update, Commands, and Mounts stay
upstream in every case. If upstream gains seams, the forks go away. (`Menu`
used to be one; it is now this package's own component.)

`Listbox`, `Combobox` and `Calendar` draw the standard markup from the
styled bundles when `toView` is given no `draw`. `Menu.toView(mixins, { h }, draw?)`
draws the component's own markup through `drawMenu` without one
(`Menu.toView([MenuStyle.mixin], { h })` is a whole styled menu).
Pass a `draw` to arrange the parts yourself.

`DatePicker`'s bundles mix the popover's pre-bound groups with the date
picker's own attributes, so they speak only the date picker's Message. Its
`toView` therefore takes no builder of the application's:
`DatePicker.toView(mixins, (resolved, h) => …)` hands `draw` the date
picker's builder, and without a `draw` draws upstream's markup.

`MenuView` transcribes `@foldkit/ui/menu`'s markup assembly (from the
pinned `@foldkit/ui` source, attributed there) with the missing `toView`
added, and a parity battery draws both views over the same
models. If upstream gains a seam, the fork goes away. `Menu` itself
(`Menu.init/update/view`) is this package's own component over `@foldkit/ui`
Menus, as the Slider is. `Toast` follows the
same shape: `ToastView.make` binds upstream's `Toast.make` for the payload
and swaps in the transcribed view; the dismiss control stays inside the
consumer's `entryToView`, so it is content, not a slot. `Listbox` forks both
variants over one shared transcription (`ListboxView.create` and
`ListboxView.Multi.create` bind the upstream bundles; the single and multi
Models are structurally identical, so the single adaptor maps
`maybeSelectedValue` to `selectedValues` exactly as upstream's does). The
forks add one view input upstream lacks, `direction?: 'ltr' | 'rtl'`: under
`'rtl'` a horizontal listbox's ArrowLeft moves to the next item.
`Combobox` follows the same shape over its own shared transcription
(`ComboboxView.create` / `ComboboxView.Multi.create`).

`VirtualList`, `DragAndDrop`, and `Animation` do not have adapters here yet.

## Status

The API is still settling in the `0.x` series. This package should stay small:

```text
component state / accessibility -> @foldkit/ui
merge semantics                 -> foldkit-mixins
adapter metadata                -> foldkit-mixins-ui
```

If behavior starts moving from the component into this package, the abstraction
boundary is going in the wrong direction.

## See also

- [Inside-out view composition](../../docs/mixins.md) — Slot / Style / Behavior mental model.
- [`foldkit-mixins`](../mixins) — resolver and extension contracts.
- [`foldkit-mixins-surface`](../mixins-surface) — derives a SlotView boundary from a Surface.
- [`examples/todo-app`](../../examples/todo-app) — Button and Checkbox adapted in a complete application.

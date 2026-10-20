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

Three kinds of thing live here:

- **Adapters** add no state and no renderer of their own. They name an
  `@foldkit/ui` component's bundles as Slots and run the Mixins resolver over
  them: Button, Dialog, Popover, Tooltip, Tabs, Listbox, Combobox and more.
- **Stateless views** draw a vocabulary from what the application passes and
  keep nothing: Card, Badge, Item, Avatar, Command, Slider, PasswordInput.
- **Components with a small Model of their own**: Menu, Menubar, Toast,
  Sheet, Drawer, TagsInput, TreeView, Carousel, Resizable, ColorPicker, InputCopy,
  MessageScroller, Questionnaire, AngleSlider, Timer, Marquee, ImageCropper,
  SignaturePad, Chart, CascadeSelect, FloatingPanel and Tour.
  The Model holds interaction state only (what is open, a drag, a countdown,
  a draft), and the application keeps it and folds it with the component's
  `update`, as it folds an `@foldkit/ui` Submodel. The value chosen stays
  the application's.

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

An `icon` (an `svg`) draws before the label in the `icon` slot, hidden from
assistive technology; `Recipes.Button({ variant: 'icon' })` shows the icon
alone, the label still the button's name. `shape: 'square'` draws any other
variant as that square (an outlined icon button in a toolbar).

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

A textarea also takes what more than one line wants. The recipe's `resize` is
how it changes size: `auto` (the default) grows with its text from `rows`
lines (two unless given) to `maxRows`, then scrolls; `vertical` stays `rows`
lines tall and the reader drags it; `none` holds it. A `maxLength` caps the
text and counts toward it under the field, in the warning's ink from nine
tenths and the error's at the limit, and the count describes the textarea.
A `footer` draws the field as one box, a row of controls under the text and
the count at its end:

```ts
import { Button, Textarea } from 'foldkit-mixins-ui'

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

`Textarea.view` takes the same `rows`, `maxRows`, `maxLength`, and `count`,
and hands `draw` the `count`, `frame`, `footer` and `meta` bundles to place;
`Textarea.countOf(value, maxLength)` is the count's text. `resize: 'auto'`
rests on CSS `field-sizing`, which sizes the width by the text too where
nothing else gives one (it keeps at least 20 columns); a browser without it
keeps the textarea at its fewest lines, scrolling.

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
| Textarea | `textarea`, `label`, `description`, `count`, `frame`, `footer`, `meta` |
| Select | `select`, `label`, `description`. The native `<select>`; the recipe draws its own chevron and mutes a chosen placeholder. For icons, descriptions, groups or a check in the list, draw a Listbox as a custom select with `Listbox.parts` (below) |
| Checkbox | `checkbox`, `label`, `description`, `hiddenInput` |
| Switch | `button`, `label`, `description`, `hiddenInput` |
| Fieldset | `fieldset`, `legend`, `description` |
| Disclosure | `button`, `panel` |
| Dialog | `dialog`, `backdrop`, `panel`, `title`, `description`, `initialFocus`, `closeButton`, and this package's `handle` (the Sheet's grabber, `aria-hidden`), `body`, `scroll`, `scrollBar`, `scrollThumb` and `footer`: draw `scroll` and its bar inside `body` and the answers in `footer`, and a body taller than the screen scrolls under the title while the footer stays (`Dialog.overlayBars` beside the style draws the overlay bar). `Dialog.keyboard` among the mixins of a dialog or sheet that holds a field measures the on-screen keyboard on the panel, and the recipes keep the panel above it (a Dialog shrinks, a bottom Sheet stands on it): iOS Safari and Chrome on Android otherwise leave it under the keys. An alert dialog is this one with `role: 'alertdialog'` in its context (`Dialog.toView(mixins, { h, role: 'alertdialog' }, draw)`), which puts `role="alertdialog"` on the `dialog` bundle; draw no close button, and drop the Messages `Dialog.isDismissal` names (Escape, the backdrop, the close button) in `update`, so only its own buttons, closing with `@foldkit/ui`'s `close`, answer it. `covered: true` in the context marks the panel `data-covered`, for a dialog another was opened from (draw the second inside the first's `dialog`, beside its panel), and the recipe steps it back; `attributes` adds to a bundle before the mixins resolve. Recipe `size`: `sm`, `md` (default), `lg`, `xl`, `full` |
| Popover | `button`, `panel`, `backdrop`, `arrow`, and this package's `layer`, drawn around the panel to show it in the top layer (see [The top layer](#the-top-layer)); `Popover.anchor(config?)` is the placement. Recipe `arrow`: `shown` (default), `none` |
| Tooltip | `trigger`, `panel`, `arrow`, and this package's `layer`. `Tooltip.toView(mixins, { h, id }, draw)` takes the Tooltip's id (`model.id`), whose trigger the arrow points at; `Tooltip.anchor(config?)` is the placement, above by default. Recipe `arrow`: `shown` (default), `none` |
| HoverIntent | `trigger`, `panel`, `arrow` (open and close delays with intent, for a hover card or a menu). `anchored: { id, anchor? }` in the context anchors the panel to the trigger in the top layer (`HoverIntent.anchor()` unless given), the trigger taking `HoverIntent.triggerId(id)` |
| Tabs | `tablist`, `tab`, `panel`, and this package's `indicator` and `highlight` (drawn first in the tablist, for `Tabs.fluid`). and this package's `item`, `label`, `icon` and `close`: a tab is a flex row, so draw its words in `label` (`h.span(label, [words])`) and an icon in `icon`, a Badge after them for a count. `TabsContext.close: { onClose }` makes tabs closable: each gets a close button (no tab stop, hidden from assistive technology) and Delete, named in `aria-keyshortcuts`; answer with `Tabs.closing(tabs, chosen, closed)`, which gives the tabs left, the tab chosen and the index to focus with `FocusTab`. `Tabs.readingKeys` beside the style reads the arrow keys by the tablist's direction (see [Right to left](#right-to-left)). Recipe axes `variant`: `line` (default), `pill`; `size`: `sm`, `md`, `lg`; `overflow: 'scroll'` (one line, its edges fading); upstream's `orientation: 'Vertical'` stands the rule at the tabs' inline end |
| RadioGroup | `group`, `option`, `label`, `description`, `hiddenInput`, and this package's `card`. Upstream's `option` is a `button` and its `label` bundle only an id, so a bare `label` takes no press: draw each row as a `label` element around its `option`, carrying the option's `card` bundle (`h.label(option.card, [h.button(option.option, []), …])`), and the browser sends a press on the words to the radio. `card` is `data-checked` while its option is. The recipe stacks the group unless `aria-orientation` is `horizontal`, and a row wraps. `variant: 'card'` frames each card and fills the one whose radio is checked. `tone`: `accent` (default), `neutral`; `size`: `sm`, `md`, `lg`. `RadioGroup.readingKeys` as Tabs' |
| Anchor | a Mount and a Behavior over `@foldkit/ui/anchor`: `Anchor.behavior(Slots)({ floating, config })` positions a floating slot against a button by id; `Anchor.topLayer(mount)` shows an in-place panel in the top layer around it (see [The top layer](#the-top-layer)) |
| Calendar | `root`, `header` (the heading's row, this package's own), `grid`, `headerRow`, `previousMonthButton`, `nextMonthButton`, `headingButton`, `previousPageButton`, `nextPageButton`, `columnHeader`, `weekRow`, `dayCell`, `dayButton`, `monthCell`, `monthButton`, `yearCell`, `yearButton`. `Calendar.readingKeys` as Tabs' |
| Menu | `wrapper`, `button`, `backdrop`, `items`, `scroll`, `item`, `group`, `heading`, `separator`, and this package's `rows`, `highlight`, `scrollBar` and `scrollThumb` (while the panel has a `scroll`), `label`, `sub` and `chevron` (the component's rows) (over the `MenuView` fork; see [Why some components needed a fork](#why-some-components-needed-a-fork)) |
| FileDrop | `root`, `input` |
| Toast | `container`, `entry` (over the `ToastView` fork; the dismiss control stays inside the consumer's `entryToView`), and the slots the `Toast` component draws (see the vocabulary below) |
| Listbox | `wrapper`, `button`, `backdrop`, `items`, `scroll`, `item`, `group`, `heading`, `separator`, and this package's `rows`, `highlight`, `indicator`, `scrollBar`, `scrollThumb`, and an option's and the trigger's parts (`itemIcon`, `itemLabel`, `itemDescription`, `itemCheck`, `value`, `valueText`, `chevron`, …) (over the `ListboxView` fork; single and multi share one transcription). A custom select is a Listbox drawn with `Listbox.parts(mixins, { h })`: `part.option({ label, description?, icon? })` as an item's content and `part.trigger(chosen, placeholder)` as the button's, its value or the placeholder (muted, `data-placeholder`) and a chevron. Recipe axes `width`: `auto` (default) or `trigger`; `check`: `end` (default), `start`, `none`; `trigger`: `outline` (default), `filled`, `ghost`; `size`: `sm`, `md`, `lg` |
| Combobox | `wrapper`, `inputWrapper`, `input`, `toggleButton`, `backdrop`, `items`, `scroll`, `item`, `group`, `heading`, `separator`, and this package's `rows`, `highlight`, `indicator`, `scrollBar`, `scrollThumb`, `chips`, `chip`, `chipRemove`, `clearButton`, `empty` and an option's parts (over the `ComboboxView` fork; single and multi share one transcription). The view inputs add `chips: { label?, removeLabel? }` (each chosen value a chip in the field, its remove button choosing it again, which a multiple combobox toggles off: with `ComboboxView.Multi`, a tags field with suggestions), `clearContent` and `clearLabel` (a clear button while the field has text) and `empty` (shown, as a polite status, in the list's place while open with nothing to list; a loading line too). `Combobox.parts(mixins, { h }).option(content, query)` marks the typed text in an option's label. Recipe axis `width`: `trigger` (default) or `auto` |
| DatePicker | `trigger`, `panel`, `backdrop` (over the `DatePickerView` fork, which keeps upstream's Popover+Calendar composition and seams only the popover assembly). A range or many days in the popover: see [Why some components needed a fork](#why-some-components-needed-a-fork) |

## Views and components of this package

These views take no `@foldkit/ui` bundle. Call `X.view(options, h)`. Most own no
Model and no Message; the components among them that keep a small Model
(Menu, Menubar, Toast, Sheet, Drawer, TagsInput, TreeView, Carousel, Resizable,
ColorPicker, InputCopy, MessageScroller, Questionnaire, AngleSlider, Timer,
Marquee, ImageCropper, SignaturePad, Chart, CascadeSelect, FloatingPanel,
Tour) say so, with its `init` and `update`.
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
| `Accordion` | `{ id, items: { id, title, content, disabled? }[], open, onToggle, headingLevel? }`; `Accordion.toggled(open, id, { multiple?, collapsible? })` is the transition `update` applies, the open ids being the application's. Each trigger is a button in a heading naming its panel; a shut panel stays drawn and `inert`. The panel opens on a `0fr`-`1fr` grid row, the chevron turns, and the open title turns semibold in its own width. The view takes an `icon` in place of the recipe's. | `variant`: `plain` (default), `bordered`, `separated`, `filled`, `ghost`; `separators`: `on` (default, between sections only), `off`; `indicator`: `chevron` (default), `plus`; `indicatorPosition`: `end` (default), `start`; `active`: `none` (default), `trigger`, `item` (the open section tinted). Slots `root`, `item`, `heading`, `trigger`, `label`, `chevron`, `icon`, `panel`, `body`, `content`. |
| `Alert` | `{ layout, title, description?, icon?, actions?, onDismiss?, dismissLabel? }`, and by `layout`: `'inline'` takes `assertive?` and is a live region inside the content, of something that just happened (`role="alert"` when assertive, `role="status"` otherwise); `'banner'` takes `label` and is a full-width strip across a page or a section, there on load, so a `section` landmark named by `label` rather than a live region, which would say nothing on load. Each action is `{ label, href }` (a link) or `{ label, onClick }` (a button); `onDismiss` draws a close button named `Dismiss <title>` inline, `Dismiss <label>` as a banner. The icon is `aria-hidden`. Whether it shows is the application's. The root writes `data-layout` and `data-dismissible`. | `tone`: `info` (default), `success`, `warning`, `error`; `emphasis`: `subtle` (default, the family's tint) or `bold` (its fill). Slots `root`, `icon`, `title`, `description`, `actions`, `action`, `dismiss`. |
| `AngleSlider` | After Zag's: a dial in degrees, 0 at the top and clockwise. `AngleSlider.init({ id, value? })` is the angle and the drag, folded with `AngleSlider.update(layout)`, where `layout` (`step`, `largeStep`, `marks`, `restrictToMarks`) is the object the view spreads in too: `AngleSlider.view({ ...layout, model, onMessage, label, name?, format?, valueText?, showValue?, disabled?, readOnly?, invalid?, style? }, h)`. A press or drag on the dial sends `Pointed` and `Released`; the APG's slider keys reach `update` as what was pressed, and go round past 0. A `name` draws a hidden input for a form. | `tone`, `track` (`ring`, `plain`, `disc`), `value` (`inside`, `below`), `size`. Slots `root`, `label`, `control`, `needle`, `thumb`, `markers`, `marker`, `markerLabel`, `value`, `input`. |
| `AspectRatio` | `{ content? }`. Slot `frame`. | `ratio`: `square` (default), `video` (16/9), `portrait` (3/4). The corner reads `radius`. |
| `Avatar` | `{ name, src?, initials?, status?, statusLabel? }`. The root is one `role="img"` named by the person (and the status, "Ada Lovelace, Online"); initials show until the picture covers them, the picture's alt empty. `status` (`online`, `away`, `busy`, `offline`) is a dot on the lower end corner. `src` may be an `AvatarPicture` (`{ asset, provider, width }` from `foldkit-media`): the picture is drawn with its 1x and 2x candidates at `width` CSS pixels, and a provider with no URL for it leaves the initials. `Avatar.group({ people, max?, label?, moreLabel?, style?, avatarStyle? })` overlaps them, each ringed in the page, and counts the rest as one more avatar. An avatar beside a name and a line is an `Item` with the avatar as its media. | `size`: `xs`, `sm`, `md` (default), `lg`, `xl`; `shape`: `circle` (default), `rounded`, `square`; `color`: `neutral` (default) or `name` (initials in a hue from the name); `ring`: `none`, `page`, `accent`. Slots `root`, `fallback`, `image`, `status`. `Recipes.AvatarGroup({ overlap: 'tight' \| 'loose' \| 'none' })` over `AvatarGroupSlots` (`root`). |
| `Image` | `{ asset, provider, layout, alt, priority?, sizes? }` from `foldkit-media`: a `picture` with a `source` per format the provider offers and an `img` with its candidates, `sizes`, `width` and `height` (the box is held before the file arrives), lazy unless `priority` (then `fetchpriority="high"`). `alt` is `Image.described(text)` or `Image.decorative` (`alt=""`, `role="presentation"`), never omitted. The `img` carries `--fk-image-ratio`, `--fk-image-placeholder` (none behind a transparent image) and `data-layout` (`fixed`, `constrained`, `full`); a provider with no URL for the image leaves an empty frame marked `data-unavailable`. An unavailable image keeps its box and is `role="img"` named by its alt text (hidden when decorative). `--fk-image-focus` places a crop at the asset's focal point. `placeholder: 'detail' | 'average'` chooses how much of a ThumbHash to paint; by default the picture for `priority`, the color otherwise. `Image.watchLoad`, beside the style, marks the `img`'s `data-state` (`loading`, `loaded`, `failed`); the recipe hides a failed image, keeping its box. `Image.preloadsIn` is a `foldkit-ssr` `Head`: the `<link rel="preload">` of each image the rendered page drew with `priority`. | `fit`: `cover` (default) or `contain`; `edge`: `none` (default) or `line` (the faint inset line); `ratio`: `auto` (default), `square`, `video` (16:9), `portrait` (3:4), cropped at the asset's focal point (an unavailable image holds the cropped box); `radius`: `none` (default), `sm`, `md`, `lg`, `full`. The placeholder paints the `img`'s background. Slots `frame`, `source`, `image`. |
| `Badge` | `{ text, tone? }` writes `data-tone`. | `Recipes.Badge({ attribute, tones, appearance? })` maps that attribute; values outside the map keep the base. `appearance`: `tinted` (default), `dot`, `outline`, `solid`. Slot `badge`. |
| `Breadcrumb` | `{ steps: { label, href?, current?, icon? }[], separator?, collapse? }`. `current` is text with `aria-current="page"`; the others are links. An `icon` draws before its label, hidden from assistive technology. `separator` is drawn between steps in place of the recipe's; `collapse: { max, onExpand, label? }` folds the middle of a long trail into an ellipsis (`Breadcrumb.collapsedOf(steps, max)` is the split). `collapse: { max, menu: { model, onMessage, mixins } }` makes the ellipsis open a Menu of the hidden steps instead: the Menu's Model is the application's, built from `Breadcrumb.menuRows(steps, max)`, and `Breadcrumb.chosen(steps, max, value)` is the step a row leads to. | `separator`: `slash` (default), `chevron` or `dot`, drawn where the view is given no `separator` of its own. Slots `root`, `list`, `item`, `link`, `current`, `icon`, `separator`, `ellipsis`, `dots`. |
| `ButtonGroup` | `{ label, items, orientation?, separated? }`. `role="group"`, joining its items: borders overlap by one and only the outer corners stay round. An item is the caller's button, field or Menu (a wrapper passes the corners to the face it holds), or a string, drawn in the `text` box (a count, a field's prefix). `orientation: 'vertical'` stacks them; `separated` draws a rule on every seam, for solid buttons whose fills meet. A hovered or focused item rises over its neighbour. `Segmented` is the control that selects. | `size`: `sm`, `md`, `lg`, for every item with no size of its own; `width: 'fill'` spans the container, a field taking what the buttons leave. Slots `root`, `separator`, `text`. |
| `Calendar` | One date system, inline: `Calendar.Selection` is `Single`, `Range` or `Multiple`, owned by the application (`Calendar.empty(mode)`, fold each `SelectedDate` through `Calendar.picked`, `Calendar.isComplete` says when a picker may close). Spread `Calendar.inputs(selection, mixins, { h })` into upstream `Calendar.view`'s inputs: its `toView` (`Calendar.toView(selection, mixins, { h })`) marks each chosen day `aria-selected`, a range's ends `data-selected` with `data-range-start`/`data-range-end` and every day between `data-in-range`, and its `maybeSelectedDate` (`Calendar.selectedDate(selection)`, a Single selection's day) agrees with it. The grid of a Range or Multiple selection is `aria-multiselectable`. A selection in a popover is the DatePicker's. Options, the fourth argument of `toView`, `inputs` and `resolve` (`CalendarOptions`): `weekNumbers`, `caption: 'label'` or `dropdowns: { model, onShow }` (month and year selects; answer `onShow` with `Calendar.show`), `paging` with `Calendar.alongside(model, other, offset)` for two months side by side, `preview: { date, onPreview }` for a range under the pointer, and `detail: date => Option<string>` for a line under a day's number (a price, "2 events") that describes its button; `ResolvedDayCell.detail` holds it. `ResolvedDays`' paging buttons are `Option`s and its heading is a `caption` (`Grid`, `Label`, `Dropdowns`). Presets: `Calendar.lastDays`, `nextDays`, `monthOf`, `day`, drawn by `Calendar.presetsView`. `Calendar.localeOf('de-DE')` reads upstream's `locale` from Intl. | `size` (the Calendar's); `outside`: `shown` (default), `hidden`; `detail`: `text` (a taller rounded day holding the line), `dot` (the line as a dot, its words left to a screen reader), unset by default. Slots `CalendarSlots`. |
| `Card` | `{ title?, description?, content?, image?, media?, action?, footer?, press?, label?, selected?, disabled?, dismiss? }`. `press` is `{ onClick }` or `{ href, external? }`: one button or link stretched over the card, named by `label` or the title (a pressable card with neither throws); `action`, `footer` and the dismiss button stay pressable above it. `selected` is `aria-pressed` on the button, `aria-current` on the link. `dismiss: { onDismiss, label?, always? }` is revealed on hover and focus unless `always`, and always on a touch screen. The root carries `data-selected`, `data-disabled`, `data-pressable`, `data-dismissible` (the header then keeps clear of the button). | `orientation`: `stacked` (default), `inline` (image or media leading, footer trailing). `surface`: `outlined` (default), `elevated`, `filled`, `plain`. `padding`: `compact`, `comfortable` (default), `roomy`, `flush`. `elevation`: `0` to `3`, a step of the surface ladder (lighter in a dark scheme; a contact and an ambient shadow in a light one). `lift`: `none` (default) or `hover`, a lift under the pointer that `travel` stills (not in a `Card.group` with a highlight, which is the hover there). `Card.overlay` is the stretched press control, shared with Item. Slots `root`, `image`, `media`, `header`, `title`, `description`, `action`, `content`, `footer`, `overlay`, `dismiss`. |
| `Card.group` | `{ cards: (CardView & { key })[], columns?, fluidHover?, label?, cardStyle? }`. A keyed list of cards in up to `columns` (default 1), which wraps to fewer where a column would be narrower than the recipe's `minColumn`; the root carries `--fk-card-columns` and `data-card-fluid`. With `fluidHover` (default) one highlight follows the pointer to the nearest card through `FluidHover` from `foldkit-primitives/dom`, reading both directions when there is more than one column, and a press in a gap presses the highlighted card. `cardStyle` styles every card that names no style of its own. | `Recipes.CardGroup`: `layout`: `divided` (default, hairlines between cards, wherever the row wraps), `separated` (apart, for cards with a surface). `minColumn`: `none`, `sm`, `md` (default), `lg`, the narrowest a column may be (10, 14, 18rem); `none` keeps every column at any width. `border`: `none` (default), `outlined`. The highlight is a film over the card the pointer is on, and is that card's hover: a card in a group with one draws no hover of its own, whatever its `surface`. Divided cards are usually `surface: 'plain'`. Slots `root`, `list`, `item`, `highlight`. |
| `Carousel` | The APG carousel: `Carousel.init({ id, slide?, autoplay?, delay? })`, folded with `Carousel.update({ count, perView?, loop? })`, drawn with `Carousel.view({ label, model, slides, onMessage, loop?, perView?, picker?, thumbnails?, slideLabel?, previousLabel?, nextLabel?, pickerLabel?, rotationLabels?, style? }, h)`. A group with `aria-roledescription="carousel"`, each slide a group named "2 of 5"; previous and next (`aria-disabled` at the ends unless `loop`), a dot per place the track can rest (or `thumbnails` in their place), and a polite status naming the slide shown. The track is a CSS scroll-snap scroller, so swipes move it natively, and `ScrollSettle` reports where a swipe rests, so the dots follow the finger. Every press, swipe and timer reaches `update`, which returns the `Carousel.ShowSlide` Command that scrolls the track: do not keep the slide yourself. With `autoplay` it moves on every `delay` (4s), the current dot filling as it waits; it pauses under the pointer, stops when focus arrives by the keys, quiets its status while it rotates, and draws the APG's rotation button first. | `peek`: `none` (default) or `edge`. Slots `root`, `track`, `slide`, `controls`, `rotation`, `previous`, `next`, `picker`, `dot`, `thumbnail`, `status`. |
| `CascadeSelect` | After Zag's: one value chosen as a path of ids through nested options. `CascadeSelect.init({ id })` holds the chosen path and the one the keys are on while open, folded with `CascadeSelect.update(config)` (`config` is `{ nodes, parents?, closeOnSelect?, loop? }`, the same object the view takes): `CascadeSelect.view({ model, config, onMessage, label, placeholder?, levels?, layout?, expandOn?, clearable?, separator?, name?, disabled?, invalid?, direction?, style? }, h)`. The trigger is a combobox opening a top-layer APG tree, a column per level or one level at a time (`layout: 'drill'`; the columns also drill in on their own when they would not fit the window, measured as the popup opens); the arrows move within and between levels (swapped right to left), Home, End and a letter jump, Enter and Space choose, and only an option without children is chosen unless `parents` allows any. | `size`, `trigger` (`outline`, `filled`, `ghost`), `width` (`trigger`, `auto`). Slots `root`, `trigger`, `valueText`, `chevron`, `clear`, `input`, `layer`, `backdrop`, `panel`, `column`, `heading`, `back`, `item`, `itemText`, `branch`. |
| `Chart` | After shadcn's Chart: `Chart.view({ id, label, kind: 'bar' \| 'line' \| 'area', categories, series: [{ name, values, color? }], model, onMessage, description?, format?, legend?, table?, categoryLabel?, style? }, h)`, or `kind: 'donut'` with `slices: [{ name, value, color? }]` and `totalLabel?`. The value axis's ticks are round and reach both ends, zero included; the plot is drawn in percentages, so it fills its container's width with nothing measured and renders the same on a server. `Chart.Model` (`Chart.init()`, folded with `Chart.update`) holds the lit point: the pointer lights a category's band and its tooltip, and the plot is a tab stop whose arrows, Home and End step through the points while a polite status says each. The drawing is hidden from assistive technology, which reads a data table, visually hidden unless `table: 'shown'`. Series take `chart-1` to `chart-5` in order, or the `color` they name; a sixth series throws. | `height` (`sm`, `md`, `lg`), `grid` (`lines`, `zero`), `indicator` (`dot`, `line`). Slots `root`, `title`, `description`, `legend`, `legendItem`, `swatch`, `body`, `yAxis`, `xAxis`, `yTick`, `xTick`, `plot`, `canvas`, `paths`, `grid`, `cursor`, `bar`, `line`, `area`, `dot`, `slice`, `band`, `center`, `centerValue`, `centerLabel`, `tooltip` and its parts, `status`, `table` and its parts. |
| `ChatMessage` | One message of a chat: `ChatMessage.view({ from, content, author?, avatar?, time?, status?, onRetry?, actions?, pinActions?, streaming?, style? }, h)`, `from` being `user`, `assistant` or `system`. The user's sits at the end in a bubble, an answer as text at the start. `status` is `sending`, `sent` or `failed`, which draws a retry; `actions` are named buttons (`{ key, label, onClick, icon?, pressed?, disabled? }`) shown on hover and focus unless pinned. A streamed answer is the same message drawn again with more `content` and `streaming: true` (`aria-busy`); its body wraps with `text-wrap: wrap`, so no earlier word moves line. `ChatMessage.group({ items, continues?, style?, messageStyle? }, h)` draws a run, a sender's following messages continued. Markdown is the application's to render (`foldkit-richtext-markdown`'s `parse`, `foldkit-richtext-dom/view`'s `renderDocument`). | `layout` (`chat`, `thread`), `bubble` (`muted`, `accent`), `content` (`text`, `markdown`). `Recipes.ChatMessageGroup` for the group. Slots `root`, `avatar`, `main`, `header`, `author`, `time`, `bubble`, `body`, `footer`, `status`, `retry`, `actions`, `action`. |
| `CheckboxGroup` | `{ id, legend, options: { value, label, description?, disabled? }[], checked, onToggle, error?, selectAll? }`; `toggled(checked, value)` is one option's transition, `coverage(options, checked)` is `none` \| `some` \| `all` (a disabled option counts for neither), and `setEnabled(options, checked, on)` is every enabled option or none, a disabled one keeping the state `checked` gives it. `selectAll: { label, onSet }` draws a first row whose checkbox is checked, `mixed` or unchecked by `coverage` and controls every option; a press sends `onSet` with `setEnabled`'s values, on unless all already are. A `fieldset` named by its `legend`, each option the APG's checkbox (`role="checkbox"`) named by a `label` for it, so a press on the words toggles it. `error` is shown under the options and the group is `aria-invalid`, described by it. | `variant`: `plain` (default), `list` (checked rows fill, and merge where they stand together; a vertical list has no gap, or the block would split). `orientation`: `vertical` (default), `horizontal` (a wrapping row). The checkbox sits on the label's row, so a description does not pull it down. Slots `root`, `legend`, `options`, `option`, `checkbox`, `label`, `description`, `error`. |
| `CodeBlock` | `{ code, tokens?, language?, title?, lineNumbers?, copy? }`. `tokens` are `{ from, to, kind }`, as `foldkit-richtext-code` and `foldkit-richtext-code-shiki` tokenizers return them; each is drawn with `data-kind`, and a token out of order or outside the code throws. The block's text is the code exactly. `copy: { onCopy?, copied? }`: `onCopy` gets the code, so run `copyText` from `foldkit-primitives`; without it the button has no handler, for a page whose script copies. `CodeBlock.linesOf` is the cut. | No axis. Colors each kind from the theme's `syntax` group; `data-line-numbers` numbers lines, `data-copied` marks a copy done. Slots `root`, `header`, `title`, `copy`, `body`, `code`, `line`, `token`. |
| `ColorPicker` | After ReUI's: a saturation and brightness area, hue and alpha Sliders, an eyedropper where the browser has one (`ColorPicker.Eyedrop`, `canEyedrop`), text in hex, rgb, hsl or oklch, and `presets` as a radio group of swatches. The color, its format and a draft being typed are `ColorPicker.Model` (`init({ id, color?, format? })`), folded with `ColorPicker.update`: keys and drags reach `update` as what was pressed, so fast keys each step from the last color. Drawn with `ColorPicker.view({ model, onMessage, label, presets?, alpha?, eyedropper?, labels?, disabled?, style?, slider? }, h)`; `ColorPicker.popover(options, h)` is a Popover's `toView` that draws it behind a swatch. `ColorPicker.color('#3b82f6')` reads a literal in code (it throws on a typo); `format`, `parse` (an `Option`) and `toOklch` are pure. | `size`. Its Sliders take `Recipes.Slider({ track: 'paint', label: 'hidden' })`. Slots `root`, `label`, `area`, `areaThumb`, `controls`, `eyedropper`, `channels`, `channel`, `swatch`, `fields`, `format`, `input`, `presets`, `preset`, `picker`, `trigger`, `value`. |
| `Command` | `{ id, label, placeholder?, groups: { heading?, items: { value, label, description?, keywords?, shortcut?, icon?, opensPage?, disabled? }[] }[], query, onQuery, active, onActive, onRun, empty?, loading?, page?, hints?, kbd? }`, a `shortcut` being a tuple of keys (`['⌘', 'K']`) drawn as Kbd with `kbd`. `page: { trail, onBack }` draws the pages stepped into as crumbs before the field, and Backspace in an empty field sends `onBack`; a row with `opensPage` has a chevron. `loading` says it and marks the list `aria-busy`, its rows still shown; `hints` are a footer of keys. `Command.hotkey(message)` is ⌘K or Ctrl+K anywhere, for an application to lift with `Subscription.persistentEntry` and open its Dialog on; `Command.filtered(groups, query)` is what a query leaves. shadcn's Command and Fluid's CommandMenu: the field points at the highlighted row through `aria-activedescendant`, ↑ and ↓ wrap through enabled rows, Enter runs the highlighted one; rows never re-sort, and a filtered-away highlight moves to the first enabled row. The list stands in a `frame` beside its bar, which `Command.overlayBars` drives (see [Overlay scroll bars](#overlay-scroll-bars)). A shortcut reads left to right on a right-to-left page. | `frame`: `card` (default) or `bare`, for inside a dialog. Slots `root`, `search`, `crumbs`, `crumb`, `input`, `list`, `group`, `heading`, `item`, `icon`, `text`, `label`, `description`, `shortcut`, `chevron`, `status`, `empty`, `loading`, `frame`, `bar`, `thumb`, `footer`, `hint`. |
| `Empty` | `{ title, description?, icon?, action? }`. The title takes the `subtitle` role; the icon is `aria-hidden`. | `media`: `icon` (default), `illustration`; `frame`: `none` (default), `dashed`, `filled`; `tone`: `neutral` (default), `danger`; `size`: `compact`, `comfortable` (default). Slots `root`, `icon`, `title`, `description`, `action`. |
| `FloatingPanel` | After Zag's: a non-modal window. `FloatingPanel.init({ id, rect, open? })` holds its rect, stage and a drag, folded with `FloatingPanel.update(limits)` (`min`, `max`, `grid`, `overflow`); `FloatingPanel.open(model, { opener })` focuses it and `close` gives focus back. `FloatingPanel.view({ model, onMessage, title, content, order?, draggable?, resizable?, closeOnEscape?, step?, direction?, labels?, style? }, h)`: the drag trigger moves it and eight edges resize it, kept within the viewport; the arrows move it from the drag trigger and resize it from the bottom-end corner; minimize, maximize, restore and close. A press or focus inside returns the `Raised` OutMessage, which the application folds into the `order` its panels stack by with `FloatingPanel.raise(order, id)`. | `header`. Slots `root`, `boundary`, `panel`, `header`, `dragTrigger`, `title`, `controls`, `minimize`, `maximize`, `restore`, `close`, `body`, `handle`. |
| `HoverCard` (recipe) | Styles `@foldkit/ui`'s HoverIntent (`HoverIntentSlots`): a trigger read as a link, a raised panel fading in on the fast tier as it is drawn. Place the panel with `HoverIntent.toView`'s `anchored`, which shows it in the top layer with an `arrow`; the open and close delays are HoverIntent's (200ms and 300ms by default). | No axis. Slots `trigger`, `panel`, `arrow`. |
| `Icon` | `{ content, label? }`. A `label` is `role="img"`; without one the glyph is `aria-hidden`. | `size`: `sm`, `md`, `lg` on the type scale; none (the default) stands on the size ladder, 16px or 14px compact. Slot `glyph`. |
| `ImageCropper` | After Zag's: the image fitted in a viewport, a selection that a drag moves (`Move`) and eight handles resize, zoom by a Slider, the wheel, two fingers spread or pinched, and `+`/`-` with the selection kept where it is on screen, a pan of the zoomed image, quarter turns, an aspect lock and a round crop. `ImageCropper.init({ id, aspect?, shape?, crop?, min?, maxZoom? })` holds the crop, in the turned image's pixels, folded with `ImageCropper.update`; keys (arrows, Shift ×10, Alt to resize) step by screen pixels. Drawn with `ImageCropper.view({ model, onMessage, label, src, crossOrigin?, controls?, labels?, disabled?, style?, slider? }, h)`. `ImageCropper.crop(model)` is the crop in whole pixels (an `Option`); `RequestedExport({ type, quality })` returns the `Export` Command, answered by `Exported({ url, width, height })` or `FailedExport`. | `guides`, `handles` (`all`, `corners`), `viewport` (`landscape`, `wide`, `square`). Its zoom takes `Recipes.Slider({ label: 'hidden' })`. Slots `root`, `label`, `viewport`, `stage`, `pan`, `image`, `selection`, `guides`, `handle`, `controls`, `zoom`, `rotate`, `reset`. |
| `InputCopy` | A read-only value with a copy button, Zag's clipboard: `InputCopy.view({ id, label, value, copied, onCopy, copyLabel?, copiedLabel?, style? }, h)`. The view is stateless: answer `onCopy` with the `InputCopy.Copy({ text })` Command, which yields `foldkit-primitives/dom`'s `ClipboardMessage` (`Copied` or `CopyFailed`, never a throw); `copied` is the application's, and `InputCopy.Model` keeps it: `InputCopy.init({ resetAfter? })` (default 2000ms), folded with `InputCopy.update`, where `Copied` on `ClipboardMessage.Copied` shows it copied and starts the `Reset` Command that sets it back unless a later copy came first; pass `model.copied`. The button is named `Copy <label>`; copied, it reads `Copied` and a polite status region says so. | No axis. Slots `root`, `label`, `group`, `input`, `button`, `status`. |
| `Item` | The row primitive: `{ content?, media?, title?, description?, actions?, press?, label?, selected?, disabled? }`; `content` follows the title and description. `press` is `{ onClick }` or `{ href }`, one control stretched over the row (`overlay`, as a Card's) and named by `label` or the title, `actions` staying pressable above it; `selected` is `aria-pressed` or `aria-current`. `Item.group({ items: (ItemView & { key })[], label?, style?, itemStyle? })` is a list of them. Field is for form controls. | `variant`: `plain` (default), `outline`, `muted`; `density`: `comfortable` (default), `compact`; `media`: `plain` (default), `icon`, `image`. Slots `root`, `media`, `content`, `title`, `description`, `actions`, `overlay`. `Recipes.ItemGroup({ layout: 'divided' \| 'separated' })` over `ItemGroupSlots` (`root`, `row`). |
| `Kbd` | `{ key }`. Names the key. `Kbd.combo({ keys, joiner? }, h)` draws several in one `kbd`, with an optional joiner between them. | No axis. Slots `key`, `combo`, `joiner`. |
| `Label` | `{ for, text }`. `for` is the control's id. | No axis. Slot `label`. |
| `Marquee` | After Zag's: content that scrolls on without a seam. `Marquee.init({ id })` holds what it measured and whether it is paused, folded with `Marquee.update`; `Marquee.view({ model, onMessage, label, items, side?, speed?, autoFill?, repeat?, delay?, loopCount?, style? }, h)` measures its content (`Resize`) and draws copies to fill the viewport, `inert` after the first. A pointer, focus or its pause press (WCAG 2.2.2) holds it; `Marquee.Message.Paused()` holds it from outside. Its motion is CSS, and under reduced motion the viewport scrolls instead. | `spacing`, `edges` (`fade`, `none`). Slots `root`, `viewport`, `content`, `item`, `pause`. |
| `Menu` | One menu, opened three ways: `Menu.init(id, rows, { isAnimated?, isModal? })` (a row with `items` hosts a submenu, one level deep; `isAnimated` gives the menu's and its submenus' panels upstream's transition marks, for the recipe's fade, and `isModal` makes the rest of the page inert while the menu is open), folded with `Menu.update`, drawn with `Menu.view({ model, rows, buttonContent, onMessage, opensAt?, direction?, isRowDisabled?, mixins, submenuMixins? }, h)`, the style being one of the `mixins` (`[MenuStyle.mixin]`). By a button (`opensAt` unset); at a point (`opensAt: 'point'`, with `Menu.target(onMessage, h)` on the area: a right press records its point and the `contextmenu` after it opens the menu there; a finger or a pen held there `Menu.HOLD_MS`, 500ms, opens it too, as iOS fires no `contextmenu`, while one that moves 10px is a scroll; give the area `-webkit-touch-callout: none` and `user-select: none`, or iOS shows its own callout over it). A row is an `ItemRow` (`{ label }`), a `CheckRow` (`check: 'checkbox' \| 'radio'`, `checked`: `menuitemcheckbox` or `menuitemradio` with `aria-checked`; choosing it sends `Selected` and leaves the menu open, the application keeping `checked`, a radio row's group being the rows of its `group`), or a `SubmenuRow` (`items`). Any row may name a `group` (rows next to each other with one group stand under its heading, a separator between groups), a `shortcut` (keys drawn at the row's end as Kbd with the view's `kbd`, named in `aria-keyshortcuts`; the menu binds nothing) and `tone: 'destructive'` (`data-tone`). A submenu's row is a `menuitem` with `aria-haspopup="menu"` and `aria-expanded`; ArrowRight, Enter or Space opens it on its first row, ArrowLeft or Escape closes it back to the row (under `direction: 'rtl'`, drawn as the root's `dir`, the submenu opens on the left, its chevron points there, and the arrows swap), a pointer resting 150ms opens it, and choosing a leaf closes everything. `Selected` names the value and the submenu it came from. Pass `Menu.fluid` beside the style (in `submenuMixins`, not `mixins`, where rows open submenus). Its panels, submenus included, draw in the top layer. A `@foldkit/ui` Menu the application folds itself, for typed items or groups, is drawn through the panel adapter instead, and opens at a point with `Menu.drawAtPoint` and `Menu.pointTarget` (see [Why some components needed a fork](#why-some-components-needed-a-fork)). | No axis. Slots `MenuSlots`. |
| `Menubar` | A row of `@foldkit/ui` Menus, shadcn's and the APG's menubar: `Menubar.view({ label, model, menus, onMessage, direction?, style?, menuMixins }, h)`, each menu's `{ label, rows, isRowDisabled? }` taking a Menu's rows (none opening a submenu), its Model (`Menubar.init(ids, { isAnimated?, isModal? })`) folded with `Menubar.update`, whose `Selected` OutMessage names the menu and the row. One trigger is the tab stop; ArrowLeft/ArrowRight (Home/End while all are shut) move it, swapped under `direction: 'rtl'` (drawn as the bar's `dir`), and with a menu open they open the next on its first row. While one is open, pointing at another opens it, and opening any shuts the rest. `Recipes.MenubarMenu` is the Menu recipe with a bar's flat triggers. | No axis. Slots `bar`, `menu`; each menu's are `MenuSlots`. |
| `MessageScroller` | A conversation's log that follows the newest message while the reader is at the end and stops when they scroll up. `MessageScroller.init({ id })` holds only whether it follows and how many arrived unseen; the scroll position is the browser's, read by its `FollowEnd` Mount. Fold `MessageScroller.update`, and send `Message.Appended({ count })` when your update appends messages (not when it loads older ones, which it holds in place). `MessageScroller.view({ model, label, content, onMessage, jumpLabel?, unseenLabel?, style?, areaStyle?, areaMixins? }, h)` draws a named `role="log"` in a ScrollArea, with a jump button counting what arrived while away; give its parent a height. | No axis. Slots `root`, `log`, `jump`, `count`. |
| `Meter` | `@foldkit/ui`'s Meter: `Meter.view({ id, label, value, min?, max?, low?, high?, optimum?, valueText?, style? }, h)` draws a `meter` named by its label. The root says how good the value is as `data-level` (`good`, `fair`, `poor`), as the HTML meter judges it; `Meter.levelOf` is that judgment. A measurement, where `Progress` is work. | No axis; the fill takes success, warning or error by level. Slots `root`, `label`, `track`, `fill`. |
| `Nav` | Two layers. `Nav.toView(mixins, { h }, label, draw?)` styles `@foldkit/ui`'s stateless Nav, drawing `nav > ul > li > a` with the current link `aria-current="page"`. `Nav.view({ model, entries, label, onMessage, orientation?, direction?, mixins? }, h)` is a navigation menu: links and triggers whose panels of link columns (`groups` of `{ label, href, description?, current? }`) show in the top layer, with the APG's disclosure-navigation keys (Escape, ArrowDown into a panel, the arrows, Home and End along the row; a press outside and focus leaving close it); which panel shows is `Nav.init(id)`'s Model, folded with `Nav.update`. `Nav.fluid` beside the style glides a line to the current link and a faint pill to the one the pointer nears. | `indicator`: `underline` (default), `pill`; `orientation: 'vertical'` is a column whose panels open beside it. Slots `nav`, `list`, `item`, `link`, `trigger`, `chevron`, `panel`, `groups`, `group`, `heading`, `links`, `panelItem`, `panelLink`, `title`, `description`, `indicator`, `highlight`. |
| `NumberField` | `{ id, label, description?, value, onChange, min?, max?, step?, page?, format?, disabled? }`; `NumberField.settled(value, bounds)` clamps a value onto its step. The APG's editable spinbutton: an input with `role="spinbutton"` that the arrows, PageUp and PageDown, Home and End step, a typed number committing on change, between steppers out of the tab order that disable at their bound. | No axis. Slots `root`, `label`, `group`, `input`, `decrement`, `increment`, `description`. |
| `OtpField` | `{ label, value, onChange, length?, pattern?, groups?, disabled? }`; `OtpField.kept(text, length, pattern)` filters a code. shadcn's input-otp: one real input (`autocomplete="one-time-code"`, paste and Backspace the browser's) over cells that mirror it, the next cell marked `data-next` for its caret. | No axis. Slots `root`, `input`, `group`, `cell`, `separator`. |
| `Pagination` | `{ page, pageCount, onPage, label?, siblings?, boundaries?, numbered?, ends?, range? }`. Fewer than two pages draws nothing. `Pagination.itemsOf(page, pageCount, window?)` is the stops; `Pagination.summaryOf(page, { total, perPage, text? })` is `"1–10 of 97"`, drawn before the stops when `range` is given. `range.choose: { sizes, onPerPage, label? }` adds a select of rows per page (labelled `Rows per page` by default) that sends `onPerPage` with the size; the application sets `perPage` and a page that keeps its rows in view. `numbered: false` leaves previous and next alone; `ends` draws first and last. The current stop holds ` / 12` in a `pageCount` span hidden from assistive technology. | `compact`: `narrow` (default, below a 30rem window), `always` or `never`. Compact shows only the current number, with its ` / 12`, and no ellipses. The current stop reads `aria-current`. Slots `root`, `summary`, `perPage`, `perPageSelect`, `first`, `prev`, `next`, `last`, `page`, `pageCount`, `ellipsis`. |
| `PasswordInput` | `PasswordInput.view({ id, label, value, onInput, visible, onToggle, autocomplete?, toggleLabel?, description?, invalid?, disabled? }, h)`: a password field whose toggle button (`aria-pressed`, `aria-controls`, one fixed name) shows it as text. `autocomplete` is `current-password` (default) or `new-password`; spellcheck and autocorrect stay off. `strength` is a `Meter` view's options, drawn under the field; `requirements` are `{ label, met }[]` (`PasswordRequirement`), listed and each read as met or not (`requirementStates`); `capsLock: { on, onKey }` says Caps Lock is on, politely, `onKey` given `capsLockOf(key, modifiers)` for each key (an `Option`: none for a key that says nothing of it). The app owns the text, the flag and the Caps Lock reading. | `size` (`sm`, `md`, `lg`). Input's pieces in InputGroup's box; the eye is `Icons.glyph` by `aria-pressed`. Slots `root`, `label`, `group`, `input`, `toggle`, `description`, `strength`, `requirements`, `requirement`, `requirementState`, `capsLock`. |
| `Progress` | `@foldkit/ui`'s Progress: `Progress.view({ id, label, value, min?, max?, valueText?, style? }, h)` draws a `progressbar` named by its label. `value` is an `Option`; none is indeterminate, and the bar's fill sweeps toward the inline end, leftward right to left. The root carries the share done as `--fk-progress`. `showValue` draws the value (`valueText`, else a percentage) at the end of a bar's label line and inside a ring. A `value` given as `ProgressSection`s is one stacked bar of toned parts, read aloud as their sum; `buffer` draws how far the work could go behind the fill; `segments` cuts the track into steps. | `shape`: `bar` (default) or `ring`, Circular Progress; `tone`: `accent`, `neutral`, `success`, `warning`, `error`, `info` (Meter's tokens); `stripes`: `none` (default), `still`, `moving` (travel-aware); `size`: `sm`, `md`, `lg`. Slots `root`, `label`, `track`, `indicator`. |
| `QrCode` | After Zag's: `QrCode.view({ id, value, label?, level?, quietZone?, overlay?, tooLong?, style? }, h)`, one `img` named `QR code: <value>` (or `label`), every dark module one SVG `path` over a background that carries the quiet zone. `level` is the error correction, `M` by default and `H` under an `overlay` (a logo at the centre). `QrCode.encode(text, level)` gives the matrix, none when no version holds the text, and `pathOf` its path; both are pure. `QrCode.Download({ id, format, filename, pixels })` saves the drawn code as PNG or SVG in the colors it shows; the overlay is not in the file. | `scheme` (`light`, dark on light on any page, or `page`), `size`. Slots `root`, `frame`, `background`, `pattern`, `overlay`, `fallback`. |
| `Questionnaire` | An assistant's questions answered in the chat. `Questionnaire.init({ id, questions, layout? })` with `Questionnaire.single`, `multiple` and `text` questions (`Question` is a Schema, so a tool's input decodes into it), folded with `Questionnaire.update`, which says what is missing and focuses it, and returns `OutMessage.Answered({ answers })` once every required question is answered; the form then gives way to a summary. `Questionnaire.view({ model, onMessage, title?, style?, radioGroup?, checkboxGroup?, input?, textarea?, button?, submitButton? }, h)`: the controls are the package's RadioGroup, CheckboxGroup, Input and Textarea, each taking its own style. | `variant` (`plain`, `card`), `actions` (`end`, `start`). Slots `root`, `title`, `progress`, `question`, `prompt`, `words`, `field`, `other`, `otherLabel`, `error`, `actions`, `summary`, `asked`, `answer`. |
| `Rating` | `Rating.view({ id, label, value, onChange, max?, starLabel?, readOnly?, disabled?, style? }, h)`: a `radiogroup` of native radios named by its label, one per star under one name, so the browser's arrows move the choice and a form submits it. `value` is an `Option`; none is unrated. Read-only, it is one `img` whose name says the rating. `precision: 0.5` draws two radios a star; a read-only value of any fraction fills its last star part way. `onClear` is sent by a press on the star already chosen; `showValue` shows `starLabel` of the rating beside the stars, so a word per value is one function. Home and End go to the ends through the `Rating.Ends` Mount (resolve it in a Scene test with a choice's Message). A read-only rating (`readOnly: true`) takes no `onChange`. | `tone`: `warning` (default, gold), `accent` or `error`; `glyph`: `star` (default), `heart`, `circle`, or `--_fk-rating-shape`; `size`: `sm`, `md`, `lg`. Stars are a CSS `clip-path` on each radio's `::before`; pointing previews the rating. Slots `root`, `label`, `star`. |
| `Resizable` | `Resizable.Model` (`init(share)`), its `Message` and `update(model, message, bounds)`, which the application keeps and folds; `Resizable.view({ model, onMessage, label, first, second, orientation?, direction?, min?, max?, step? })`. shadcn's Resizable and the APG's window splitter: the handle is a `separator` with its value, stepped by the arrows and sent to the bounds by Home and End; a drag follows the `Move` Mount from where it began over the group the `Resize` Mount measured. Under `direction: 'rtl'`, drawn as the root's `dir`, the first panel is on the right, so ArrowLeft and a drag to the left grow it. `collapsible: 'first' | 'second'` (with `collapsedTo`) collapses that panel on Enter or a double-click and puts it back where it was, easing there while a drag follows the pointer at once; pass the same bounds to `update` and the view. A split fills its panel, so splits nest either way. | `handle`: `line` (default; a thicker accent line under the pointer) or `grip` (a pill of dots); `data-orientation` lays it out. Slots `root`, `first`, `handle`, `second`. |
| `ScrollArea` | `{ content }`. The height that makes it scroll is the caller's mixin, on `viewport` or `root`; a width goes on `root`, which the viewport fills and the bars lie over. The viewport is tabbable. A bar per axis is drawn beside the viewport, and `ScrollArea.overlayBars` beside the style lays them over its edge, driven by `ScrollBars` from `foldkit-primitives/dom`: a thumb that rests 4px wide, widens to 6px under the pointer, and fades once scrolling and the pointer rest; a coarse pointer keeps the browser's bar. See [Overlay scroll bars](#overlay-scroll-bars). | `orientation`: `vertical` (default), `horizontal`, `both`; `vertical` and `horizontal` fade the content toward an edge with more past it and draw a hairline there. Slots `root`, `viewport`, `bar`, `thumb`. |
| `Separator` | `{ orientation?, label?, decorative? }`, horizontal by default. A `label` sits between two drawn rules and is read as text; `decorative` is `role="none"`. The rule and a label's frame carry `data-orientation`, which the recipe reads, so one style draws both orientations. A vertical rule stretches across a flex or grid row, short of it by the inset, and elsewhere (running text) stands as tall as the letters. | `line`: `solid`, `dashed`, `dotted`; `thickness`: `thin`, `thick`; `spacing`: `none`, `sm`, `md`, `lg`; `inset`: `none`, `sm`, `md`. The line is a border in `outline.default`, which a dark page shows. Slots `rule`, `root`, `label`. |
| `Drawer` | A panel docked to the bottom of the screen that peeks or opens beside the page, not over it: no focus trap, backdrop or scroll lock, so the page under it stays live (a modal one is the `Sheet`). `Drawer.init({ id, open?, swipe? })` (down by default), folded with `Drawer.update`, opened with `Drawer.open` and `Drawer.close`, drawn with `Drawer.view({ model, onMessage, labels: { open, closed }, style?, mixins?, draw }, h)`, `draw` laying out `panel`, `handle`, `body` (the body may sit below what else peeks with the handle) and, optionally, `grip`, more to drag it by (a row of tabs: vertical swipes drag it, sideways ones still scroll). A drag follows the finger and lets go open or down by its speed, then by how far it came. `swipe: { from?, flickSpeed?, closeShare? }` says how it is swiped: a finger drags it from anywhere on the panel (`from: 'panel'`, the default), yielding to content that can still scroll its way, so a long one scrolls back to its top and then goes, and a field or `data-no-swipe` starts no drag; a mouse drags it by the handle, and `from: 'handle'` keeps every pointer there. A release faster than `flickSpeed` (0.4px/ms) is a flick, and a slow one goes once dragged `closeShare` (a quarter) of the panel. A click or Enter on the handle toggles it, and the click a browser sends after a drag does not. The panel's inline style is the drag's: set `--fk-drawer-peek` (default 5rem) and `--fk-drawer-height` (default 70dvh) on an ancestor or in a style. | `Recipes.Drawer`: `dock`: `always` (default), `below-lg` or `below-xl`, above which the panel is the column it sits in, with no handle. The handle's bar bends into a chevron going down, with the finger while dragged. Slots `panel`, `handle`, `body`, `grip`. The handle is a 44px target drawn tight to its bar, and the peek stays above the home indicator. |
| `Sheet` | A Dialog a finger drags, vaul's Drawer: `Sheet.init({ id, side?, points?, opensAt?, dismissible?, isAnimated?, swipe? })`, folded with `Sheet.update` and opened with `Sheet.open` and `Sheet.close` (each also reporting the Dialog's `Opened` or `Closed`), drawn with `Sheet.view({ model, onMessage, mixins, hasDescription?, covered?, scalesPage?, draw }, h)`, `draw` laying out `DialogSlots`' bundles with `h.div(sheet.handle)` in the panel. The panel stands on `side`'s edge (`data-side`); a drag follows the pointer and settles at the nearest of `points` (the share of the panel shown, ascending; a top or bottom sheet with a point below 1 takes its `size`'s full height, so a short one still shows its start, and below its highest point its content holds still, so a swipe up raises it), or, flicked or dragged far enough past the first, closes it, unless `dismissible: false`. `swipe: { from?, flickSpeed?, closeShare? }` says how it is swiped: a finger drags it from anywhere on the panel (`from: 'panel'`, the default), yielding to content that can still scroll its way, so a long one scrolls back to its top and then goes, and a field or `data-no-swipe` starts no drag; a mouse drags it by the handle, and `from: 'handle'` keeps every pointer there. A release faster than `flickSpeed` (0.4px/ms) is a flick, and a slow one goes once dragged `closeShare` (a quarter) of the panel. The Dialog keeps focus, Escape and scroll lock. `scalesPage` with `Recipes.sheetPage` on the page beside the sheet, never around it, steps the page back while it is open. | `Recipes.Sheet`: `size`: `sm`, `md` (default), `lg`, `full`; `handle`: `bar` (default) or `none`. Slots are `DialogSlots`. |
| `Sidebar` | shadcn's sidebar with Fluid's collapse, keeping a Model: `Sidebar.init({ id, rows, open?, collapsed?, side?, width? })` (a Tooltip per row id, and the phone's Sheet), folded with `Sidebar.update`, drawn with `Sidebar.view({ model, onMessage, label, groups, header?, footer?, direction?, collapse?, style?, mixins?, tooltip?, sheet? }, h)`. `groups` are `{ id, title?, collapsible?, action?, rows }`, a row a `SidebarLink` (`{ id, label, href, current?, icon?, badge?, action? }`) or a `SidebarBranch` of nested links (`items`). An `action` (`SidebarAction`: `{ label, icon, message }`) is a button at a titled group's heading or beside a link, where it takes the badge's place under the pointer (both show on a touch screen). Groups and branches open like an accordion's, several at once; the current page is `aria-current` and `Sidebar.fluid` glides a marker to it. `collapse: 'offcanvas'` (default) takes the whole column off the page; `'icons'` leaves a rail of icons named in Tooltips (`tooltip`, a Tooltip style). With `sheet` (a Sheet style), an opener shows it in a Sheet on a phone. Shut groups and a collapsed column stay drawn and `inert`. `Sidebar.init({ width: { size?, min?, max? } })` makes the column resizable, its width in the Model: a `resize` handle on its edge drags it, the arrows step it, Enter or a double-click collapses it, and dragged below half `min` it collapses, coming back at the width the drag began at. | `variant`: `sidebar` (flush with the page's edge, the default), `floating` (a card lifted off it), `inset` (no edge, on the surface it stands on, for a page drawn as a card beside it); on a phone with a Sheet the column is its opener alone. Slots `root`, `header`, `footer`, `opener`, `title`, `toggle`, `nav`, `section`, `heading`, `trigger`, `chevron`, `links`, `item`, `branch`, `link`, `icon`, `mark`, `detail`, `label`, `badge`, `action`, `tip`, `indicator`, `highlight`, `resize`. |
| `SignaturePad` | After Zag's: strokes drawn by one pointer over a dashed line and "Sign here", undo, clear, and a typed name instead. `SignaturePad.init({ id, pen? })` holds the strokes (points with pressure, in the pad's coordinates), folded with `SignaturePad.update`. Drawn with `SignaturePad.view({ model, onMessage, label, fallback?, labels?, disabled?, style? }, h)`. `pathOf(stroke, pen)` and `toSvg(model, { color?, font? })` are pure; `RequestedPng({ scale, background })` returns `ExportPng`, answered by `ExportedPng({ url, width, height })` or `FailedExport`. | `surface` (`plain`, `muted`, `dashed`), `size`. Slots `root`, `label`, `control`, `segments`, `stroke`, `guide`, `placeholder`, `typedName`, `controls`, `undo`, `clear`, `fallback`, `fallbackLabel`, `input`. |
| `Skeleton` | `{ label? }`, `role="status"`, a bar a film of the text. `Skeleton.lines({ lines, label? })`, `avatarRow`, `card` and `tableRow({ columns })` draw the shapes content takes, in a `group`. | `shape`: `bar` (default), `circle`; `animation`: `pulse` (default), `shimmer`, `none`. Slots `bar`, `group`. |
| `Slider` | `Slider.view({ id, label, value, onChange, min?, max?, step?, format?, marks?, showValue?, name?, disabled?, style? }, h)`, where `value` is a number or a `{ low, high }` range and `onChange` is handed the same kind. Native `input type="range"` thumbs, so drag, keys, right to left and the form value are the browser's. One number is one thumb across the track, named by the label; a press anywhere on the track moves it. A range is a `group` named by its label holding two thumbs named by `thumbLabels` (default `Minimum` and `Maximum`), each bounded by the other (the low one's `max` is the high value), so the browser stops a drag or a key at the other thumb; `Slider.moved(range, 'low' \| 'high', value, bounds)` snaps, bounds and orders a range, and returns the same range when nothing changed. `marks` are values dotted on the track (`data-filled` where the fill covers them) and `showValue` draws each value, both hidden from assistive technology, which hears `aria-valuetext`. `@foldkit/ui`'s Slider is not adapted: draw its Submodel with Slots of your own. `orientation: 'vertical'` stands it upright; `ticks` dots every step; a mark may be `{ value, label }` (`SliderMark`), its words under the track, those at either end flush with its ends rather than hanging past them. | `tone`: `accent` (default) or `neutral`; `size`: `sm`, `md` (default), `lg`, the thumb's edge; `track`: `thick` (default; the fill reaches each thumb's far edge, Fluid's look), `thin` or `paint` (a track a holder paints, as the color picker's); `value`: `above` (default), `inside` (widens the thumb into a pill; best at `md` or `lg`) or `end` (at the end of the label's row); `label`: `shown` (default) or `hidden`. Slots `root`, `label`, `control`, `track`, `fill`, `mark`, `value`, `thumb`. |
| `Spinner` | `{ label?, showLabel? }`. `role="status"`; `showLabel` draws the label beside the wheel. A turn is about 720ms times `travel`. | `kind`: `ring` (default), `dots`, `bars`, `pulse`, `orbit`; `size`: `sm`, `md` (default), `lg`; `tone`: `accent` (default), `neutral`, `current`. Slots `wheel`, `part`, `root`, `text`. |
| `Steps` | `Steps.view({ label, steps: { title, description?, icon?, content? }[], current, onSelect?, style? }, h)`: a stepper, an ordered list named by `label`. The step at `current` is `aria-current="step"`, those before it `data-state="complete"` (a check replaces the number), those after `upcoming`. An `icon` stands in the marker for its number; `content` follows the step, beside the line in a vertical stepper. With `onSelect(index)`, completed steps are buttons for going back; steps ahead never are. The application owns `current`. `progress` (0 to 1) fills the connector after the current step when the recipe's connector is a progress bar. | `orientation`: `horizontal` (default) or `vertical`; `size`: `xs`, `sm`, `md`, `lg` (the Avatar's sizes; unset, 1.75rem); `marker`: `number` or `dot`; `connector`: `line` or `progress`. A horizontal row narrower than 32rem shows only the current step's words, wrapping inside an even share so the markers stay evenly spaced (a word longer than 40% of the row is cut), and narrower than 17rem draws them on a line of their own under the markers. Slots `root`, `item`, `step`, `trigger`, `marker`, `number` (the figure in a marker with no icon, trimmed to its digits so it centers in any face), `text`, `title`, `description`, `content`, `connector`. |
| `Table` | The presentational table: `{ columns: { header, value, numeric?, sortKey? }[], rows, rowKey?, caption?, fluid?, sort?, selection?, expansion?, empty? }`. A column with a `sortKey` heads with a button that sends `sort.onSort(column)`, and the sorted column carries `aria-sort`; `Table.nextSort(sort, column)` cycles ascending, descending and none. `selection` puts a checkbox on every row and one in the heading, mixed while only some are chosen; `expansion` opens a row's detail in a row below it (`aria-expanded`, `aria-controls`); `empty` stands across the table while there are no rows (an `Empty.view`). The sort, the chosen and the open rows are the application's. It stands in a `frame`, which scrolls sideways when the table is wider than the screen (under a `static` header; a `sticky` one sticks to the application's scroller, which scrolls it). With `fluid`, one highlight behind the body rows follows the pointer, skipping detail and empty rows. Filtering, column reorder and resize, and virtualized rows stay with `foldkit-data-grid`. | `rows`: `lined`, `striped`, `plain`; `density`: `compact`, `regular`, `comfortable` (none set follows the region); `header`: `static`, `sticky`. Slots `frame`, `highlight` (with `fluid`), `root`, `caption`, `head`, `headerRow`, `headerCell`, `sortButton`, `sortIcon`, `body`, `row`, `cell`, `controlCell`, `checkboxLabel`, `expandButton`, `expandIcon`, `detailRow`, `detailCell`, `emptyRow`, `emptyCell`. |
| `TagsInput` | Zag's tags input, a small Model of its own: `TagsInput.init({ id, tags?, delimiter?, max? })`, folded with `TagsInput.update` (which returns a focus Command), drawn with `TagsInput.view({ model, onMessage, label, placeholder?, disabled? }, h)`. The tags are a list of chips named by the label, each with a `Remove <tag>` button, then a text input. Enter or the delimiter (default `,`) adds the draft split at the delimiter and trimmed, refusing empty and repeated parts, and parts past `max`: a refusal (`TagsInput.Refusal`: `Repeat`, `Empty`, `Full`) is said in a polite `message` (worded by `refusalText`) and shakes the field once, the shake travel-aware; Backspace on an empty draft removes the last tag; a removal returns focus to the input. Keys reach `update`, which decides from its own draft. | No axis; `data-disabled` on `control`. Slots `root`, `label`, `control`, `list`, `tag`, `remove`, `input`, `message`. |
| `ThinkingIndicator` | An assistant at work: `ThinkingIndicator.view({ label?, detail?, active?, icon?, style? }, h)` draws dots, a pulse or the view's icon beside words a band of light sweeps, and a detail line, in a polite status. Keep it drawn with `active: false` before work starts, so what it says when it starts is announced. Every movement holds under reduced motion. | `mark` (`dots`, `pulse`, `none`), `label` (`shimmer`, `plain`, `hidden`), `tone` (`muted`, `accent`). Slots `root`, `mark`, `dot`, `icon`, `label`, `detail`. |
| `ThinkingSteps` | The trace of what an assistant did: `ThinkingSteps.view({ id, steps, open, onToggle, duration?, summary?, openSteps?, onToggleStep?, stateWords?, style? }, h)`. Each step is `{ id, title, state, duration?, detail?, icon?, steps? }`, `state` being `pending`, `running`, `done` or `failed`, said in words too. The button says the running step's title, or "Thought for 4s". Its openness is yours, an `Option<boolean>`: none opens it while a step runs and shuts it once all are done, and the press sends the state the reader asked for. `openSteps` and `onToggleStep` make each step's detail collapsible (`Accordion.toggled`). | `variant` (`plain`, `card`), `connector` (`line`, `none`). Slots `root`, `trigger`, `summary`, `chevron`, `panel`, `list`, `step`, `head`, `marker`, `title`, `state`, `duration`, `body`, `detail`. |
| `Timer` | After Zag's: a countdown (`Timer.init({ id, countdown: true, duration })`) or a stopwatch (`Timer.init({ id, interval? })`), folded with `Timer.update`, whose Commands (`Timer.Stamp`, `Timer.Tick`) read Effect's `Clock`, so TestClock drives a run. `Timer.view({ model, onMessage, label, units?, separator?, labels?, style? }, h)`: a `role="timer"` with each unit in a Slot, one press that says what comes next, and reset. `Timer.phase(model)` is `idle`, `running`, `paused` or `done`; to start at once, return `Timer.update(model, Timer.Message.Pressed({ action: 'start' }))` from `init`. | `tone`, `look`, `progress`, `size`. Slots `root`, `label`, `area`, `item`, `separator`, `controls`, `action`. |
| `Toast` | A stack of toasts, Sonner's: `Toast.init(id, { position?, direction?, duration?, max?, threshold? })`, folded with `Toast.update`, whose `Acted` OutMessage names a pressed action; `Toast.show(model, { type?, title, description?, action?, duration? })` returns the stack and the new toast's `id`, `Toast.settle(model, id, input)` turns a toast (a `loading` one, a promise's) into its outcome, and `Toast.dismiss(model, id)` takes it away; draw it with `Toast.view({ model, onMessage, label?, closeLabel?, expand?, icons?, style? }, h)`. The newest stand in front, spread out while the pointer or focus holds the stack, at most `max` (3) showing; a held stack or a hidden page pauses every countdown, keeping the time left; a swipe toward the edge past `threshold` dismisses one. A toast is spoken in a polite region, an error in an assertive one. A promise toast is `show` with `type: 'loading'`, the work run as a Command, and `settle` on the toast's `id` when its Message comes back. `ToastView` is the fork for toasts that carry their own payload. | `tone`: `plain` (default) or `rich` (each type on its tint). Slots `container`, `entry`, `list`, `icon`, `body`, `title`, `description`, `action`, `close`, `status`, `alert`. |
| `Tour` | Steps anchored beside their targets in the top layer, over a dim with a cutout the target's presses reach. `Tour.init({ id })`, started with `Tour.start(model, config, { opener })` and folded with `Tour.update(config)` (`config` is `{ steps: [{ title, description, target?, placement? }] }`); `Tour.view({ model, config, onMessage, padding?, interactive?, dismissOnOutside?, closeOnEscape?, labels?, direction?, style? }, h)`. The target scrolls into view; Next, Back and the arrows move on, Escape and Skip end it with focus back to the opener, and `update` returns `Ended { completed }`. A step without a target, or whose target is missing, stands in the middle. | No axis. Slots `layer`, `blocker`, `spotlight`, `panel`, `arrow`, `progress`, `title`, `description`, `actions`, `back`, `next`, `skip`. |
| `TreeView` | The APG's and Zag's tree view, a small Model of its own: `TreeView.init({ id, open?, checked? })`, folded with `TreeView.update(nodes, { checkable? })` (curried over the tree, flattened once), drawn with `TreeView.view({ label, model, nodes, onMessage, direction?, style?, mixins? }, h)` over nodes `{ id, label, children?, disabled?, icon?, openIcon? }`. `checkable` (on the view and `update`) gives each row a box: the Model's `checked` holds the leaves, a branch reads checked, mixed or not from them (`TreeView.checksOf`), and Space checks the current row in `update`. One tab stop; Up/Down move through the rows showing, stepping over shut and disabled ones; Right opens or steps in, Left shuts or steps out (swapped under `direction: 'rtl'`, drawn as the root's `dir`); Home/End; a character moves to the next showing row that starts with it; Enter, Space or a click chooses a row and opens or shuts a branch. Keys reach `update`, which decides from its own Model and sends a focus Command. Each item carries `--fk-tree-level`; a shut group stays drawn and `inert`. | `guides`: `none` (default) or `lines`, a guide down each open branch; `data-state` on a branch `item` and its `group`. Slots `root`, `item`, `row`, `chevron`, `checkbox`, `icon`, `label`, `group`. |
| `Typography` | `{ level, text }`. The level chooses the element (`h1`–`h4`, `lead`, `body`, `small`, `muted`, `quote`, `code`, and the interface roles `display`, `title`, `subtitle`, `caption`, `micro` as paragraphs). | `level`, same set; a role is its size and leading on the size ladder. Defaults to `body`. Slot `text`. |
| `VirtualList` | `@foldkit/ui`'s virtual list: `VirtualList.view({ model, items, itemToKey, itemToView, onMessage, overscan?, itemToRowHeightPx? \| dynamicRowHeights?, style?, mixins? }, h)` draws only the rows in view. Its Model is upstream's (`@foldkit/ui/virtualList`'s `init`), kept by the application and folded with that module's `update`. A row's mixins may style it, not handle its events, since it is drawn inside the list's submodel. A bar is drawn beside the list, and `VirtualList.overlayBars` lays it over the list's edge: `root` runs `ScrollBars` for upstream's list, which holds a Mount of its own. | No axis. Slots `root` (the box it scrolls within: 18rem tall by default and as wide as its container, offering 20rem where the container takes its width from it, so the rows drawn as it scrolls never resize it), `row`, `bar`, `thumb`. |

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
const theme = Theme.make({ accent: { hue: 280, chroma: 0.15, lightness: 60 } })

export const sheet = Style.stylesheet(
  L.declare,
  L.in('theme', Theme.root(Theme.standard(theme))),
  DeleteStyle,
)
```

`DeleteStyle.mixin` then goes to `Button.toView` as in the first example.

What a recipe assumes and does:

- **The page ships the tokens.** Every value is a `var(--fk-…)` reference to
  the shipped tokens (`Theme.standard`), so another theme's knobs restyle
  every recipe with no new CSS.
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
- **A state is a tint, not a surface.** An unfilled control's hover is a
  faint film of the state ink over whatever is under it, so it reads on a
  muted page, a colored band or an inverted panel. The ink is the theme's
  `--fk-state-ink` (`state.ink`: the element's own text, or the accent's ink
  under `stateHue: 'accent'`) unless a painted surface above names its paint
  in the local `--_fk-state-ink`: the accent and danger tones name their
  fill, a subtle alert band its ink and a bold one its fill, so a hover on
  blue is a deeper blue. The neutral and ink tones name the theme's ink back,
  so a neutral control on a band does not take the band's hue, and one
  `stateHue` override reaches every component. The neutral button is
  see-through (`state.tint`), and images carry a hairline inside their edge
  (`state.edge`). A popup's rows round concentrically inside its panel
  (`Theme.nested`), as a segmented option does inside its tray.
- **Popups and dialogs enter and leave** when drawn with `@foldkit/ui`'s
  `isAnimated` (the Menu component's `Menu.init(id, rows, { isAnimated:
  true })`): a popup fades and grows on the fast tier, from the side its
  anchor placed it on, and a dialog on the slow one, each leaving on the
  quicker exit.
- **A press gives.** Held, every button scales to 98% (the 2% multiplied by
  `travel`, so reduced motion holds its size). A solid or primary button's
  fill also deepens to its family's `active` and clears the 1px border of its
  own color that it stands in, so the fill draws in by 1px a side; an
  outline, ghost or icon button lays a deeper film of its tone's ink. A
  pressed toggle (`aria-pressed="true"`) rests on its tone's fill, a solid
  one on the `active` fill; hovered, a solid toggle keeps it and an unfilled
  one takes its tone's hover fill; held, it deepens to the `active` fill; and
  its text stays the fill's throughout. Chosen rows next to each other in a multiple listbox or
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

Like the variant recipes it reads the shipped tokens and
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

Every one is the same shape, a mixin list passed beside the style:
`ScrollArea.overlayBars`, `Command.overlayBars` and `VirtualList.overlayBars`
in the view's `mixins`, and `Menu.overlayBars`, `Listbox.overlayBars` and
`Combobox.overlayBars` in `toView`'s for a popup whose list scrolls (given
`itemsScrollAttributes`). Like `fluid`, it is off by default: a Scene test
resolves every Mount with a Message, and this one sends none, so a default
would burden the tests of every page that drew one.

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

The bar is a Slot of each component's own (`bar` and `thumb`; a popup's
`scrollBar` and `scrollThumb`), beside the scroller rather than inside it, so
the scroller's edge fade does not erase it. ScrollArea, Command and
VirtualList always draw it, and a popup whenever its panel has a `scroll`;
the recipe leaves it undrawn until `ScrollBars` marks it scrollable. A ScrollArea also marks an edge
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
button's own background, a variant too, does not hide it. `tray` is a muted tray, a plain row (which
sets no `display`: the Builder owns its narrow tabs' visibility) or an `underline`, each as wide as its options (`width: 'fill'` for a strip as wide as its container); an option takes an `icon`, alone with `iconOnly` (named by `aria-label` and `title`); `size` steps
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

### The top layer

The panels of Menu (submenus included), Menubar, Listbox and Combobox that
stay where they are drawn (an anchor's `portal: false`) draw in the
browser's top layer, so no stacking context or ancestor `overflow` reaches
them. Such a panel carries `popover="manual"`, and its anchor Mount is
wrapped in `Anchor.topLayer`, which shows the panel as a popover around the
Mount's own acquire and hides it once the Mount releases; the wrapper keeps
the Mount's name, args and Messages, so a Scene test still resolves it, and
the node stays where the runtime drew it. Light dismiss stays the
application's Messages.

- The panel sets `inset: auto`: the anchor writes only `left` and `top`, and
  the browser's `inset: 0` would otherwise leave `right: 0` winning right to
  left.
- An unstyled panel keeps the browser's popover border, padding and
  `Canvas` fill. Every recipe's panel replaces them; an inline reset would
  beat the recipes.
- `Anchor.topLayer` does nothing where the popover API or the element's
  `popover` attribute is missing (jsdom, a server render, a panel drawn
  without it), and the anchor places the panel in the page.
- A panel that upstream portals keeps upstream's behavior, since moving a
  shown popover hides it again.

Popover, Tooltip and Hover Card are drawn by upstream views whose Mounts this
package cannot wrap, so their panels go in the top layer another way:
`Anchor.layer(h)`, the `layer` slot of `PopoverSlots` and `TooltipSlots`, is
an element drawn around the panel that shows itself as a popover, and the
panel inside keeps upstream's anchor (`Popover.anchor()` and
`Tooltip.anchor()` give `portal: false` and the placement: 12px and 8px
off the trigger, 8px inside the viewport, flipping and shifting). A Hover
Card's panel is anchored in the top layer by `HoverIntent.toView(mixins, {
h, anchored: { id, anchor? } }, draw)`, which gives the trigger
`HoverIntent.triggerId(id)`. Each draws an `arrow` slot in its panel that
points at the trigger. The DatePicker's panel and modal dialogs are not in
the top layer.

A box of your own whose Mount is not `TopLayer` takes `Anchor.layerBox(h,
style?)`: the same box without the Mount, for a Mount wrapped in
`Anchor.topLayer` that sends Messages (Cascade Select's and Tour's do), so a
Scene test can resolve it. Its inline style takes `style` too, since a
second `h.Style` on the element would replace the first.

The popups' recipes take a `width` axis. `trigger` sets the panel's minimum
width to its trigger's (`--button-width`, which upstream's anchor publishes
once it has placed the panel), in place of the panel's 14rem minimum, so a
narrow trigger gets a panel as narrow; `auto` keeps the 14rem. Combobox
defaults to `trigger`, Listbox to `auto`.

### Right to left

Logical properties carry most of the recipes, and a few things follow the
direction explicitly:

- **A `direction` view option.** Menu, Menubar, TreeView, Resizable and a
  horizontal Listbox take `direction?: 'ltr' | 'rtl'`. Under `'rtl'` the
  view swaps ArrowLeft and ArrowRight before building its Message, so
  Messages and `update` stay in reading order, and draws the direction as
  its root's `dir`, so the CSS (a submenu's side, a chevron) reads what the
  keys read. Unset, the keys read left to right and the page's `dir` stands.
- **`readingKeys` for upstream's keys.** Tabs, RadioGroup and Calendar handle
  their arrows in upstream bundles no view option reaches, so
  `Tabs.readingKeys`, `RadioGroup.readingKeys` and `Calendar.readingKeys`,
  passed beside the style, are a Mount that reads each arrow by the
  element's own `:dir()` before upstream's handler sees it. They are opt-in
  for the reason `fluid` is: a Scene test must resolve every Mount with a
  Message, and these send none.
- **Indicators.** `Segmented.fluid`, `Tabs.fluid` and `Nav.fluid` measure
  their indicator again when a `dir` anywhere in the document changes, since
  flipping it moves the items without resizing anything.

## Mechanisms

`Touch` and `Icons` are style mechanisms, not components: no slots, no views.
Compose them into your own slots. The recipes' own controls already stand
44px tall where the pointer is coarse: `Defaults.reset` sets
`--fk-touch-floor` there, and a control's height on the size ladder is at
least that (a region that must stay dense sets it to `0px`). For your own
slots, `Touch.target` floors one control at 44px where the pointer is coarse;
`Touch.targets` floors every boxed control a region draws. `Icons.glyph(size)` draws the icon in `--icon` before the
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

The bridge needs a **consumer-visible attribute bundle**. `Menu`, `Listbox`,
`ComboBox`, `DatePicker`, and `Toast` build (parts of) their element tree
internally and expose no `toView`-style seam, so there is nothing for Mixins
to attach to — a limitation of the exposed render seam, not of Slot
resolution. Each is transcribed from the pinned `@foldkit/ui` source
(attributed in its module) with the missing `toView` added, and a parity
battery draws the fork and upstream's view over the same models; state,
Messages, update, Commands, and Mounts stay upstream in every case. If
upstream gains seams, the forks go away.

`Listbox`, `Combobox` and `Calendar` draw the standard markup from the
styled bundles when `toView` is given no `draw`; pass a `draw` to arrange the
parts yourself.

**The Menu is three layers**, each built on the one before:

```text
Menu.init / update / view      the component: string rows, submenus, a point
        |
MenuSlots, Menu.resolve,       the panel adapter: styles any @foldkit/ui Menu
Menu.toView, fluid,            drawn through the fork, whoever keeps its Model
overlayBars, drawAtPoint,
pointTarget
        |
MenuView                       the fork: @foldkit/ui/menu's view with a toView
```

`MenuView` is the fork; the Menu's Model, `update` and Mounts are upstream's.
The panel adapter styles a Menu drawn through it: `Menu.toView(mixins, { h },
draw?)` is that Menu's `toView`, and without a `draw` draws the panel through
`drawMenu` (`Menu.toView([MenuStyle.mixin], { h })` is a whole styled menu).
Menubar draws its menus this way, and so does an application that folds
`@foldkit/ui`'s Menu itself, for typed items or groups, which the component's
rows do not have. Such a Menu opens at a point with `Menu.drawAtPoint(point,
h)` as `toView`'s `draw` (its button becomes a mark of no size at `point`, an
`Option`, which the anchor places the rows against, so give the anchor `gap:
0`) and `Menu.pointTarget({ onPress, onOpen }, h)` on the area: a right press
sends `onPress` with its point, which the application keeps, and the
`contextmenu` after it (or Shift+F10, or the ContextMenu key) sends `onOpen`,
which the application answers with the Menu's own `Opened` Message, the
browser's menu kept shut. A finger's press sends `onPress` too, so Android's
`contextmenu` for a held finger opens under it; iOS fires none, which the
component's `Menu.target` answers by opening on the hold itself. The component (`Menu.init/update/view`, in the table above) is
this package's own, drawn through the adapter, as the Slider is; its
`Menu.target` is `pointTarget` wired to its own Messages.

`ToastView` follows the fork's shape: `ToastView.make` binds upstream's
`Toast.make` for the payload and swaps in the transcribed view; the dismiss
control stays inside the consumer's `entryToView`, so it is content, not a
slot. `Listbox` forks both variants over one shared transcription
(`ListboxView.create` and `ListboxView.Multi.create` bind the upstream
bundles; the single and multi Models are structurally identical, so the
single adaptor maps `maybeSelectedValue` to `selectedValues` exactly as
upstream's does). The forks add one view input upstream lacks, `direction?:
'ltr' | 'rtl'`: under `'rtl'` a horizontal listbox's ArrowLeft moves to the
next item. `Combobox` follows the same shape over its own shared
transcription (`ComboboxView.create` / `ComboboxView.Multi.create`).

`DatePicker`'s bundles mix the popover's pre-bound groups with the date
picker's own attributes, so they speak only the date picker's Message. Its
`toView` therefore takes no builder of the application's:
`DatePicker.toView(mixins, (resolved, h) => …)` hands `draw` the date
picker's builder, and without a `draw` draws upstream's markup.

A DatePicker also picks a whole `Calendar.Selection`, a range or many days.
Fold it with `DatePicker.update(selection)`, given the selection the
application keeps: upstream closes the popover on every day picked, and this
keeps it open while the day leaves the selection unfinished (a range's first
end, any day of a Multiple selection), reporting `SelectedDate` either way for
the application to fold through `Calendar.picked`. Draw it with
`DatePickerView.view` taking `selection` and `triggerContent: selection =>
Html` in place of upstream's `maybeSelectedDate` and `triggerContent`, and
`toCalendarView: Calendar.toView(selection, mixins, { h })`. Under `name`,
each chosen day is a hidden input of its own, in order (a range's start,
then its end), so `FormData.getAll(name)` reads `[start, end]`; nothing chosen
submits the name once, empty.

`DragAndDrop` and `Animation` do not have adapters here yet.

## Status

The API is still settling in the `0.x` series. This package should stay small:

```text
component state / accessibility -> @foldkit/ui
merge semantics                 -> foldkit-mixins
adapter metadata                -> foldkit-mixins-ui
```

The components that keep a Model here (Menu, Toast, Sheet and the rest) do
so where `@foldkit/ui` has no such component, or composes one beneath them
(a Sheet is a Dialog, a Menubar a row of Menus); when upstream gains one,
the adapter is the better home.

## See also

- [Inside-out view composition](../../docs/mixins.md) — Slot / Style / Behavior mental model.
- [`foldkit-mixins`](../mixins) — resolver and extension contracts.
- [`foldkit-mixins-surface`](../mixins-surface) — derives a SlotView boundary from a Surface.
- [`examples/todo-app`](../../examples/todo-app) — Button and Checkbox adapted in a complete application.

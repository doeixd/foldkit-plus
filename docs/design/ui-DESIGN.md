**Status:** not built; checked against the code on 2026-10-03, when none of
Anatomy, `Collection`, `Overlay`, knobs or the Tier A widgets existed. The text
is a ChatGPT conversation kept as written, citation markers included. Open
phases are tracked in [TODO.md](./TODO.md) "UI platform". Its DataTable is
superseded by [data-grid-DESIGN.md](./data-grid-DESIGN.md).

Yes. I looked at the current `foldkit-plus` main branch, Foldkit’s `@foldkit/ui`, and the current Base UI/shadcn surfaces. You already have more of the *underlying architecture* than I expected. The main problem now is that the UI story is **unevenly filled in**.

`@foldkit/ui` already gives you Button, Calendar, DatePicker, Checkbox, Combobox, Dialog, DragAndDrop, Disclosure, Fieldset, FileDrop, Listbox, Menu, Nav, Popover, RadioGroup, Select, Slider, Switch, Tabs, Toast, Tooltip, VirtualList, etc. And `foldkit-mixins-ui` already adapts a meaningful subset into Slots/Mixins and has the beginnings of a real design system through `Recipes`, typed theme tokens, variants, accessibility patterns, layers, and primitives such as focus management, list/grid/tree navigation, press, dismiss layers, selection, presence/motion, live announce, and so on.

So I **wouldn't build “a shadcn clone.”** I'd turn what you already have into a complete **Foldkit UI platform**.

Base UI is a useful target because its philosophy is almost exactly where you're already heading: accessible, headless, composable primitives. Shadcn adds the other half: coherent styled recipes, higher-level assemblies, distribution, and predictable composition.

## The architecture I think Foldkit-plus wants

I would formalize the UI stack into roughly:

```text
              APPLICATION UI
                    │
        ┌───────────┴───────────┐
        │                       │
     Blocks                 Components
 dashboard/sidebar/      Button/Dialog/
 auth/settings/etc.      Combobox/etc.
        │                       │
        └───────────┬───────────┘
                    │
                 Recipes
        variants / sizes / tones
        density / shape / motion
                    │
                  Slots
        public composition seams
                    │
             Behaviors / Mixins
      interaction / decoration /
      analytics / accessibility
                    │
                Primitives
 focus / selection / presence /
 dismiss / positioning / drag /
 navigation / keyboard / etc.
                    │
             Foldkit UI state
       Bundle/Submodel/Message
                    │
                 Platform
      DOM / native elements / CSS
```

That's substantially more interesting than:

```text
Foldkit + ported shadcn components
```

because **every layer remains composable with the rest of Foldkit**.

---

# 1. The biggest immediate hole: finish `mixins-ui`

This is the first thing I would do.

Right now your README explicitly says that several Foldkit UI components cannot participate properly:

> `Menu`, `Listbox`, `ComboBox`, and `DatePicker` don't expose the necessary consumer-visible render seam.

And these simply haven't gotten adapters yet:

> `Toast`, `FileDrop`, `VirtualList`, `DragAndDrop`, `Animation`.

That creates a strange boundary where:

```text
Button       ✅ Foldkit-plus native
Dialog       ✅ Foldkit-plus native
Tabs         ✅ Foldkit-plus native

Combobox     ⚠️ Foldkit UI only
Menu         ⚠️ Foldkit UI only
DatePicker   ⚠️ Foldkit UI only
Toast        ⚠️ not integrated
VirtualList  ⚠️ not integrated
```

Before creating dozens of new widgets, I'd fix this.

### Upstream Foldkit PRs

Give all of these the same `toView`/parts seam that your existing adapters consume:

```ts
Menu.view({
  ...
  toView(parts) {
    // trigger
    // popup
    // item
    // separator
    // checkboxItem
    // radioItem
    // ...
  }
})
```

Then `foldkit-mixins-ui` can publish:

```ts
MenuSlots = Slots.define({
  trigger: ...,
  popup: ...,
  item: ...,
  itemIndicator: ...,
  group: ...,
  groupLabel: ...,
  separator: ...,
  submenuTrigger: ...,
})
```

This is extremely high leverage.

Base UI's Menu alone exposes trigger, popup, item, link item, submenu, groups, checkbox items, radio items, separators, positioning, etc. You want Foldkit's Menu to expose a similarly complete *part vocabulary* without copying Base UI's React API.

---

# 2. Fill out the behavioral component primitives

Then I'd create the missing **behaviorally significant widgets**.

These are not merely styling recipes.

### Tier A — do next

| Primitive | Build from |
|---|---|
| `Accordion` | Disclosure + Collection |
| `AlertDialog` | Dialog policy |
| `Autocomplete` | Input + ListNavigation + Selection |
| `CheckboxGroup` | Checkbox + Selection |
| `Combobox` | existing Foldkit Combobox + Slots |
| `ContextMenu` | Menu + pointer trigger |
| `Drawer` | Dialog + Move + Presence |
| `Menubar` | Menu + RovingTabindex |
| `NavigationMenu` | Menu/Popover + HoverIntent |
| `NumberField` | Input + increment/decrement |
| `OtpField` | collection of Input cells |
| `ScrollArea` | scroll primitives |
| `Toggle` | Press + pressed state |
| `ToggleGroup` | Toggle + Selection |
| `Toolbar` | RovingTabindex + arbitrary controls |

That gets you essentially all of the major Base UI interaction vocabulary. Base UI currently exposes things including Accordion, Alert Dialog, Autocomplete, Checkbox Group, Context Menu, Drawer, Menubar, Navigation Menu, Number Field, OTP Field, Scroll Area, Toggle Group and Toolbar that aren't first-class Foldkit-plus concepts today.

And several of these become almost trivial given your primitives.

For example:

```text
Toolbar
 =
Collection
+ RovingTabindex
+ Orientation
+ FocusVisible
```

not a bespoke component state machine.

And:

```text
ContextMenu
 =
Menu
+ alternate trigger behavior
```

Likewise:

```text
AlertDialog
 =
Dialog
+ required explicit response
+ destructive/cancel semantics
```

This is where your architecture starts paying dividends.

---

# 3. Don't make everything a stateful component

This is where shadcn differs from Zag/Base UI.

A **huge** portion of shadcn is really reusable visual grammar, not interactive state machines. Its current catalog includes things like Card, Badge, Alert, Aspect Ratio, Button Group, Empty, Input Group, Item, Kbd, Skeleton, Spinner, Table and Typography in addition to interactive widgets.

These should **not** become Bundles.

I'd introduce something like:

```text
foldkit-plus/ui
    ├── components
    ├── patterns
    ├── recipes
    └── blocks
```

or preserve packages but establish these conceptual categories.

### Stateless visual primitives

You need:

```text
Alert
AspectRatio
Avatar
Badge
Breadcrumb
Card
Empty
Icon
Item
Kbd
Label
Separator
Skeleton
Spinner
Table
Typography
VisuallyHidden
```

These could mostly be **SlotViews + Recipes**, not stateful Bundles.

Example:

```ts
const Card = SlotView.define({
  slots: {
    root: Container,
    header: Container,
    title: Text,
    description: Text,
    content: Container,
    footer: Container,
    action: Container,
  }
})
```

Then:

```ts
Card.recipe({
  elevation: "raised",
  padding: "md",
  radius: "md"
})
```

No state machine required.

---

# 4. Add composition primitives like shadcn's newer components

These are surprisingly valuable.

Shadcn has been moving toward reusable boring composition pieces such as `ButtonGroup`, `InputGroup`, `Field`, `Item`, and `Empty`, precisely because applications recreate them constantly.

Foldkit-plus should absolutely have equivalents.

### `Field`

Especially important because of your `form` package.

Conceptually:

```ts
Field
├── Label
├── Control
├── Description
└── Error
```

But Foldkit-plus can do better because it knows actual form state:

```ts
Field.from(Form.field("email"))
```

could derive:

```text
aria-invalid
aria-describedby
required
disabled
dirty
touched
validating
error text
```

through Mixins automatically.

That is much stronger than a generic React Field.

---

### `InputGroup`

```text
InputGroup
├── Prefix
├── Input
├── Suffix
├── Button
└── Addon
```

This unlocks:

```text
🔍 Search...
$ 100.00
example.com / username
password [show]
```

while preserving the Input's native state ownership.

---

### `Item`

This is worth having as a generic layout primitive:

```text
Item
├── Media
├── Content
│   ├── Title
│   └── Description
└── Actions
```

Then it becomes the common visual language for:

```text
menus
command palettes
settings
results
notifications
files
contacts
lists
```

---

# 5. You need a first-class overlay system

You're already remarkably close.

You currently have:

```text
Anchor
DismissLayer
FocusScope
ScrollLock
HideOutside
Presence
HoverIntent
```

That's basically the pieces of a serious overlay system.

I would turn them into a shared primitive:

```ts
Overlay.make({
  modality: "modal" | "non-modal",
  dismiss: {
    escape: true,
    outside: true,
  },
  focus: {
    trap: true,
    restore: true,
  },
  positioning: Anchor.bottomStart(),
  presence: Motion.fadeScale(),
})
```

Then:

```text
Dialog
Popover
Tooltip
Menu
Select
Combobox
HoverCard
ContextMenu
NavigationMenu
CommandPalette
DatePicker
```

all share the same infrastructure.

Otherwise you'll eventually have nine subtly different implementations of:

- portals/top-layer
- dismissing
- focus restore
- scroll locking
- outside interaction
- positioning
- transitions
- presence

Your primitives already suggest the right answer. Formalize it.

---

# 6. Create a real `Collection` primitive

You have pieces of this already in Behaviors and interaction primitives.

But Collection should become **one of the fundamental UI concepts**.

Something roughly like:

```ts
const collection = Collection.make(items, {
  id: x => x.id,
  disabled: x => x.disabled,
  text: x => x.label,
})
```

Then it should compose with:

```ts
collection.with(Selection.single())
collection.with(ListNavigation.vertical())
collection.with(Typeahead())
collection.with(Virtualization())
collection.with(DragReorder())
```

That single abstraction can power:

```text
Listbox
Select
Combobox
Menu
Command
RadioGroup
ToggleGroup
Tabs
Tree
Grid
Palette
Carousel
Pagination
```

Zag's great insight is that robust widgets are really coordinated state machines rather than piles of component callbacks. Foldkit is naturally positioned to take that idea even further.

---

# 7. Build the missing "Zag-ish" advanced widgets

Once Collection + Overlay are solid, go wider.

I would add:

```text
ColorPicker
Editable
Pagination
PinInput / OTP
Progress
Meter
Rating
SplitPane / Resizable
TagsInput
TreeView
Carousel
Tour
Clipboard
FileUpload
SignaturePad
```

And particularly:

### `TreeView`

You already have `TreeNavigation`.

So this should be a showcase of your architecture rather than a giant bespoke package:

```text
Tree
 =
TreeNavigation
+ Selection
+ Collection
+ Disclosure
+ DragAndDrop?
+ VirtualList?
```

That could become **better than the typical UI-library tree**.

---

# 8. Introduce "knobs" as something distinct from recipe variants

I think your instinct about knobs is very good.

You already have:

```ts
Button({
  tone: "danger",
  variant: "outline",
  size: "sm"
})
```

Those are **component variants**.

But there should also be **design-system-wide controls**.

For example:

```ts
Theme.knobs({
  density: "compact",
  radius: "soft",
  contrast: "normal",
  motion: "expressive",
  scale: "comfortable",
})
```

Or perhaps:

```ts
const AppTheme = Theme.compose(
  Theme.oklch(...),
  Knobs.density("compact"),
  Knobs.radius("md"),
  Knobs.motion("subtle"),
)
```

I would distinguish:

### Tokens

Raw-ish semantic values:

```text
space.sm
radius.md
text.muted
surface.elevated
motion.fast
```

### Knobs

Global semantic transformations:

```text
density: compact | normal | spacious
radius: none | subtle | round
motion: none | subtle | expressive
contrast: soft | normal | strong
controlSize: sm | md | lg
```

### Variants

Local component choices:

```text
Button.variant = solid | outline | ghost
Button.tone = accent | neutral | danger
```

### State

Runtime component state:

```text
hovered
pressed
selected
disabled
open
invalid
```

That separation would make the system extremely understandable.

---

# 9. Themes should become composable objects, not just token sheets

You're already most of the way there with `Theme.compose`, `Theme.tokens`, `Theme.oklch`, and CSS variables.

I'd make themes first-class:

```ts
const Ocean = Theme.make({
  palette: Theme.oklch(...),
  knobs: {
    radius: "sm",
    density: "comfortable",
    motion: "subtle",
  },
})
```

Then:

```ts
Ocean.dark
Ocean.light

Ocean.scope(".admin")
Ocean.with({
  accent: "violet"
})
```

And:

```ts
ThemeProvider // conceptually, not necessarily React/provider semantics
Theme.scope(...)
Theme.override(...)
Theme.system()
```

Critically, recipes should only talk to **semantic tokens**, which you're already doing.

That's excellent.

---

# 10. Add responsive and container-query style Mixins

This feels like a missing styling primitive.

Something like:

```ts
Style.responsive({
  base: ...,
  sm: ...,
  md: ...,
  lg: ...,
})
```

but preferably compositional:

```ts
Style.when(Media.md, ...)
Style.when(Container.atLeast("sm"), ...)
Style.when(Preference.reducedMotion, ...)
Style.when(Preference.highContrast, ...)
```

Then UI recipes can react to:

```text
viewport
container
color scheme
reduced motion
pointer precision
hover ability
contrast
```

without leaking ad-hoc CSS.

---

# 11. Add recipe composition / inheritance aggressively

Your existing:

```ts
Recipes.Button.extend(...)
```

is exactly the direction I'd keep pushing.

I want to be able to say:

```ts
const IconButton = Recipes.Button.extend({
  base: ...
})
```

and:

```ts
const DestructiveIconButton =
  IconButton.with({
    tone: "danger",
    variant: "ghost",
  })
```

Potentially:

```ts
Recipe.compose(
  Recipes.Control,
  Recipes.Focusable,
  Recipes.Surface,
)
```

There should be a small number of shared lower-level recipes:

```text
Control
Surface
FloatingSurface
Text
Interactive
FocusRing
Field
CollectionItem
```

Then components specialize them.

Instead of Button and Select independently encoding:

```text
height
border
radius
disabled
focus
font size
transition
```

you get:

```text
Control
├── Button
├── Input
├── Select
├── Toggle
└── ComboboxInput
```

This makes the library visually coherent almost automatically.

---

# 12. Foldkit-plus needs a `Command` / command-palette story

This is conspicuously missing given your project.

Shadcn's `Command` is one of its most useful application primitives.

Foldkit-plus could do it *very* naturally:

```text
Command
 =
Collection
+ fuzzy/filter state
+ ListNavigation
+ Selection
+ Overlay (optional)
```

Example:

```ts
Command.make({
  items,
  filter: command => command.label,
  onSelect: CommandSelected,
})
```

Then:

```text
CommandPalette
Combobox
Autocomplete
Spotlight search
Action picker
Slash menu
```

are variations of the same model.

Given your agent/CMS work, this would be particularly useful.

---

# 13. Add data-display/application primitives

Shadcn has a whole useful layer that neither Base UI nor Zag focuses on.

I would add:

```text
Table
DataTable
Pagination
Chart shell
EmptyState
Skeleton
Avatar
Badge
Breadcrumb
Sidebar
Resizable
ScrollArea
Card
Stat
Timeline
DescriptionList
```

But keep these mostly **view/recipe oriented**, not state-machine oriented.

For `DataTable`, though, leverage Foldkit (superseded by
[data-grid-DESIGN.md](./data-grid-DESIGN.md), which builds a grid from a
`RowModel`, typed Columns and a `GridProjection` instead):

```text
DataTable
 =
Collection
+ Selection
+ Sorting
+ Pagination
+ VirtualList
+ ColumnSizing
```

Again: composition instead of giant widget.

---

# 14. Blocks should exist above components

Shadcn got something important right here too.

Components aren't enough.

You eventually want:

```text
blocks/
  login
  signup
  settings
  sidebar
  dashboard
  data-table
  command-palette
  profile
  pricing
  empty-state
```

But Foldkit versions can demonstrate actual architecture:

```ts
SettingsPage
  = Form
  + Surface
  + Field
  + Tabs
  + Remote
```

rather than merely copied JSX.

---

# 15. I'd make the Foldkit-plus component taxonomy explicit

Something like this:

```text
PRIMITIVES
Press
Move
Presence
Anchor
Selection
Collection
Overlay
Focus
Navigation
Dismiss
Announce

BEHAVIORS
RovingFocus
Typeahead
Drag
HoverIntent
FocusVisible
Dismissable
Selectable

HEADLESS COMPONENTS
Button
Dialog
Menu
Combobox
Select
Tabs
Tree
Drawer
Command
...

VISUAL PRIMITIVES
Card
Badge
Text
Stack
Separator
Skeleton
Item
Field
InputGroup

RECIPES
ButtonRecipe
FieldRecipe
DialogRecipe
MenuRecipe
...

THEMES
Tokens
Palette
Knobs
Theme
ScopedTheme

BLOCKS
Sidebar
Auth
Settings
DataTable
Dashboard
...
```

That makes the story legible immediately.

---

# The concrete missing component backlog

If I were opening issues right now, I'd group them like this:

**P0 — complete the foundation:** expose render seams upstream for Menu, Listbox, Combobox and DatePicker; add Mixins adapters for those plus Toast, FileDrop, VirtualList, DragAndDrop and Animation; formalize `Overlay`; formalize `Collection`; create shared Control/Surface/Field recipes; expand Theme with global knobs.

**P1 — Base UI completeness:** Accordion, AlertDialog, Autocomplete, CheckboxGroup, ContextMenu, Drawer, Field, Menubar, Meter, NavigationMenu, NumberField, OTPField, Progress, ScrollArea, Separator, Toggle, ToggleGroup, Toolbar and Preview/HoverCard. Base UI's present component set is a very sensible minimum completeness target.

**P2 — shadcn application vocabulary:** Alert, AspectRatio, Avatar, Badge, Breadcrumb, ButtonGroup, Card, Command, Empty, InputGroup, Item, Kbd, NativeSelect, Pagination, Resizable, Skeleton, Spinner, Table, DataTable, Sidebar and Typography.

**P3 — advanced/Zag territory:** ColorPicker, Editable, Rating, TagsInput, TreeView, Carousel, Splitter, Tour, Clipboard, richer FileUpload and more sophisticated composite widgets.

---

## And the most important part

I **would not** make the public UX look like this:

```ts
import { ZagMachineThing } ...
import { Mixins } ...
import { Bundle } ...
import { Behavior } ...
import { Recipe } ...
```

for ordinary use.

The internal implementation can be sophisticated while normal usage looks like:

```ts
const SaveButton = Button.make({
  tone: "accent",
  size: "md",
  onPress: Message.Save(),
})
```

or:

```ts
const Country = Combobox.make({
  items: countries,
  value: model.country,
  onChange: Message.CountryChanged,
})
```

and then **power users peel downward**:

```text
Component
 ↓
recipe
 ↓
slots
 ↓
mixins
 ↓
behaviors
 ↓
primitives
 ↓
Bundle
```

That is the differentiator I think you're converging on:

> **Foldkit-plus should offer the completeness of shadcn, the behavioral rigor of Zag/Base UI, but with Foldkit's state/message architecture and a single compositional system running all the way from low-level interaction primitives to complete application blocks.**

And given what's currently in the repo, you're not starting this from scratch at all. The `Slots → Mixins → Recipes → Theme`, `A11y.pattern`, and interaction-primitives work is already basically the skeleton of this system. The next phase should be **filling the matrix and consolidating shared primitives**, rather than inventing another abstraction layer.

Exactly. And I think that changes the priority quite a bit.

The interesting question isn't really “what components are missing?” It's:

**What reusable capabilities are missing such that whole families of components become easy to express?**

With your current Mixins/Style/Behavior/Slots model, a lot of what shadcn/Base UI expose as separate components can probably collapse into a much smaller set of reusable UI capabilities.

For example, instead of implementing `Menu`, `ContextMenu`, `Menubar`, `Command`, `Select`, `Combobox`, `NavigationMenu`, and `Listbox` as largely independent things, you can think in terms of:

```text
Collection
Selection
Navigation
Typeahead
Overlay
Anchor
Dismiss
Presence
Focus
Press
```

Then the components become particular compositions of those.

That suggests a stronger roadmap:

- **Finish the “capability algebra” first:** Collection, Overlay, Focus, Selection, Navigation, Presence, Drag, Positioning, Validation, Disclosure, Form-control semantics.
- **Make Styles equally compositional:** Surface, Control, Text, FloatingSurface, FocusRing, CollectionItem, Field, Indicator, Divider, IconButton, etc.
- **Make component recipes thin:** a Button recipe shouldn't independently know how every border/radius/focus/disabled state works. It should compose `Control + Interactive + tone + size`.
- **Let Slots define anatomy:** the component says “I have `trigger`, `content`, `item`, `indicator`,” while Behaviors and Styles attach meaning to those pieces.
- **Then generate lots of components cheaply:** Accordion becomes Disclosure over a collection; Toolbar becomes RovingFocus over arbitrary controls; ToggleGroup becomes Selection + Press; Command becomes Collection + filtering + ListNavigation; Tree becomes TreeNavigation + Disclosure + Selection; Drawer becomes Overlay + Move + Presence.

I think there's also a second opportunity: **cross-component behaviors** that normal UI libraries can't really express cleanly.

Things like:

```ts
Behaviors.disabled(...)
Behaviors.pending(...)
Behaviors.validation(...)
Behaviors.keyboardShortcut(...)
Behaviors.tooltip(...)
Behaviors.analytics(...)
Behaviors.hotkey(...)
Behaviors.dragHandle(...)
Behaviors.copy(...)
Behaviors.longPress(...)
Behaviors.contextMenu(...)
```

could attach to compatible Slots regardless of the original component.

So a Button, MenuItem, Card action, Tree node, or arbitrary custom control could all gain the same capability without each component exposing a bespoke prop.

And Style can work the same way:

```ts
Styles.surface(...)
Styles.control(...)
Styles.interactive(...)
Styles.focusRing(...)
Styles.elevation(...)
Styles.density(...)
Styles.truncate(...)
Styles.scrollable(...)
Styles.selected(...)
Styles.invalid(...)
```

This is where I think Foldkit-plus can actually surpass the libraries you're using as references. Zag/Base UI mostly give you **component primitives**. shadcn mostly gives you **component recipes**. Your system can give users **reusable semantic capabilities that compose across components**.

A good conceptual target might be:

```text
Anatomy     → Slots
Appearance  → Style
Behavior    → Behavior
State       → Bundle/Submodel
Composition → Mixins
Policy      → Recipe
System-wide → Theme / Knobs
```

Then something like a Combobox isn't really a monolith anymore:

```text
Combobox anatomy
  root
  label
  input
  trigger
  popup
  list
  item
  itemIndicator
  empty

state
  query
  open
  highlighted
  selected

behaviors
  Collection
  ListNavigation
  Typeahead
  Selection
  Overlay
  Dismiss
  Anchor

styles
  Field
  Control
  FloatingSurface
  CollectionItem
  Indicator
```

That is a much cleaner model than “here are 70 bespoke components.”

So I would actually spend the next design pass building a **capability matrix** rather than a component checklist: rows are Base UI/Zag/shadcn widgets, columns are the underlying Foldkit-plus primitives/mixins/styles they require. The empty columns will show you the real missing pieces. Once those are filled, a surprising number of the “missing components” become mostly anatomy + configuration.

Absolutely. After looking through Affe’s UI work, I’d go further: **Affe should be one of the main design inputs for the Foldkit-plus UI roadmap.** A lot of the research you did there answers questions we were just circling around.

The key is not to port Affe’s implementation. Foldkit already has the better native substrate for this project: Bundle/Submodel/Message, `@foldkit/ui`, Slots, Mixins, Behaviors, Styles, Surfaces, etc. But several **design principles and abstractions from Affe are excellent candidates to transplant.**

The biggest one is Affe’s **“six layers” widget model**. Your `kit/dialog.ts` literally documents the widget as:

```text
tokens
  ↓
recipe
  ↓
anatomy + A11y pattern
  ↓
machine
  ↓
behavior
  ↓
assembled component
```

That is extremely close to what Foldkit-plus wants. I would adapt it slightly:

```text
Theme / Tokens / Knobs
        ↓
Recipe
        ↓
Anatomy / Slots / A11y Pattern
        ↓
Bundle / primitive state
        ↓
Behavior / Mixins
        ↓
Foldkit UI component / SlotView
```

That could become the **formal architecture of Foldkit-plus UI**, rather than an implicit collection of packages.

And Affe has several other ideas I'd explicitly bring over.

### 1. Anatomy should be first-class

Affe has:

```ts
const Anatomy = View.Slots.define({
  root: ...,
  trigger: ...,
  content: ...,
})
```

That's a really useful framing.

Foldkit-plus already has Slots, but right now we tend to talk about them as extension points. I think they should also be treated as the component's **anatomy**.

So:

```ts
Dialog.Anatomy

Menu.Anatomy

Combobox.Anatomy

Tree.Anatomy
```

could just be typed Slot contracts.

For example:

```ts
const ComboboxAnatomy = Slots.define({
  root: ...,
  label: ...,
  control: ...,
  input: ...,
  trigger: ...,
  popup: ...,
  list: ...,
  item: ...,
  indicator: ...,
  empty: ...,
})
```

Then practically everything attaches to the anatomy:

```text
Styles    → anatomy
Behaviors → anatomy
A11y      → anatomy
Recipes   → anatomy
agents    → anatomy metadata
testing   → anatomy
```

That's a strong unifying concept.

---

### 2. Affe's capability-typed slots are worth pushing further in Foldkit-plus

Affe did substantial work around this.

A behavior could say:

```ts
Behavior.make<{
  input: Element.TextInput
  items: Element.Collection<Element.Interactive>
}>(...)
```

and then attachment was statically checked:

```ts
Behavior.attachBySlots(behavior, {
  input: "search",
  items: "options",
})
```

while attaching `input` to a generic container failed at compile time.

Foldkit-plus already has:

```text
Capability.Container
Capability.Focusable
...
```

I'd strongly expand this idea.

Maybe the eventual capability vocabulary is something like:

```text
Base
Container
Text
Focusable
Interactive
Pressable
TextInput
FormControl
Selectable
Draggable
Scrollable
Collection
OverlayTrigger
OverlayContent
```

Not necessarily inheritance-heavy, but enough semantic information that Mixins can tell you:

> This Behavior can attach here.

Then something like:

```ts
Behaviors.tooltip()
```

doesn't care whether the trigger belongs to:

```text
Button
MenuItem
TreeItem
Avatar
Card
custom application component
```

It only asks:

```text
does this Slot satisfy Interactive/Focusable?
```

That's exactly the kind of cross-component composability that makes Foldkit-plus special.

---

### 3. Affe's headless composables are directly relevant

The `createCombobox` work is a good example.

It creates:

```text
trigger
input
listbox
content
option collection

isOpen
query
filtered
selected
activeIndex

open()
close()
toggle()
select()
clearSelection()
...
```

from a reusable behavior.

For Foldkit-plus, I wouldn't preserve that exact “bindings object” shape, because Foldkit's Model/Messages are a better home for state.

But the architectural insight is excellent:

> A sophisticated widget is often a composition of reusable headless capabilities attached to typed anatomy.

So instead of a giant `Combobox` implementation:

```text
Combobox
 =
Collection
+ Filter
+ Selection
+ ListNavigation
+ Overlay
+ Anchor
+ Dismiss
+ Field
```

That's very much the direction Affe was exploring.

---

### 4. Bring over the “no-fork guarantee”

This might be one of the most important principles in Affe's kit research.

The Dialog comments explicitly say:

> if a reasonable customization needs the widget's source, that is a kit API bug.

That's excellent.

I'd adopt that almost verbatim as a Foldkit-plus UI design criterion.

A component should expose enough independent layers that users can replace or extend:

```text
theme
recipe
anatomy
behavior
state implementation
assembled default
```

without copying the whole component.

So users should be able to take:

```ts
Dialog.Anatomy
Dialog.behavior
Dialog.recipe
```

and create:

```ts
MyDialog
```

without forking `Dialog.ts`.

That gives Foldkit-plus a much stronger customization story than most UI kits.

---

### 5. Affe's “platform floor” idea is excellent

This one definitely belongs.

Affe Dialog explicitly records:

```ts
platformFloor = {
  element: "dialog",
  covers: [
    "focus-trap",
    "escape-dismiss",
    "inert",
    "top-layer",
    "backdrop"
  ]
}
```

That's a very good discipline.

Rather than implementing JavaScript because other UI libraries do it, ask:

> What does the browser already guarantee?

Then the Foldkit component adds only what it must.

This fits beautifully with the current Foldkit-plus A11y catalog, which already has `floor`.

I'd generalize it beyond documentation:

```ts
Platform.dialog
Platform.popover
Platform.details
Platform.input
Platform.select
Platform.invokerCommands
```

and component metadata could say:

```ts
Dialog.pattern.floor
Popover.pattern.floor
Disclosure.pattern.floor
```

Potentially with capability detection/fallback policy.

That would keep the library smaller and more robust.

---

### 6. Affe's A11y gate should absolutely be copied conceptually

Affe has a registry where:

```text
every widget
→ declares an A11y pattern
→ provides example props
→ is rendered
→ automatically validated
```

and the rule is effectively:

> A widget without a passing pattern contract does not ship.

Foldkit-plus already has `A11y.pattern` and `Patterns.catalog`.

So this feels like a very natural next step.

Have one registry:

```ts
UI.catalog
```

containing metadata like:

```ts
{
  name: "combobox",
  anatomy: ComboboxSlots,
  pattern: Patterns.Combobox,
  recipe: Recipes.Combobox,
  tier: "stateful",
  floor: [...],
}
```

Then CI automatically checks every component.

That catalog can eventually power:

```text
docs
DevTools
agent discovery
visual explorer
accessibility tests
recipe playground
component generator
```

That's much more valuable than just a hand-maintained documentation list.

---

### 7. Affe did useful recipe research too

The Style API had both:

```ts
Style.variants(...)
```

and multipart:

```ts
Style.recipe({
  slots: ["root", "title"],
  base: {...},
  variants: {...},
  defaults: {...}
})
```

Foldkit-plus Recipes are already better aligned with Foldkit, but I'd bring across the **multipart recipe model** explicitly.

Something like:

```ts
const MenuRecipe = Recipe.define(Menu.Anatomy, {
  base: {
    popup: FloatingSurface,
    item: CollectionItem,
    separator: Divider,
  },

  variants: {
    density: {
      compact: {...},
      normal: {...},
    },
  },

  defaults: {
    density: "normal",
  },
})
```

The recipe should know the Anatomy contract at the type level.

That means you can't accidentally write:

```ts
foo: ...
```

when `foo` isn't a Menu slot.

---

### 8. Affe's typed token sugar has some good ideas too

The property-sensitive token resolution was thoughtful:

```ts
backgroundColor: "surface"
fontSize: "body.md"
borderRadius: "md"
```

where `"md"` is interpreted according to the CSS property rather than globally.

Your Foldkit-plus Theme system seems to have evolved beyond parts of Affe's implementation, so I wouldn't blindly port this.

But there are ideas worth keeping:

**Typed semantic token paths:** invalid theme references should be compile errors where possible.

**Extensible schemas:** Affe allowed application themes to add:

```ts
color.brand.tertiary
spacing.page.gutter
```

while preserving inference.

**Theme layers:** component recipes consume semantic variables rather than concrete colors.

And now add the Foldkit-plus-specific global **knobs** on top of that.

---

### 9. The Style utilities in Affe point toward a reusable visual capability library

The styled combobox uses:

```ts
StyleUtils.interactive
StyleUtils.rounded("md")
StyleUtils.bordered()
StyleUtils.elevated("md")
StyleUtils.padded("sm")
```

That's exactly the idea we were just discussing, though I'd make it more systematic in Foldkit-plus.

For example:

```text
Styles.Control
Styles.Surface
Styles.FloatingSurface
Styles.Interactive
Styles.CollectionItem
Styles.FocusRing
Styles.Field
Styles.Divider
Styles.Icon
```

Then recipes compose those.

So:

```ts
Recipes.Button
```

might basically be:

```text
Control
+ Interactive
+ FocusRing
+ tone
+ variant
+ size
```

while:

```ts
Recipes.MenuItem
```

is:

```text
CollectionItem
+ Interactive
+ FocusRing
+ density
```

This reduces massive duplication.

---

### 10. Affe's public/hidden Slots idea is interesting

This is one I hadn't mentioned before.

Affe's component Slot contracts could mark slots as hidden, while deriving:

```ts
PublicSlotsOf<Component>
HiddenSlotsOf<Component>
```

That's potentially very useful for Foldkit-plus.

Some slots should be customization surfaces:

```text
root
trigger
content
item
```

while some are implementation details:

```text
sentinel
measurementHost
hiddenInput
focusProxy
```

Today we might expose all of these simply because they're Slots.

Instead:

```ts
Slot.make({
  capability: ...,
  visibility: "public"
})
```

versus:

```ts
visibility: "internal"
```

Then Styles/Behaviors from inside the component can target internals, but consumers only get the supported public contract.

That's a very clean long-term API stability mechanism.

---

## So I think the combined architecture gets clearer

Take the best Affe research and map it onto Foldkit's stronger architecture:

```text
                    UI Catalog
                       │
                ┌──────┴───────┐
                │              │
          A11y Pattern     Platform Floor
                │              │
                └──────┬───────┘
                       │
                    Anatomy
                     Slots
                       │
       ┌───────────────┼────────────────┐
       │               │                │
    Styles         Behaviors       State Primitives
       │               │                │
    Recipe           Mixins        Bundle/Submodel
       │               │                │
       └───────────────┼────────────────┘
                       │
                Foldkit UI widget
                       │
                 higher patterns
                       │
                    Blocks
```

And I think **Anatomy + Capability + Pattern** deserves to become a particularly explicit triad:

```text
Anatomy
  "what parts exist?"

Capability
  "what can each part do?"

Pattern
  "what must those parts do together?"
```

Then:

```text
Style
  "how do they look?"

Behavior
  "what reusable interaction attaches to them?"

Bundle
  "what state/effects does the widget own?"

Recipe
  "what is the default design policy?"
```

That is a remarkably coherent UI architecture.

## The best next step may actually be a research merge

Before implementing twenty components, I'd go through Affe's UI work systematically and classify every worthwhile idea into:

```text
Already exists in Foldkit-plus
→ keep

Exists but Affe version reveals missing capability
→ improve

Missing from Foldkit-plus and valuable
→ port concept

Affe-specific/runtime-specific
→ don't port
```

From what I've seen already, the high-value candidates are:

- **Six-layer widget decomposition**
- **Anatomy as typed Slots**
- **Capability-based Behavior compatibility**
- **public vs internal Slots**
- **platform-floor metadata**
- **mechanized accessibility gate**
- **UI/component catalog**
- **headless composable capability assembly**
- **multipart typed recipes**
- **shared visual Style capabilities**
- **strong token-schema inference**
- **the no-fork guarantee**

So yes: I think our previous Foldkit-plus UI roadmap was actually missing an important source. **Zag + Base UI + shadcn tell us what surface area to cover; Affe tells us a lot about how the Foldkit-native architecture for covering it should work.**


I’d tackle this as an **architecture-first program**, not a component sprint. The source material points to the same core conclusion repeatedly: the real goal is a Foldkit-native UI platform where components are thin compositions over reusable capabilities, anatomy, styles, behaviors, recipes, and state.

The work should therefore be sequenced so that every new primitive unlocks multiple components instead of adding isolated widgets.

## Phase 0 — Write down the UI contract

Before implementing anything major, formalize the model you’re already converging on:

```text
Theme / Tokens / Knobs
        ↓
Recipe
        ↓
Anatomy / Slots / A11y Pattern
        ↓
State / Bundle / Primitive
        ↓
Behavior / Mixins
        ↓
Assembled Widget
        ↓
Higher-level Patterns
        ↓
Blocks
```

This combines the Affe six-layer research with Foldkit’s stronger state/message architecture. The Affe material specifically argues for anatomy, recipes, state, behavior, and assembled widgets as separately replaceable layers, with a “no-fork guarantee” for customization.

The deliverable for this phase should be a short `docs/ui-architecture.md` that defines:

- **Anatomy:** what parts exist.
- **Capability:** what each slot is allowed/capable of doing.
- **Pattern:** what those parts must do together.
- **Behavior:** reusable interaction attached to compatible anatomy.
- **State:** Bundle/Submodel/primitive-owned state.
- **Style:** visual capability.
- **Recipe:** default visual/design policy.
- **Theme/Knobs:** system-wide policy.
- **Widget:** assembled default.
- **Block:** application-level composition.

That vocabulary should become canonical before APIs proliferate. The same Anatomy → Capability → Pattern distinction is already identified in the research as the clean conceptual center.

---

# Phase 1 — Finish the substrate

This is the most important implementation phase.

Do **not** start by building Accordion, Drawer, Carousel, etc. First finish the things that make those widgets cheap.

### 1A. Finish `foldkit-mixins-ui`

The existing inconsistency should disappear first.

Upstream Foldkit needs render/parts seams for:

```text
Menu
Listbox
Combobox
DatePicker
```

Then add Foldkit-plus adapters for those plus:

```text
Toast
FileDrop
VirtualList
DragAndDrop
Animation
```

The current source explicitly identifies these as the major hole in `mixins-ui`.

Every adapted component should expose a full typed anatomy, not just the minimum currently needed.

For example:

```ts
Menu.Anatomy = Slots.define({
  trigger,
  popup,
  item,
  itemIndicator,
  checkboxItem,
  radioItem,
  group,
  groupLabel,
  separator,
  submenuTrigger,
})
```

This becomes the standard shape going forward.

### 1B. Make Anatomy first-class

You don’t necessarily need a new implementation type.

It could simply be convention/API:

```ts
Dialog.Anatomy
Menu.Anatomy
Combobox.Anatomy
```

backed by existing Slots.

But every widget should expose one.

Affe’s research showed the value of anatomy as the common target for styles, behaviors, accessibility, tooling, testing, and agents.

### 1C. Expand slot capabilities

Audit the existing `Capability` model and make sure it can express the behaviors you want to attach cross-component.

Likely useful capabilities include:

```text
Base
Container
Text
Focusable
Interactive
Pressable
TextInput
FormControl
Selectable
Draggable
Scrollable
CollectionItem
CollectionContainer
OverlayTrigger
OverlayContent
```

Avoid arbitrary taxonomy growth; add a capability only when it enables meaningful static compatibility.

The important property is:

```ts
Behavior.attach(...)
```

should reject incompatible anatomy at compile time.

Affe already researched exactly this behavior-slot compatibility model.

### 1D. Add public/internal slot visibility

Introduce something roughly like:

```ts
Slot.make({
  capability: ...,
  visibility: "public"
})
```

and:

```ts
visibility: "internal"
```

Internal parts might include:

```text
hiddenInput
measurementHost
sentinel
focusProxy
```

while public anatomy remains stable.

This gives you a very useful compatibility boundary for a long-lived component library.

---

# Phase 2 — Finish the capability algebra

This should probably be the largest design effort.

The goal is to identify a relatively small set of orthogonal interaction capabilities from which most widgets emerge.

The current research already proposes the core:

```text
Collection
Selection
Navigation
Typeahead
Overlay
Anchor
Dismiss
Presence
Focus
Press
```

plus Drag, Validation, Disclosure, form semantics, etc.

I’d work them in this order.

### 2A. `Collection`

Make this foundational.

Something conceptually like:

```ts
const collection = Collection.make(items, {
  id: item => item.id,
  text: item => item.label,
  disabled: item => item.disabled,
})
```

Then integrate cleanly with:

```ts
Selection
ListNavigation
GridNavigation
TreeNavigation
Typeahead
Virtualization
DragReorder
```

Collection should be usable by both stateful Bundles and Behaviors.

This one primitive eventually powers Listbox, Select, Combobox, Menu, Command, RadioGroup, ToggleGroup, Tabs, Tree, Grid, Carousel, Pagination, etc.

This is probably the **highest-leverage primitive in the project**.

### 2B. `Overlay`

Formalize the capabilities you already have:

```text
Anchor
DismissLayer
FocusScope
ScrollLock
HideOutside
Presence
HoverIntent
```

into one composable overlay policy.

Not necessarily:

```ts
Overlay.make(...)
```

if that API feels too builder-ish, but there should be one conceptual layer governing:

```text
modality
dismissal
focus containment
focus restoration
outside interaction
scroll locking
positioning
presence
top-layer/native behavior
```

Dialog, Popover, Tooltip, Menu, Select, Combobox, ContextMenu, NavigationMenu, CommandPalette, DatePicker, HoverCard should all use it.

The existing research explicitly warns against those widgets evolving nine subtly different overlay implementations.

### 2C. Selection/navigation family

Unify and document:

```text
Selection
RovingTabindex
ListNavigation
GridNavigation
TreeNavigation
Typeahead
FocusVisible
```

Make sure they share Collection metadata and common semantics.

Avoid slightly different concepts of:

```text
id
disabled
text
current
selected
```

across primitives.

### 2D. Interaction family

Complete:

```text
Press
LongPress
Move
HoverIntent
Drag
Drop
Resize?
ContextPress?
```

as reusable Behaviors.

### 2E. Form-control semantics

Build shared behaviors for:

```text
disabled
required
readonly
invalid
pending
dirty
touched
validation
aria-describedby
form value
```

This will dramatically simplify Input, Checkbox, RadioGroup, NumberField, Combobox, DatePicker, OTP, etc.

---

# Phase 3 — Build the visual capability system

Do this before making 30 component recipes.

You want a small vocabulary of reusable Styles/Recipes such as:

```text
Control
Interactive
Surface
FloatingSurface
FocusRing
CollectionItem
Field
Indicator
Divider
Text
Icon
Elevated
Scrollable
```

This idea appears both in the Affe style work and the Foldkit-plus plan: components should not independently reimplement border, radius, focus, disabled state, transitions, typography, etc.

For example:

```text
Button
 =
Control
+ Interactive
+ FocusRing
+ tone
+ variant
+ size
```

and:

```text
MenuItem
 =
CollectionItem
+ Interactive
+ FocusRing
+ density
```

### Make recipes anatomy-aware

A recipe should be typed against a widget anatomy:

```ts
Recipe.define(Menu.Anatomy, {
  base: {
    popup: FloatingSurface,
    item: CollectionItem,
    separator: Divider,
  },
  variants: { ... }
})
```

That prevents recipe drift and invalid slot names. Affe’s multipart recipe research strongly supports this model.

### Add composition

Make these operations excellent:

```ts
Recipe.compose(...)
Recipe.extend(...)
Recipe.with(...)
```

The goal is for things like:

```ts
IconButton = ButtonRecipe.extend(...)
```

rather than copied style definitions.

---

# Phase 4 — Theme and knobs

Only after the shared visual vocabulary exists should you formalize global knobs.

Keep these concepts distinct:

```text
Tokens   = semantic values
Knobs    = global design-system transformations
Variants = component-local decisions
State    = runtime conditions
```

The current proposal already gives the right examples:

```text
density: compact | normal | spacious
radius: none | subtle | round
motion: none | subtle | expressive
contrast: soft | normal | strong
controlSize: sm | md | lg
```


Then make:

```ts
Theme.compose(
  palette,
  Knobs.density("compact"),
  Knobs.radius("soft"),
  Knobs.motion("subtle"),
)
```

reconfigure the whole component suite automatically through semantic tokens.

Also add:

```text
Theme.scope
Theme.override
light/dark
system preference
high contrast
reduced motion
```

and responsive/container/style conditions:

```ts
Style.when(Media.md, ...)
Style.when(Container.atLeast("sm"), ...)
Style.when(Preference.reducedMotion, ...)
```

The research specifically calls responsive/container/preference-aware styles a missing primitive.

---

# Phase 5 — Platform floor + accessibility gate

This should become a major differentiator.

For every widget, declare what native HTML/browser functionality owns.

For example:

```ts
Dialog.platform = Platform.dialog({
  covers: [
    "focus-trap",
    "escape-dismiss",
    "inert",
    "top-layer",
    "backdrop"
  ]
})
```

rather than automatically recreating all of those in JS.

That is directly borrowed from Affe’s “platform floor” research and already fits Foldkit-plus’s existing `floor` metadata.

Then create one central registry:

```ts
UI.catalog
```

Every shipped widget registers:

```ts
{
  name,
  anatomy,
  pattern,
  recipe,
  tier,
  platformFloor,
  example
}
```

CI should iterate it and enforce:

```text
A widget without a passing accessibility pattern does not ship.
```

Affe already explored exactly this mechanized registry/gate design.

Later this same catalog can generate:

```text
docs
component explorer
DevTools
agent metadata
a11y reports
recipe playgrounds
examples
```

---

# Phase 6 — Prove the architecture with 5 representative widgets

Before chasing completeness, build five widgets chosen to stress different parts of the system.

I’d use:

### `Combobox`

Proves:

```text
Collection
Filter
Selection
ListNavigation
Typeahead
Overlay
Anchor
Dismiss
Field
```

The existing source already identifies Combobox as the canonical example of capability composition.

### `Menu`

Proves:

```text
Collection
Navigation
Typeahead
Overlay
nested overlays
checkbox/radio variants
groups
```

### `Tree`

Proves:

```text
hierarchical Collection
TreeNavigation
Selection
Disclosure
optional DragAndDrop
optional virtualization
```

The current plan specifically identifies Tree as a showcase for the architecture.

### `Field`

Proves integration between:

```text
form
validation
a11y
visual recipes
control anatomy
```

and should automatically derive things like invalid/description/error/touched state from the Form package.

### `Drawer`

Proves:

```text
Overlay
Presence
Move
focus
dismiss
responsive policy
```

If those five feel elegant internally and externally, the architecture is probably right.

If they require exceptions everywhere, improve the primitives before continuing.

---

# Phase 7 — Fill the component matrix

Only now start chasing surface completeness.

Create a matrix where rows are Base UI/Zag/shadcn concepts and columns are capabilities:

```text
                Coll Sel Nav Overlay Press Move Form Presence
Accordion        ✓              ...
Combobox         ✓   ✓   ✓    ✓
Drawer                         ✓     ✓    ✓
Tree             ✓   ✓   ✓
Toolbar          ✓       ✓
...
```

This was one of the strongest conclusions in the source: **track missing capabilities, not merely missing component names.**

Build components in dependency order.

### Wave A — cheap wins

```text
Accordion
AlertDialog
CheckboxGroup
Toggle
ToggleGroup
Toolbar
Progress
Meter
Separator
HoverCard
```

### Wave B — collection/overlay components

```text
Autocomplete
ContextMenu
Menubar
NavigationMenu
NumberField
OtpField
Command
ScrollArea
```

### Wave C — advanced

```text
ColorPicker
Editable
Rating
TagsInput
TreeView
Carousel
Splitter
Tour
FileUpload
SignaturePad
```

The current backlog already groups the work naturally into Base UI completeness, shadcn application vocabulary, and advanced/Zag-style territory.

---

# Phase 8 — Stateless visual vocabulary

In parallel with the later component waves, fill out the non-stateful UI grammar.

These should generally be SlotViews + Recipes, not Bundles:

```text
Alert
AspectRatio
Avatar
Badge
Breadcrumb
Card
Empty
Icon
Item
Kbd
Label
Separator
Skeleton
Spinner
Table
Typography
VisuallyHidden
```

That distinction matters: the research explicitly argues against making every visual unit a stateful component.

Also add compositional pieces like:

```text
Field
InputGroup
ButtonGroup
Item
Empty
```

because these eliminate huge amounts of application-level repetition.

---

# Phase 9 — Higher-level patterns

Once components are mature, add reusable assemblies:

```text
CommandPalette
DataTable
Sidebar
SettingsForm
SearchField
DateRangePicker
FileBrowser
TreeEditor
PropertyPanel
```

These should demonstrate how multiple lower-level capabilities cooperate rather than becoming new monoliths.

The DataGrid has its own design: [data-grid-DESIGN.md](./data-grid-DESIGN.md).

For example:

```text
DataTable
 =
Collection
+ Sorting
+ Selection
+ Pagination
+ VirtualList
+ ColumnSizing
```


---

# Phase 10 — Blocks and distribution

Only at the end do the shadcn-style application blocks:

```text
auth
sidebar
settings
dashboard
data-table
command-palette
profile
empty-state
```

But unlike shadcn, these should teach Foldkit architecture:

```text
SettingsPage
 =
Form
+ Surface
+ Field
+ Tabs
+ Remote
```

rather than just giving users a lump of view code.

---

## I’d structure the actual repo work into epics

1. **UI architecture contract**
2. **Foldkit UI render seams**
3. **Anatomy + capabilities**
4. **Collection**
5. **Overlay**
6. **Interaction/navigation normalization**
7. **Visual capability styles**
8. **Recipe composition**
9. **Themes + knobs**
10. **Platform floor**
11. **A11y registry/gate**
12. **Representative widgets**
13. **Component coverage matrix**
14. **Stateless visual primitives**
15. **Advanced widgets**
16. **Patterns**
17. **Blocks + docs**

The critical ordering is:

```text
DO NOT:

components → components → components → abstraction cleanup

DO:

architecture
   ↓
capabilities
   ↓
shared styles
   ↓
representative widgets
   ↓
stress-test
   ↓
component expansion
```

That avoids ending up with 50 widgets that all contain slightly different solutions to the same problems.

The end-state you’re aiming for is essentially the one stated in the source: **shadcn-level completeness, Zag/Base UI-level interaction rigor, and Foldkit-native composability from low-level primitives all the way to application blocks.**
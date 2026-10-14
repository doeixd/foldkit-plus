# UI parity: shadcn/ui, Zag.js and Fluid Functionalism

What Foldkit Plus's UI packages (`foldkit-mixins-ui`, `foldkit-primitives`,
`foldkit-mixins`) need so that an application can build everything those three
libraries ship, with the customization `ui.shadcn.com/create` and
fluidfunctionalism.com offer, and so the site's gallery shows it. This is the
plan; [`ui-DESIGN.md`](./ui-DESIGN.md) is the architecture behind it.

## The bar

- **shadcn/ui** sets the catalog (about 75 components) and the knobs of
  `/create`: a style preset, a base color, a theme, an icon library, a font, a
  radius, a menu color and accent, RTL.
- **Zag.js** sets the behavioral catalog: the state machines behind widgets
  such as tags input, rating, splitter, tour and tree view.
- **Fluid Functionalism** sets the feel: one highlight that follows the pointer
  across a list or grid (*fluid hover*), springs in three tiers, a two-step size
  ladder (36px and 28px), an eight-step surface ladder, and components as
  featureful as its Card (stacked, inline and grid layouts, selection, dismissal,
  media, a press over the whole card).

A component counts as done when it is in `foldkit-mixins-ui` with slots, a
recipe whose axes are the options, an `A11y.pattern` where it is interactive,
tests that can fail, and a page in the gallery (`examples/site`).

## Where it stands (2026-10-14)

Of the shadcn names, 37 exist, 19 exist only in part, and 8 are missing.
Most of the partial ones are islands in `examples/widgets`: built from the
Behaviors, but not in a package and not in the gallery. The gallery shows 21
components; Dialog, Menu, Combobox, Listbox, Tabs, Popover, Tooltip, Toast,
DatePicker, RadioGroup, Slider and FileDrop have recipes and appear only in
`examples/design-system`.

Done in this pass:

- `FluidHover` (`foldkit-primitives/dom`): the highlight that follows the
  pointer, gaps included, on `x`, `y` or `xy`.
- `motion.spring`: an underdamped spring as a CSS `linear()` easing.
- `Card` at Fluid's level: a press over the whole card, `selected`,
  `disabled`, `dismiss`, an image and a media tile, `orientation` and `surface`
  axes; `Card.group` with fluid hover, columns, divided or separated.
- Every stateless view takes the application's builder, so a badge or a button
  inside it can send a Message.

## The order of work

Each step is a set of commits that leaves the gallery showing what it added.
Each component in it starts with a brief of its options, researched from the
sources (see "How each component is built").

1. **Show what exists.** Gallery pages for the twelve components that have
   recipes and no page. No new API; it finds the rough edges the way the card's
   page found the lost selected fill.
2. **Fluid hover everywhere it belongs.** A `highlight` slot and `FluidHover` in
   Menu, Listbox, Combobox, Tabs (the sliding indicator) and Segmented, so
   moving across their items moves one highlight.
3. **`/create` at shadcn's level.** Beside today's palette, radius, density,
   motion, shadow and font knobs:
   - a neutral hue and chroma apart from the accent's (shadcn's base colors);
   - menu accent `subtle` or `bold`, as a token the popup recipes read;
   - a control size, `default` or `compact`, as a `knob` the recipes' heights
     derive from (Fluid's ladder);
   - motion `spring`, `ease` or `none` (the knob at 0);
   - style presets that set several knobs and recipe defaults together, a
     structural look rather than a palette.

   Each is a token or a knob, never a second set of sizes.
4. **Move the islands into the package.** Accordion, Toggle and Toggle Group,
   Input OTP, Number Input, Alert Dialog, Context Menu, Hover Card, Menubar,
   Navigation Menu, Command, Sidebar, Resizable and Checkbox Group are in
   `examples/widgets`, built from Behaviors that exist. Each becomes slots, a
   recipe, a pattern, tests and a page.
5. **Wrap what upstream has.** `@foldkit/ui`'s progress and meter (Progress,
   Circular Progress), nav, and virtual list have no adapter yet.
6. **Build the missing everyday pieces.** Drawer and Sheet, Nested Menu, Tags
   Input, Rating, Password Input, Steps, Carousel, Banner, Input Copy, a date
   range, a range slider, a Tree View recipe and a Color Picker.
7. **Chat.** Message, Message Scroller, Thinking Indicator, Thinking Steps and a
   Questionnaire, over Item, Prose, `richtext-markdown`, ScrollArea and
   `KeepInView`.
8. **Zag's long tail.** Angle Slider, Cascade Select, Image Cropper, Signature
   Pad, QR Code, Tour, Floating Panel, Marquee, a Timer view and Chart. Most
   reduce to `PointerDrag`, `Measure`, `Placing` and `Layers`, which exist.

Icon libraries wait for a decision about bundling icon sets: `Icon` takes any
Html and `Icons.glyph` any `url()`, so an application can use any set today.

## How each component is built

Every component in the steps above follows the same four moves, in order. The
brief comes first, before any code: the card reached Fluid's level because its
options were read off Fluid's card and shadcn's before the view was written,
not added after a screenshot showed what was missing.

### 1. Research the options

Read what each source offers for the component and write it down as a brief.

- **shadcn/ui.** The component's docs page, and the props of the Radix or Base
  UI part it wraps, since most of shadcn's options come from there. Then
  `/create`: which of its knobs (style, base color, radius, menu color and
  accent, RTL) change this component, and how.
- **Zag.js.** The machine's props (its context), the `api` its `connect`
  returns (what a view can read and do), its anatomy (the named parts), and
  the events it handles. Zag is the most complete list of states and edge
  cases: controlled and uncontrolled values, `loop`, `disabled` items,
  `orientation`, `dir`, typeahead, what happens on blur.
- **Fluid Functionalism.** The component's page: its layouts, states, motion
  (which spring tier), sizes on the 36px and 28px ladder, and the touches that
  make it feel finished (the hover that follows, a press over the whole card).
- **WAI-ARIA APG.** The pattern's roles and keyboard table, which the
  `A11y.pattern` and the browser tests then hold the component to.

The brief is one table, the union of every source's options:

| Option | Seen in | Home | Decision |
|---|---|---|---|
| a selected card | Fluid, shadcn | view `selected`, styled per `surface` | adopt |
| …one row per option… | | | adopt, adapt (how) or skip (why) |

It goes under "Briefs" below in the same commit as the component's first
code, so a reviewer can check the component against it. "Skip" needs a
reason; "it was more work" is not one.

### 2. Give every option one home

Each option lives in exactly one layer; deciding which is most of the design.

- **A fact the browser knows and a Message does not need** (pointer geometry,
  a size, the nearest item) is a primitive Mount in `foldkit-primitives/dom`
  that writes custom properties, as `FluidHover` and `Measure` do.
- **A transition the user causes** (open, select, move the active item) is
  state the application's Model owns, through a Behavior in
  `foldkit-primitives/interaction` or `state` (`ListNavigation`, `Selection`,
  `Disclosure`), sending Messages.
- **A part of the anatomy** is a Slot. Anything the package draws is in one,
  so a stylist can reach it.
- **A look a stylist picks** (surface, size, tone, orientation, layout) is a
  recipe axis with a default.
- **Content and behavior flags** (title, media, `press`, `dismiss`, `disabled`)
  are view options.
- **A feel shared across components** (neutral hue, menu accent, control size,
  motion) is a token or a knob in `Theme`, which recipes read.
- **A state** the DOM already shows is styled from its attribute
  (`Style.states`), and beside every variant that sets the same property.

An option in two layers is two ways to do one thing; an option the source has
and no layer can hold is the sign a primitive is missing.

### 3. Make a primitive when the layers run out

Before writing one, search the lists in "What makes the rest cheap" and
`foldkit-primitives`' README: most needs are met. Write a new one when the
behavior is a browser fact or interaction no existing primitive covers and
more than one component needs it (`FluidHover` serves Card.group now and Menu,
Listbox, Tabs and Segmented next). A new primitive:

- names its output (custom properties, Messages) as a contract, not as a
  detail of the first component that used it;
- takes its options as args checked by a Schema, with defaults for the common
  case;
- makes every observer before any observes, and works without the ones jsdom
  lacks;
- has browser tests for what needs layout or the pointer, a mutation spec, a
  row in its package README and in `skills/foldkit-plus/references/primitives.md`.

It ships in its own commit, before the component that uses it.

### 4. Hold it to the featureful bar

A component is featureful when, against its brief:

- every part the sources name is a Slot, and every option a home;
- every state (hover, focus-visible, pressed, selected, disabled, invalid,
  loading, open) is styled on every variant, checked by computed style in a
  browser test;
- it works by keyboard as the APG says, by touch (`hover: none` shows what
  hover reveals), right to left, and still with `motion` at 0;
- its sizes come from the size ladder and its colors from tokens, so every
  `/create` knob reaches it;
- an interactive one refuses to be drawn without an accessible name;
- every option has a test that fails when the option is broken, proven by a
  mutation;
- its gallery page shows each axis and each state, with the code beside it.

## Briefs

### Card

Written after the card was built, from what it took from each source; the
briefs that follow come before their code.

| Option | Seen in | Home | Decision |
|---|---|---|---|
| header, title, description, content, footer | shadcn | Slots | adopt |
| an action in the header | shadcn | Slot `action`, view `action` | adopt |
| a press over the whole card, button or link | Fluid | view `press`, Slot `overlay` | adopt |
| selected | Fluid | view `selected`; fill set per `surface` | adopt |
| disabled | Fluid | view `disabled` | adopt |
| dismiss, shown on hover | Fluid | view `dismiss`, Slot `dismiss` | adopt; always shown under `hover: none` |
| image and media tile | Fluid | Slots `image`, `media` | adopt |
| stacked or inline | Fluid | recipe axis `orientation` | adopt |
| outlined, elevated, filled, plain | Fluid, shadcn | recipe axis `surface` | adopt |
| padding | ours | recipe axis `padding` | added, so a flush media card needs no override |
| a group with one highlight that follows | Fluid | `Card.group`, primitive `FluidHover` | adopt |
| group columns, divided or separated, border | Fluid | `columns` option; `CardGroup` axes | adopt |

## What makes the rest cheap

- Stateless components are 30 to 60 lines over `Slots.define` and
  `SlotView.buildersFor`; Marker, Bubble, Steps, Banner and Thinking Indicator
  have that shape.
- Recipes share `recipes/design.ts` (`component`, `variant`, `focusRing`,
  `tones`, `transition`) and `recipes/popup.ts` (panel, item, separator).
- The Behaviors cover the hard parts: `Collection`, `RovingTabindex`,
  `ListNavigation`, `GridNavigation`, `TreeNavigation`, `Typeahead`,
  `Selection`, `Press`, `LongPress`, `PointerDrag`, `Move`, `Placing`,
  `Overlay`, `DismissLayer`, `FocusScope`, `Presence`, `SpinValue`,
  `ToggleState`, `Disclosure` and `FieldAssociation`.
- The `examples/widgets` islands are Bundle placements over those Behaviors,
  so moving one into the package is mostly slots, a recipe and tests.

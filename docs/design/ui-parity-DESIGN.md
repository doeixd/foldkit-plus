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

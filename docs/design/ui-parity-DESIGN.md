# UI parity: shadcn/ui, Zag.js and Fluid Functionalism

> **Status (2026-10-26):** partly built. Steps 2, 7 and 8 are done, and step
> 3b is built as [`ui-systems-DESIGN.md`](./ui-systems-DESIGN.md) records.
> Most of steps 4 to 6 ship in `foldkit-mixins-ui` (Accordion, Menubar,
> Sidebar, Resizable, Command, Sheet, Drawer, Tags Input, Rating, Steps,
> Carousel, Tree View, Color Picker, and the Progress, Meter, Nav and
> VirtualList adapters), though the step list below marks none of them done.
> Open: step 3's `/create` presets, and from step 6 a nested menu, a date
> range and a range slider, for which no export was found. Icon libraries
> wait on a bundling decision.

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
Behaviors, but not in a package and not in the gallery. The gallery shows 33
components (step 1 below). Of the twelve components with recipes that
appeared only in `examples/design-system`, FileDrop alone has no page;
AspectRatio, CodeBlock, Icon, InputGroup, Label, ScrollArea, Segmented and
Typography have recipes and no page either.

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

1. **Show what exists.** *Done but for FileDrop.* Gallery pages for Tabs,
   Radio group, Slider, Dialog, Popover, Tooltip, Menu, Listbox, Combobox,
   Calendar, Date picker and Toast, their state in one gallery module
   (`examples/site/src/gallery/widgets.ts`). The pages found, and the package
   now fixes:
   - no Calendar recipe, so three examples styled the grid by hand;
   - the open Dialog's panel at the top of the viewport;
   - a Slider shrinking to its label's width;
   - no visible row while the keys move through a menu, listbox or combobox;
   - forty to sixty lines of drawing that every menu, listbox, combobox and
     calendar repeated (their `toView` now draws without a `draw`);
   - `DatePicker.toView` asking for a builder no application holds;
   - `Item` requiring `content` beside a title and description.

   Still open:
   - **FileDrop.** foldkit types `File.File` as `Schema<File>`, whose decoding
     services are `unknown`, so a Message carrying a file cannot be a Bundle
     parent's Message, and the site's Model is one. Either foldkit declares
     the schema with `never` services, or `Bundle.parent` accepts any services
     (it only holds the Schemas, but its internals pass them on as `never`).
   - **Separators in a styled menu.** Upstream draws the rule between groups
     only when given a class or attributes for it, and the attributes are
     `ChildAttribute`s that the application's builder cannot draw, so a menu
     drawn through `Menu.toView` has none. Step 2 rebuilds the popups' items
     anyway; it should draw the separator whenever groups have one.
2. **Fluid hover everywhere it belongs.** *Done.* Tabs, Menu, Listbox,
   Combobox and Segmented take an opt-in `fluid` (beside the style): one
   highlight that follows the pointer and the keys, and a chosen marker that
   glides (Tabs, Listbox, Combobox, Segmented). `FluidHover` gained `follows`
   and `from` and marks its container `data-fluid-hover` while it runs, which
   the recipes read so that nothing glides, and each item marks itself, until
   it does. `fluid` is opt-in because a Scene test resolves every Mount with a
   Message, and these send none. The popups' Mounts run on a `rows` box of
   this package's: the panel carries upstream's anchor, and an element holds
   one Mount. The brief's skips (labels that only the chosen tab shows, weight
   without reflow, menu checkbox rows and submenus, a pause after a pick)
   stay recorded in it.
3. **`/create` at shadcn's level.** *Done, as the brief below records:* a
   `neutral-h` knob for base colors, the palette's `popup` tokens for the menu
   accent and color, and `/create` choices for style, base color, menu
   accent and color, size, motion, heading font and direction. Two adapt
   rather than adopt: compact is a density step until a size knob steps the
   type too, and a style moves knobs only, until recipes take presets.
   Right to left found the gliding overlays anchored at the wrong edge. The
   original list, beside today's palette, radius, density, motion, shadow and
   font knobs:
   - a neutral hue and chroma apart from the accent's (shadcn's base colors);
   - menu accent `subtle` or `bold`, as a token the popup recipes read;
   - a control size, `default` or `compact`, as a `knob` the recipes' heights
     derive from (Fluid's ladder);
   - motion `spring`, `ease` or `none` (the knob at 0);
   - style presets that set several knobs and recipe defaults together, a
     structural look rather than a palette.

   Each is a token or a knob, never a second set of sizes.

   **3b. The shared systems.** Motion tiers, the size ladder, type roles,
   the surface ladder, scrollbars and fluid hover's remaining rules, from
   Fluid's craft reference: [`ui-systems-DESIGN.md`](./ui-systems-DESIGN.md).
   Its first four steps come before step 4, so the islands are built on the
   ladder; its `step` knob replaces the density stand-in for compact. *Steps
   1 to 4, 6a and 7 are done;* that document's "Where it stands" says how
   the build differs from its sections.
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
7. **Chat.** *Done:* ChatMessage (and its group), Message Scroller, Thinking
   Indicator, Thinking Steps and a Questionnaire, each with a brief below.
   `KeepInView` did not fit the scroller, which follows growth and holds its
   place with a Mount of its own (`FollowEnd`); Markdown is the
   application's, through `richtext-markdown` and Prose.
8. **Zag's long tail.** *Done:* Angle Slider, Cascade Select, Image Cropper,
   Signature Pad, QR Code, Tour, Floating Panel, Marquee, a Timer view and
   Chart, each with a brief below. `Measure` fitted none of them (it sends no
   Message, so `update` cannot read what it measured); they use `Move`,
   `Resize`, `Bounds`, upstream's anchor and the top layer, and one new
   primitive, `PointerPosition`, for the color area, the dial and the pad.

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

### Fluid hover in lists and tabs (step 2)

Read from Fluid Functionalism's craft notes (`skills/fluid-functionalism/references/craft.md`
in its repository: Fluid Hover, Tabs, TabsSubtle, Dropdown, Select, Combobox),
Zag's tabs and menu machines, and shadcn's Tabs.

What the five share, and so what `FluidHover` itself must gain:

| Option | Seen in | Home | Decision |
|---|---|---|---|
| one highlight per list, nearest item, gaps included | Fluid | `FluidHover` (exists) | adopt |
| no per-row `:hover` background beside a gliding highlight | Fluid | each recipe, when the highlight is drawn | adopt |
| the keys move the highlight, and no ring is drawn in a menu | Fluid Dropdown | `FluidHover` `follows`: the item the highlight sits on while the pointer is out (`[data-active]` upstream) | adopt |
| a chosen marker apart from the hover, gliding to a new choice | Fluid Tabs, Select, Combobox; Zag's tab indicator | `FluidHover` `chosen`: a second set of custom properties for the chosen item | adopt |
| the hover is born at the chosen item and returns to it on leave | Fluid Tabs, Dropdown (`from`) | `FluidHover`, when `chosen` is given | adopt |
| the chosen marker dims while another item is hovered | Fluid Tabs (0.85) | recipe, reading `--fk-<name>-shown` | adopt |
| three spring tiers, the bigger the slower | Fluid Motion | `motion.spring` exists; the tiers are step 3's motion knob | adapt: one spring now |
| reduced motion keeps the fade and drops the travel | Fluid | recipes, under `--fk-knob-motion` 0 | adopt |
| a highlight lit only on click targets; disabled rows skipped | Fluid | `FluidHover` (exists) | adopt |
| gap click presses the lit item | Fluid | `FluidHover` `gapClick` (exists) | adopt for menus, listbox and tabs; not for a combobox, whose field keeps focus |

Per component:

| Option | Seen in | Home | Decision |
|---|---|---|---|
| Tabs: a sliding indicator under the chosen tab | Fluid, Zag, shadcn `line` | `TabsSlots` `indicator`, recipe | adopt |
| Tabs: a hover pill, `pill` variant | Fluid | `TabsSlots` `highlight`, recipe | adopt |
| Tabs: `orientation` vertical | Zag, shadcn | upstream view input; recipe axis | adopt; the highlight reads `y` |
| Tabs: manual activation, loop, deselectable | Zag | upstream `@foldkit/ui/tabs` | as upstream offers |
| Tabs: only the chosen tab shows its label (`activeLabel`) | Fluid TabsSubtle | view | skip for now: needs measured widths; recorded for step 6 |
| Tabs: label weight without reflow | Fluid | recipe (ghost text) | skip for now: needs the label in a slot |
| Menu: checkbox and radio rows, submenus, a search field | Fluid, Zag | upstream menu has none | skip: step 6's Nested Menu |
| Listbox: the chosen row's marker glides | Fluid Select | `chosen` | adopt |
| Listbox: a 300ms pause after a pick before closing | Fluid Select | upstream's close | skip: upstream closes at once; recorded |
| Combobox: first row lit on open, keys loop through the field | Fluid, APG | upstream combobox | as upstream does |
| Segmented: one pressed option, a sliding pill | Fluid Tabs (segmented) | `SegmentedSlots` `indicator`, `chosen` on `[aria-pressed="true"]` | adopt |

### `/create` at shadcn's level (step 3)

Read from shadcn's create configuration (`apps/v4/registry/config.ts`,
`styles.tsx`, `themes.ts`, `base-colors.ts` in its repository) and Fluid
Functionalism's Sizes, Surfaces and Motion craft notes.

| Option | Seen in | Home | Decision |
|---|---|---|---|
| base color: neutral, stone, zinc, mauve, olive, mist, taupe | shadcn | a knob `neutral-h` beside `surface-c` (the chroma), defaulting to the accent's hue; `Theme.oklch({ neutral: { h } })` | adopt; `/create` names the seven, their hues read from shadcn's values |
| theme: an accent from eighteen | shadcn | `accent-h`, `-c`, `-l` (exist) | exists; `/create`'s accent sliders cover it |
| menu accent: subtle or bold | shadcn | popup tokens the popup recipes read: `popup.highlight`, `popup.highlight-ink` | adopt |
| menu color: default, inverted, translucent, inverted translucent | shadcn | popup tokens `popup.surface`, `popup.ink`, `popup.blur` | adopt |
| radius: none, small, medium, large | shadcn | `radius-factor` (exists) | exists; `/create` keeps its slider |
| control size: default or compact | Fluid (36px, 28px) | `density` (exists), stepped by `/create` | adapt: compact is density 0.8; a type step with it waits for a size knob |
| motion: spring, ease, none | Fluid | `motion.ease` set to `motion.spring`, or the `motion` knob at 0 | adopt in `/create` |
| style: vega, nova, maia, lyra, mira, luma, sera | shadcn | `/create` presets over the knobs (radius, density, font, shadow, surface contrast) | adapt: knobs only; a style that changes a recipe's structure (lyra's boxy borders) waits for recipe presets |
| heading font apart from the body's | shadcn | `font.heading` (exists) | adopt in `/create` |
| right to left | shadcn | `dir` on the preview; the recipes use logical properties | adopt in `/create` |
| a pointer cursor on buttons | shadcn | the recipes (exists) | exists |
| icon library | shadcn | (deferred, as above) | skip |

### Chat messages (step 7)

Sources: AI SDK Elements (shadcn's AI elements: Message, MessageResponse, MessageActions,
MessageBranch, Conversation), Vercel AI SDK UI (`useChat`: status submitted/streaming/ready/error,
`regenerate`, `stop`), assistant-ui (Thread, Viewport auto-scroll, ActionBar copy/reload/edit,
autohide, BranchPicker), ReUI (only a pro "AI Chat" block; no components), Fluid Functionalism
(ChatMessage: `from` user/assistant, user right in an accent bubble, assistant plain text, `time`,
`actions`, a meta row whose height is reserved, sender-based entrance), WAI-ARIA (`role="log"`:
a polite live region for chat; `aria-busy` holds announcements while content changes).

#### ChatMessage

| Option | Seen in | Home | Decision |
|---|---|---|---|
| sender: user, assistant, system | AI Elements `from`, Fluid `from`, useChat `role` | view `from`, root `data-from` | adopt |
| user at the end in a bubble, assistant plain at the start | Fluid, AI Elements | recipe axis `layout: 'chat'` (default) reading `data-from` | adopt |
| everyone at the start beside a picture, no bubble | channels (Slack-like), assistant-ui | recipe `layout: 'thread'` | adopt |
| bubble fill | Fluid (accent), AI Elements (secondary) | recipe axis `bubble: muted \| accent` | adopt; muted default for long text contrast |
| author and avatar | AI Elements, assistant-ui | view `author`, `avatar` (any Html, an `Avatar.view`), Slots `author`, `avatar` | adopt |
| time | Fluid `time` | view `time: { at, label }`, a `<time datetime>` in Slot `time` | adopt |
| status sending / sent / failed, with retry | useChat status, messaging apps | view `status`, `statusLabel`, `onRetry`, `retryLabel`; Slots `status`, `retry`; failed in `error.ink` | adopt; retry drawn only when failed |
| actions: copy, edit, regenerate, thumbs | AI Elements MessageAction, assistant-ui ActionBar | view `actions` (key, label, icon, onClick, pressed, disabled) in Slots `actions`/`action`; each named, `aria-pressed` for toggles, `aria-disabled` keeps focus | adopt; copying is the app's `Clipboard.copyText` Command |
| actions revealed on hover, shown on the latest | assistant-ui autohide, Fluid | recipe opacity on hover/focus-within, `pinActions`, always under `hover: none` | adopt |
| reserved meta row (no shift on reveal) | Fluid | hidden by opacity, not display | adopt; browser test proves the footer keeps its height |
| grouping of consecutive messages | assistant-ui groups parts, channels | `ChatMessage.group` with `continues(previous, next)` (default same `from` and `author`); continued: no picture (room kept), header hidden from sight only, tighter gap | adopt |
| streamed text that does not re-wrap | TODO "Chat's streamed text unwrapped" | body `text-wrap: wrap` over the reset's `pretty`, on `p, li, blockquote, h1–h6` | adopt; browser test streams 30 words and checks every earlier line stays |
| streaming state for assistive tech | APG live regions | view `streaming`: `aria-busy="true"`, `data-streaming` | adopt |
| Markdown body (GFM, code, tables) | AI Elements MessageResponse | `content` takes Html; `richtext-markdown` `parse` + `richtext-dom/view` `renderDocument`; recipe `content: 'markdown'` composes `Prose.style()` tightened | adopt; the package does not depend on richtext |
| a plain body keeps its line breaks | messaging apps | recipe `content: 'text'` (default): `white-space: pre-wrap` | adopt |
| entrance motion | Fluid | `Style.enter` fade + 0.25rem rise; rise `travelled` | adopt |
| incomplete-Markdown repair while streaming | AI Elements `parseIncompleteMarkdown` | the app's parse | skip: `parse` is the app's call; a partial fence parses as text until closed |
| branches (n / m) | AI Elements MessageBranch, assistant-ui BranchPicker | — | skip for now: the app can draw a stepper in `actions`; a branch picker is its own component |
| attachments | Fluid `files`, AI Elements | `content` Html | skip: an attachment row is app content until a FileTile component exists |
| inline edit of a user message | assistant-ui | the app swaps `content` for its composer | skip as a component option |

#### MessageScroller

| Option | Seen in | Home | Decision |
|---|---|---|---|
| follow the newest while at the bottom | AI Elements Conversation (use-stick-to-bottom), assistant-ui autoScroll | `FollowEnd` Mount on the log: while the end is in view, any growth scrolls to the end | adopt |
| stop following when the user scrolls up | same | a scroll that moves up and leaves the end sends `LeftEnd`; within 16px of the end sends `ReachedEnd` | adopt |
| a streamed answer stays in view | same | a `ResizeObserver` on the log, so text growth and pictures loading count | adopt |
| "jump to latest" button | AI Elements ConversationScrollButton, assistant-ui | Slot `jump`, drawn only while not following; `Jumped` -> `ScrollToEnd` Command (smooth unless `travel`/`motion` is 0 or reduced motion) | adopt |
| new-message count on it | messaging apps | Model `unseen`, app sends `Appended({ count })`; Slot `count`; name "Jump to latest, 3 new messages" | adopt |
| keep position when older messages load above | assistant-ui ("keeps the messages in view in place when a page lands above them") | `FollowEnd` holds the innermost element at the top of the view by its laid-out offset (no transform, no scroll), turning the browser's `overflow-anchor` off (Safari lacks it, Chrome would correct twice) | adopt |
| focus after the jump | ours | a focused jump button hands focus to the scrolling area (the button goes) | adopt |
| `role="log"` named | APG | Slot `log`, `label` required | adopt |
| scroll bars | ours | the area is `ScrollArea.view`; `areaStyle`, `areaMixins: ScrollArea.overlayBars` | adopt; overlay bars opt-in as everywhere |
| short conversation sits at the bottom | messaging apps | recipe: log `min-block-size: 100%`, `justify-content: flex-end` | adopt |
| empty state | AI Elements ConversationEmptyState | `Empty` in `content` | skip: Empty exists |
| download as Markdown | AI Elements ConversationDownload | — | skip: the app's `print` of its documents |
| load older on reaching the top | infinite chat | — | skip: the app's button or its own observer; the scroller's job is holding position, which it does |

### Thinking and questions (step 7)

Sources: ai-elements Reasoning, Chain of Thought, Tool, Confirmation, Shimmer
(elements.ai-sdk.dev); assistant-ui Reasoning (its group-reasoning part and
ReasoningPanel); Vercel AI SDK UI (tool part states, `addToolResult` for
human-in-the-loop); ChatGPT, Claude, Claude Code and Perplexity as observed
(Claude Code's AskUserQuestion: a few questions, options with descriptions,
multi-select, an "Other" free answer); the APG radio group, checkbox and
disclosure patterns.

#### Thinking Indicator

| Option | Seen in | Home | Decision |
|---|---|---|---|
| Shimmering label ("Thinking…") | ai-elements Shimmer, assistant-ui trigger, ChatGPT, Claude | recipe axis `label: shimmer` (gradient clipped to text) | adopt; travel-aware, the other way right to left, held under reduced motion with the band past the words |
| Typing dots | ChatGPT, iMessage-style chats | Slots `mark`, `dot`; recipe axis `mark: dots` | adopt |
| A breathing dot | ChatGPT voice/thinking dot | `mark: pulse` | adopt |
| Own icon (Claude's spark) | Claude | view `icon`, Slot `icon` | adopt |
| A second line: what it is doing ("Searching the web") | Perplexity, ChatGPT | view `detail`, Slot `detail` | adopt |
| Words hidden, mark alone | ChatGPT | `label: hidden` (srOnly, still announced) | adopt |
| Polite status | APG (status role) | root `role="status"`, drawn always; `active: false` draws it empty | adopt: the region is in the page before it speaks |
| Accent or muted ink | ai-elements, Claude | `tone: muted | accent` | adopt |
| Shimmer `duration`, `spread` props | ai-elements Shimmer | the motion tokens and `travel` | adapt: one duration from `motion.slow`, so `/create`'s motion knob reaches it |
| Elapsed seconds while thinking | assistant-ui (`Reasoning (12s)`) | the application's `detail` or `label` | adapt: the application owns the clock; no timer inside a stateless view |

#### Thinking Steps

| Option | Seen in | Home | Decision |
|---|---|---|---|
| Collapsible trace under a trigger | ai-elements Reasoning, Chain of Thought, assistant-ui | Slots `trigger`, `panel`; `0fr`-`1fr` row (`opensBelow`) | adopt |
| Open while streaming, shut when done, reader's choice kept | ai-elements (auto-open/close), assistant-ui | view `open: Option<boolean>` (none follows the work), `shown`; `onToggle(open)` sends the asked state | adopt |
| "Thought for 4s" | ai-elements `duration`, ChatGPT, Claude | view `duration` (ms) or the steps' durations summed; `elapsed` | adopt; "Stopped after 2s" when one failed |
| Running summary = current step | Perplexity, ChatGPT | the latest running step's title, shimmering | adopt |
| Step states pending / running / done / failed | ai-elements Chain of Thought (`complete`/`active`/`pending`), Tool states | `ThinkingStep.state`; `data-state`; marker drawn per state | adopt; `failed` added from Tool's `output-error` |
| State said in words | APG (no meaning by color/shape alone) | Slot `state` (srOnly), view `stateWords` | adopt |
| Per-step duration | Claude, ai-elements Tool | `ThinkingStep.duration`, Slot `duration` | adopt |
| Step icon | ai-elements Chain of Thought `icon` | `ThinkingStep.icon` in the marker, tinted by state | adopt |
| Nested detail and sub-steps | ai-elements Tool input/output, assistant-ui ReasoningPanel | `ThinkingStep.detail`, `steps`; Slots `body`, `detail` | adopt |
| Each tool call collapsible | ai-elements Tool | view `openSteps`, `onToggleStep` (with `Accordion.toggled`) | adopt |
| Timeline line between markers | ai-elements Chain of Thought | recipe axis `connector: line | none` | adopt |
| Card box | ai-elements Tool | `variant: plain | card` | adopt |
| Spinner in a running marker | Spinner | recipe draws the Spinner ring's look in the marker | adapt: Spinner.view's own `status` would be a second live region per step |
| Search-result badges, images with captions | ai-elements Chain of Thought | a step's `detail` (Html): Badge, AspectRatio | adapt: composition, not new slots |
| Approval (approve/reject) | ai-elements Confirmation, Tool `approval-requested` | the Questionnaire (a single choice) or Buttons in `detail` | skip as a state here: a decision is a question to the reader, which the Questionnaire owns |
| Bottom-pinned live preview while streaming | assistant-ui | Message Scroller's (the other agent) | skip here: scrolling belongs to the scroller |

#### Questionnaire

| Option | Seen in | Home | Decision |
|---|---|---|---|
| Single choice | Claude Code AskUserQuestion, ChatGPT clarifications | `Questionnaire.single`; the package's RadioGroup (upstream Submodel, APG keys) | adopt |
| Multiple choice | Claude Code (`multiSelect`) | `multiple`; CheckboxGroup | adopt |
| Free text, one line or many | ChatGPT, forms | `text({ multiline })`; Input or Textarea | adopt |
| "Other" free answer beside the options | Claude Code | `other` label; replaces the choice in a single, adds to a multiple | adopt |
| Option descriptions | Claude Code | `Choice.description` | adopt |
| All at once or one at a time | Claude Code (tabs), typeforms | `init({ layout: 'all' | 'paged' })`; progress, Back, Next | adopt; Next refuses a missing answer |
| Required by default, optional per question | forms | `optional` | adopt |
| Submit sends the answers as a Message | AI SDK `addToolResult`, assistant-ui tool UI | `OutMessage.Answered({ answers })` from `update` | adopt |
| What is missing, said and focused | APG / WCAG 3.3.1 | `missing`, Slot `error`, `aria-invalid` + `aria-describedby`, focus Command | adopt |
| Answered state collapses to a summary | Claude Code, ChatGPT | `submitted`, Slots `summary`, `asked`, `answer`; focus moves there | adopt |
| Enter submits | forms | `form` `OnSubmit` | adopt (native) |
| Decoding the assistant's tool input | AI SDK tool schemas | `Question` is a Schema (`defineTaggedUnion`), `OptionFromNullOr` fields | adopt |
| Skip / dismiss | Claude Code (Esc) | the chat's composer stays usable; an application adds its own Button | skip: no state of the questionnaire's would record it |
| min/max selections on a multiple choice | forms | none | skip for now: no source in the chat UIs has it; record it |

### Angle Slider (step 8)

Read from Zag's angle-slider machine and anatomy, Ark UI's Angle Slider (Zag's), Mantine's
AngleSlider and the APG slider pattern. shadcn has none.

| Option | Seen in | Home | Decision |
|---|---|---|---|
| value in degrees, 0 at the top, clockwise | Zag, Mantine | Model `value`; root `--fk-angle` | adopt |
| controlled and uncontrolled value | Zag, Mantine | the application owns the Model | adapt: always the application's, as every Model here |
| `step` | Zag, Mantine | `AngleSliderLayout.step`, shared by `update` and the view | adopt; a step that does not divide 360 ends at its last multiple (357 by sevens) |
| a larger step | Zag (Shift+arrows), APG (Page Up/Down) | `largeStep`, default the multiple of `step` nearest 15 | adopt, on both |
| Right/Up increase, Left/Down decrease, Home, End | APG, Zag, Mantine | `update`, from the key and the value it holds | adopt; keys faster than a frame each step from the value before them |
| going round past 0 and 359 | a dial | `update` | adopt: a dial has no ends; Home is 0, End the last step |
| right to left | Zag `dir` | none: the dial is a drawing | adapt: the turn and the keys stay physical, as the color picker's area does |
| a press anywhere turns the dial there, a drag follows | Zag, Mantine | a Mount on `control` (the angle from its center), focusing the thumb | adopt; the pointer is captured; only a primary button counts |
| `onValueChangeEnd` / `onChangeEnd` | Zag, Mantine | Message `Released`; Model `dragging`; root `data-dragging` | adopt |
| marks, with labels | Zag (markers), Mantine (marks) | `marks`; Slots `markers`, `marker`, `markerLabel`; `--fk-angle-marker`; `data-state` at/under/over | adopt |
| restrict to marks | Mantine | `restrictToMarks`: a drag lands on the nearest mark the short way round, the keys go mark to mark | adopt; without marks it throws at definition |
| value text, formatted | Zag (valueText), Mantine (withLabel, formatLabel) | Slot `value`, `format`, `showValue`; recipe axis `value: inside/below` | adopt |
| `aria-valuetext` | APG | `valueText`, default `90 degrees` | adopt |
| disabled, read-only, invalid | Zag | view flags; `aria-disabled`, `aria-readonly`, `aria-invalid`; root `data-*` | adopt |
| a hidden input for a form (`name`) | Zag, Mantine | Slot `input`, drawn with `name` | adopt |
| size, thumb size | Mantine | recipe axis `size`, from the ladder's control height; the thumb from the ladder's icon | adopt |
| the arc filled to the value | ours (Fluid's slider fill) | recipe axis `track: ring/plain/disc`, a conic gradient masked to a ring | added |
| a needle from the center | Mantine's look | Slot `needle` | added |
| tone | ours | recipe axis `tone: accent/neutral` | added |
| a spring or ease on the thumb | Fluid | none | skip: the thumb is placed by `sin()`/`cos()` of a custom property, which does not transition without `@property`, and a drag should not lag |

The pointer: `PointerDrag` reports places among marked descendants, not coordinates, and `Move`
reports deltas from a start it does not report. The dial was built with a local Mount, as the
color picker's area and the signature pad's `Ink` were; with three wanting "where the pointer is
in this element while pressed", `PointerPosition` in `foldkit-primitives/dom` became the one all
three read.

### Timer view (step 8)

Read from Zag's timer machine and anatomy, Ark UI's Timer (Zag's) and the ARIA `timer` role.
Mantine and shadcn ship none (Mantine has `useInterval` and `useTimeout` hooks only).

| Option | Seen in | Home | Decision |
|---|---|---|---|
| countdown or stopwatch | Zag `countdown` | Model `countdown`; `init` takes `{ countdown: true, duration }` or a stopwatch | adopt |
| `startMs` / `targetMs` | Zag | Model `duration`: a countdown's start, a stopwatch's optional end | adapt: one field, since a countdown always ends at 0 |
| `interval` | Zag | Model `interval` | adopt; a tick waits for the display's next change, not a fixed beat |
| start, pause, resume, reset, restart | Zag, Ark | Message `Pressed { action }` | adopt |
| the clock | Zag (`Date.now`) | the `Stamp` and `Tick` Commands, on Effect's `Clock` | adapt: TestClock drives a whole run, and a pause keeps every millisecond |
| a tick from before a pause | ours | Model `turn`; an older turn's tick is dropped | added |
| `onTick`, `onComplete` | Zag | the application reads `Timer.phase(model)` after `update` | adapt: the Model is the application's, so it sees each change |
| `autoStart` | Zag, Ark | the application's `init` returns `Timer.update(model, Timer.Message.Pressed({ action: 'start' }))` | adapt: `init` returns a Model, as every `init` here |
| `running`, `paused`, `progressPercent` | Zag | `Timer.phase`; root `data-state`; `--fk-timer-progress` | adopt |
| days, hours, minutes, seconds, milliseconds | Zag, Ark (`Item type`) | `units`, `Timer.partsOf`; Slot `item` with `data-unit` | adopt; the largest unit shown holds the rest, and a countdown rounds up |
| separator | Zag, Ark | Slot `separator`, option `separator` | adopt |
| action triggers | Zag, Ark (`ActionTrigger`) | Slot `action` with `data-action`: one press that says what comes next, and reset | adapt: one element that changes its words keeps the focus, where a trigger per action would swap elements under it |
| `role="timer"` | ARIA | Slot `area` | adopt; named by the label, the separators read, so the time reads `01:05:00` |
| translations | Zag | `labels` | adopt |
| tiles, a progress bar, sizes, tone | ours | recipe axes `look`, `progress`, `size`, `tone` | added |

### Marquee (step 8)

Read from Zag's marquee machine and anatomy, Mantine's Marquee, Magic UI's and shadcn-svelte's
marquee (the shadcn community's), and WCAG 2.2.2 (Pause, Stop, Hide).

| Option | Seen in | Home | Decision |
|---|---|---|---|
| `side`: start, end, top, bottom | Zag; `reverse`, `vertical` in Mantine and Magic UI | view `side`; root `data-side`, `data-orientation` | adopt; `end` and `bottom` run the animation reversed |
| speed in px/s | Zag | `speed`; the content measured by `Resize`; duration = length / speed | adopt |
| a duration instead | Mantine, Magic UI (`--duration`) | `--fk-marquee-duration`, the recipe's default until measured | adopt as the fallback |
| `autoFill` | Zag | `autoFill` (default true): copies to cover the viewport and one more | adopt |
| `repeat` | Mantine, Magic UI | `repeat`, the fewest copies (default 2) | adopt |
| spacing between items and between copies | Zag `spacing`, Mantine `gap` | recipe axis `spacing`; a zero-size last flex item gives the seam the same gap | adopt |
| `delay`, `loopCount` | Zag | view options; `--fk-marquee-delay`, `--fk-marquee-loop-count` | adopt; no fill, so a round that ends shows the first copy |
| pause on hover and focus | Zag, Mantine, Magic UI | CSS on `data-pause-on-interaction` | adopt, on by default |
| a controlled pause, `pause()`, `resume()` | Zag | Model `paused`; Messages `Paused`, `Resumed`; Slot `pause` | adopt; the press is drawn by default (WCAG 2.2.2) and says what it will do |
| clones hidden from screen readers | Zag (`aria-hidden`) | `inert` on every copy after the first | adapt: `inert`, so a link in a copy is not a second tab stop either |
| `role="region"`, `aria-roledescription="marquee"` | Zag | root | adopt |
| fade edges | Zag (`edge` part), Mantine | recipe axis `edges: fade/none`, a mask on the viewport | adapt: a mask needs no ground color, so no Slot |
| reduced motion | Zag | the distance travels; under `prefers-reduced-motion` the viewport scrolls and one copy shows | adopt; the `motion` knob at 0 stills it too |
| `onLoopComplete`, `onComplete` | Zag | none | skip: nothing here waits on a round; an `animationiteration` Mount can add it |
| `Measure` | asked for | not used | `Measure` sends no Message (so it could not be on by default) and measures every frame of a running animation, which a marquee always is; `Resize` from `foldkit-primitives/observers` measures only on a resize |

### Image Cropper (step 8)

| Option | Seen in | Home | Decision |
|---|---|---|---|
| crop rect, dragged to move | Zag, cropperjs, react-easy-crop | Model `image.crop`, in the turned image's pixels; `Move` on `selection` | adopt |
| eight resize handles | Zag, cropperjs | Slot `handle` with `data-handle`, `Move` each; recipe axis `handles: all \| corners` | adopt |
| min size | Zag (`minWidth/Height`), cropperjs | `init({ min })` in image px, never under 24 CSS px drawn | adopt |
| max size | Zag | (bounded by the image) | skip: the image and the view bound it; output size is the export's to scale |
| aspect-ratio lock | Zag, cropperjs, react-easy-crop | Model `aspect` (`init({ aspect })`, `ChangedAspect`) | adopt; a corner follows the farther-moved edge, an edge resizes about its middle |
| round crop | Zag `cropShape`, react-easy-crop `round` | Model `shape: rectangle \| round`; `data-shape` for the recipe; the export clips its ellipse | adopt |
| zoom (slider, wheel, `+`/`-`) | Zag, react-easy-crop | Model `zoom`/`maxZoom`; Slider in Slot `zoom`; local wheel Mount on `stage` | adopt; the selection keeps its place on screen and the image magnifies under it |
| pinch zoom | Zag, react-easy-crop | — | skip for now: `Move` tracks one pointer; needs a two-pointer primitive. The slider and wheel cover it |
| pan the zoomed image | Zag (`panning`), react-easy-crop | drag on Slot `pan` (`Move`), view and crop move together, clamped to the image | adopt |
| rotation | Zag (any angle), cropperjs, react-easy-crop | Model `rotation: 0 \| 90 \| 180 \| 270`, Slot `rotate` ×2 | adapt: quarter turns only; an axis-aligned crop of a freely turned image has no meaning in image pixels and would export corners of nothing |
| flip | Zag, cropperjs | — | skip: no source app in the gallery asks for it; the export's turn code is where it would go (a scale of -1) |
| fixed crop area | Zag `fixedCropArea`, react-easy-crop | — | skip: react-easy-crop's model (pan under a fixed frame) is reachable with `handles: corners` hidden by `.extend`; recorded |
| grid guides | cropperjs, react-easy-crop `showGrid`, Zag | Slot `guides`; recipe axis `guides: drag \| always \| none` | adopt |
| keyboard: arrows move, Shift ×10, Alt+arrows resize, `+`/`-` zoom | Zag | `PressedKey` decided in `update`, steps in screen pixels | adopt (Zag's keys); physical in either direction, as the plane is |
| `role="slider"` "2D slider" on the selection with valuetext | Zag | selection attrs; `labels.crop` | adopt |
| handles hidden from assistive technology | Zag | `aria-hidden` | adopt |
| reset | Zag `reset()` | Message `Reset`, Slot `reset` | adopt |
| get crop data in natural pixels | Zag `getCropData`, react-easy-crop `croppedAreaPixels` | `ImageCropper.crop(model)` (rounded, turned image px), `rotation` in the Model | adopt |
| export cropped image (Blob/data URL) | Zag `getCroppedImage` | Command `Export` from `RequestedExport({ type, quality })` → `Exported({ url, width, height })` / `FailedExport` | adopt as a data URL; a Blob is `fetch(url).blob()` (a Message stays serializable) |
| cross-origin images | (all, by canvas) | view `crossOrigin` | adopt; a tainted canvas answers `FailedExport` |
| viewport shape | react-easy-crop `objectFit`, cropperjs | recipe axis `viewport: landscape \| wide \| square` | adopt |
| motion | Fluid | key/control moves glide on `travelled(motion.fast)`; a drag snaps (`data-dragging`) | adopt |
| touch: a wider hold | Fluid, our Card | recipe `::before` under `(pointer: coarse)`; `touch-action: none` | adopt |

### Signature Pad (step 8)

| Option | Seen in | Home | Decision |
|---|---|---|---|
| strokes as data | Zag `paths`, signature_pad `toData` | Model `strokes` (points `{x, y, pressure}` in the pad's coordinates) and `drawing` | adopt |
| pressure where available | Zag (pointer pressure), perfect-freehand | `Ink` reports `pressure` and `pen`; a pen's is used, else simulated from speed | adopt |
| smoothing | perfect-freehand `streamline/smoothing`, signature_pad (Bézier, velocity) | `pathOf`: streamlined points, variable-width outline, quadratic path through midpoints; Model `pen: { size, thinning, smoothing }` | adopt perfect-freehand's method (written here, no dependency) |
| min distance between points | signature_pad `minDistance` | `update` drops points under 1 pad px | adopt |
| coalesced events | (pen apps) | `Ink` uses `getCoalescedEvents()` | added: a fast pen keeps its curve |
| clear, undo | Zag `clear`, signature_pad | Messages `Cleared`, `Undid`; Slots `clear`, `undo`, disabled when they would do nothing | adopt |
| redo, undo of a clear | — | — | skip: no source has it; clear is an explicit discard |
| export SVG | signature_pad `toSVG` | `toSvg(model, { color?, font? })`, pure; `pathOf(stroke, pen)` per stroke | adopt |
| export PNG | Zag `getDataUrl`, signature_pad `toDataURL` | Command `ExportPng` from `RequestedPng({ scale, background })`, colour and face read from the drawn elements | adopt |
| guide (baseline) and "Sign here" | Zag `guide` part | Slots `guide`, `placeholder` (`BASELINE` 0.72 of the height), hidden once signed | adopt |
| label | Zag | Slot `label` naming the group | adopt |
| disabled, readOnly | Zag | view `disabled` (no Mount, buttons and field disabled) | adopt `disabled`; readOnly is a disabled pad that keeps its look, so skip a second flag |
| hidden input for forms | Zag `name`, hidden input | — | skip: a Foldkit app submits from its Model; `toSvg` gives the value |
| accessible fallback | ours (task), WCAG 2.5.1 | Slot `input` + `fallbackLabel`: a typed name, shown on the line in `--fk-signature-font`, written by both exports; view `fallback: false` to leave out | adopt |
| control's role | Zag `role="application"` | `role="img"` named by what it holds ("Signature: signed, 2 strokes") | adapt: `application` takes every key from a screen reader for a surface that has none; the typed field is the keyboard path |
| pen colour, background | signature_pad `penColor`, `backgroundColor` | recipe (`control` color, `currentColor` fill); export `background` | adopt |
| surface, size | Fluid | recipe axes `surface: plain \| muted \| dashed`, `size: sm \| md \| lg` | adopt |

### QR Code (step 8)

| Option | Seen in | Home | Decision |
|---|---|---|---|
| value encoded to a matrix | Zag (`uqr`) | `QrCode.encode(text, level): Option<Matrix>`, pure | adopt; `uqr` as a dependency (Zag's own encoder, zero deps, MIT, 5 kB): a hand-written encoder would be ~350 lines to keep, and the app never shares it, so not a peer |
| error correction L/M/Q/H | Zag `encoding.ecc` | view `level`, default `M`, `H` under an overlay | adopt |
| `boostEcc` | Zag | — | skip: a level the app names is the level drawn; boosting hides which one the overlay relies on |
| text too long for any version | Zag (throws in `uqr`) | `encode` gives none; view draws the `fallback` slot | adapt: no throw from a view on user data |
| modules as one path | Zag `pattern` | Slot `pattern`, `pathOf(matrix)` (a run per row) | adopt |
| quiet zone | the standard (4 modules) | view `quietZone`, default 4, in the view box; Slot `background` | adopt |
| centred logo | Zag `overlay` | Slot `overlay`, view `overlay: Html`, 22% of the width on the code's light color | adopt |
| foreground/background colors | Zag (CSS on `data-part`) | recipe: `text.overt` on `surface.base` | adopt |
| dark on light on a dark page | scanners (not all read inverted codes) | recipe axis `scheme`: `light` (default, `color-scheme: light` so `light-dark()` tokens take their light half) or `page` | adopt |
| size | Zag `pixelSize` | recipe axis `size` sm/md/lg (8, 12, 16rem); the SVG scales | adapt: modules are view-box units |
| download as PNG/SVG | Zag `getDataUrl`, download trigger | `QrCode.Download({ id, format, filename, pixels })` Command → `Downloaded` / `DownloadFailed` | adopt; colors resolved from the drawn code, since a file has no tokens |
| download trigger part | Zag | the application's Button sends a Message answered with `Download` | skip the part: a second button component; the Command is the one way |
| overlay in the downloaded file | Zag | — | skip: the overlay is markup, which an image file cannot hold; documented |
| accessible name stating what it encodes | APG img | root `role="img"`, `aria-label` default `QR code: <value>`, `label` overrides | adopt |
| server rendering | Zag (SVG) | pure encode and path, tested through `renderToString` | adopt |

### Chart (step 8)

| Option | Seen in | Home | Decision |
|---|---|---|---|
| bar, line, area, donut | shadcn, Recharts, Tremor | view `kind`, one `Chart.view` | adopt |
| stacked bars and areas | shadcn, Tremor `stack` | — | skip for now: a stacked domain is the sums, and the tooltip a running total; recorded |
| horizontal bars, radar, radial | shadcn | — | skip: out of the tight scope |
| data as rows keyed by series | shadcn/Recharts `dataKey` | `categories` + `series: [{ name, values, color? }]`, plain data | adapt: no accessor functions, so the view input holds none nested (h.submodel) |
| ChartConfig label/color | shadcn | `Series.name`, `Series.color` (1–5) | adopt; a series that a filter can remove names its color so the others keep theirs |
| `--chart-1..5`, dark-aware | shadcn | `chart` group in `Theme.oklch`, `light-dark()` per slot; `chart-h` knob | adopt; values from the dataviz reference palette's first five slots, validated in both schemes (contrast WARN in light → the table is the relief channel) |
| more series than colors | dataviz (never cycle) | the view throws past five | adopt |
| value axis with nice ticks | Plot, d3, Recharts | `Scale.ticksOf`: 1/2/5×10ⁿ, zero included, domain = first to last tick | adopt: every tick names a value on the axis |
| category axis | all | `xTick` per band; every other one `data-minor`, hidden below 30rem by a container query | adopt |
| gridlines | shadcn `CartesianGrid` | Slot `grid`, `data-zero`; recipe axis `grid`: `lines` / `zero` | adopt |
| legend | shadcn, Tremor `showLegend` | Slots `legend`, `legendItem`, `swatch`; shown with ≥2 series and for a donut; `legend` overrides | adopt |
| tooltip at an x with every series | shadcn, Recharts | Slots `tooltip`, `tooltipLabel`, `tooltipRow`, `tooltipName`, `tooltipValue`; opens toward the start past the middle | adopt |
| tooltip indicator dot/line/dashed | shadcn | recipe axis `indicator`: `dot`, `line` | adopt dot and line; dashed skipped (a dashed swatch reads as a dashed series) |
| cursor on the lit band | Recharts | Slot `cursor` | adopt |
| active dot on lines | Recharts `activeDot` | Slot `dot`, drawn at the lit category, 8px | adopt |
| others dim while one is lit | Tremor, dataviz | recipe, `data-pointed` + `data-active` | adopt |
| value format | Tremor `valueFormatter` | view `format`, default en-US grouping (a fixed locale, so server and browser agree) | adopt |
| responsive width | shadcn `ChartContainer` | the plot in percentages; lines in a stretched 100×100 box with `vector-effect: non-scaling-stroke` | adapt: the brief asked for `Measure`, but `Measure` sends no Message and writes only pixel custom properties, so it cannot choose ticks or geometry; percentages fill any width with nothing measured, render the same on a server, and keep a Mount that sends nothing off by default (AGENTS trap) |
| keyboard across points | Recharts `accessibilityLayer` | plot is a tab stop (`role="group"`, `aria-roledescription="chart"`, named by the caption); arrows, Home, End step; Escape and blur clear; focus lights the first | adopt |
| announce the point | Highcharts, Recharts | Slot `status` (`role="status"`), only when the keys lit it | adopt |
| data table fallback | WAI complex images | Slots `table`, `tableCaption`, `tableHead`, `tableBody`, `tableRow`, `tableHeader`, `tableCell`; visually hidden unless `table: 'shown'`; the drawing is `aria-hidden` | adopt |
| right to left | shadcn RTL | the drawing stays left to right (time runs so in Recharts and Plot); the axes' grid mirrors | adapt |
| height | shadcn `min-h-*` | recipe axis `height` sm/md/lg (10/14/18rem) | adopt |
| donut centre total | shadcn donut example | Slots `center`, `centerValue`, `centerLabel`; the lit slice replaces the total | adopt |
| brush, zoom, animation on enter | Recharts | — | skip: scope |

### Cascade Select (step 8)

| Option | Seen in | Home | Decision |
|---|---|---|---|
| value is the path, root first | Zag | Model `value: Option<ReadonlyArray<string>>` | adopt |
| one column per level | Zag, Ark | view, `column` Slot per level | adopt |
| one level at a time with a way back | Ant Design's mobile cascader, task | view `layout: 'drill'`, Slot `back` | adopt; the back row is for the pointer (`aria-hidden`, `tabindex=-1`); the keys go back with ArrowLeft |
| highlight on click or hover (`highlightTrigger`) | Zag | view `expandOn: 'click' \| 'hover'` | adopt |
| only leaves selectable unless `allowParentSelection` | Zag | `Config.parents` | adopt; choosing a parent keeps the popup open so one can go deeper |
| `closeOnSelect` | Zag | `Config.closeOnSelect` (default true) | adopt |
| `loopFocus` | Zag | `Config.loop` | adopt |
| disabled options | Zag, APG | `Node.disabled`; the keys and typeahead skip them | adopt |
| disabled, invalid | Zag | view `disabled`, `invalid` (`aria-invalid`) | adopt |
| readOnly, required | Zag | — | skip: a read-only select is the trigger's text; required is the form's check of the hidden input, which an application adds to its validation |
| `multiple` | Zag | — | skip: several paths is a Tags Input over this select; recorded |
| clear trigger | Zag | view `clearable`, Slot `clear`, `Cleared` (focus goes back to the trigger) | adopt |
| value text with a separator | Zag | view `separator` (default ` / `), `placeholder` | adopt |
| a column's name | ours | view `levels`, Slot `heading`, the column group's `aria-label` | added: `Country, Region, City` reads better than an unnamed column |
| form submission | Zag (hidden select) | view `name`, Slot `input` (ids joined by `/`) | adopt |
| trigger `role=combobox`, `aria-haspopup`, `aria-expanded`, `aria-controls` | Zag | view | adopt; `aria-haspopup="tree"` |
| popup semantics | Zag (listbox of treeitems), APG tree | panel `role=tree` with `aria-activedescendant`, columns `role=group`, rows `role=treeitem` with `aria-level`, `aria-selected`, `aria-expanded`, `aria-owns` (the next column) | adapt: Zag mixes listbox and treeitem; the APG tree is the consistent fit |
| ArrowDown/Up, Home/End within a level | Zag, APG | `update` (`Pressed { key }`) | adopt |
| ArrowRight into children, ArrowLeft to the parent, swapped right to left | Zag, APG | view `direction` + `readingKey`, `update` | adopt |
| Enter/Space choose (or go in on a parent) | Zag, APG | `update` | adopt |
| typeahead | APG tree (recommended), absent in Zag | `update`: a letter goes to the next enabled row it begins, wrapping | adopt, single character (no buffer, so no clock) |
| Escape closes, focus back to the trigger | Zag, APG | `update` + `FocusTrigger` Command | adopt |
| Tab / a press outside closes | Zag | `OnFocusLeave` → `Left` (no focus given back) | adopt; the backdrop takes the press so nothing beneath (the trigger included) receives it |
| the active row scrolled into its column | Zag | `RevealItem` Command on key moves | adopt |
| positioning, flip, the trigger's width | Zag, Ark | `@foldkit/ui` anchor (`PlaceCascade` Mount), view `anchor`, recipe `width: 'trigger'` | adopt |
| above every stacking context | ours | top layer (`topLayer` around `PlaceCascade` on the `layer` box) | adopt |
| size ladder, trigger look | Listbox | recipe `size`, `trigger: outline \| filled \| ghost` | adopt |
| fluid hover | Fluid, the popups | — | skip for now: `FluidHover` runs one list per container; a column each would need one Mount per column; recorded |

### Floating Panel (step 8)

| Option | Seen in | Home | Decision |
|---|---|---|---|
| position and size in the Model | Zag (`position`, `size`) | Model `rect` | adopt |
| draggable from a drag trigger | Zag `drag-trigger` | Slot `dragTrigger`, `Move` Mount, view `draggable` | adopt; apart from the controls, whose presses a captured drag would take |
| resizable from 8 edges and corners | Zag `resize-trigger` axes | Slot `handle` × 8 (`data-edge`), `Move` per handle, view `resizable` | adopt |
| min and max size | Zag | `Limits.min` (default 160×96), `max` | adopt |
| kept within the viewport | Zag (boundary) | `moveRect`, the viewport measured by `Bounds` on the `boundary` Slot | adopt; a smaller viewport brings it back inside |
| `allowOverflow` | Zag | `Limits.overflow` | adopt |
| `gridSize` | Zag | `Limits.grid` | adopt |
| `lockAspectRatio` | Zag | — | skip: a window's content reflows; a fixed ratio belongs to media, which the Image Cropper owns |
| minimize, maximize, restore | Zag stages | Model `stage`, `StageChosen`, Slots `minimize`, `maximize`, `restore` | adopt; minimized hides the body and refuses a resize; maximized fills the viewport and refuses a move; restore puts it back |
| close, Escape (`closeOnEscape`) | Zag | `close`, Slot `close`, view `closeOnEscape` | adopt |
| `persistRect` | Zag | inherent: closing keeps `rect` in the Model | adopt |
| initial focus, restore focus | Zag | `open(model, { opener })` focuses the panel; `close` focuses the opener | adopt |
| keyboard move and resize | task (absent in Zag) | the drag trigger and the bottom-end corner are tab stops: arrows move/resize by `step` (10), Shift ×5; `aria-keyshortcuts` | adopt |
| right to left | ours | view `direction`: the keyboard corner is the bottom left | adopt; positions stay physical |
| z-order among several, `data-topmost` / `data-behind` | Zag | `Raised` OutMessage on press/focus, `raise(order, id)`, view `order`, `z-index` from `BASE_LAYER` (40) | adopt |
| `strategy: absolute` | Zag | — | skip: `fixed` only; a panel scrolling with the page is a card |
| top layer | ours | — | skip: z-index cannot order top-layer elements, and raising one there means hiding and showing it again, which drops its focus |
| non-modal dialog semantics | Zag, APG | `role=dialog`, `aria-modal=false`, `aria-labelledby` the title | adopt |
| double-click the header to maximize | OS windows | — | skip for now: not in Zag; recorded |
| motion | ours | recipe: place and size ease to a new stage (`travelled`, so reduced motion jumps), none while dragged | adopt |

### Tour (step 8)

| Option | Seen in | Home | Decision |
|---|---|---|---|
| steps: title, description, target, placement | Zag, Driver, Shepherd | `Step`, `Config.steps` | adopt |
| a step with no target, centred (`type: dialog`) | Zag, Driver | `Step.target` omitted | adopt |
| a missing target (`skipMissingElement`) | Driver | `Spotlit { found: false }` → `missing`, drawn centred and refocused | adapt: shown in the middle rather than skipped, so the tour's count holds |
| `wait` steps, `effect()` | Zag | — | skip: an application drives that by its own Messages and `start`/the Model; recorded |
| spotlight cutout, offset (`spotlightOffset`, `stagePadding`) | Zag, Driver, Shepherd | Slot `spotlight`, view `padding` (8) | adopt |
| spotlight radius (`spotlightRadius`, `stageRadius`) | Zag, Driver | recipe (`radius.lg`) | adopt |
| overlay colour and opacity | Driver | recipe `dim` (a mix of the page's ink) | adopt as a recipe value |
| target clickable through the cutout | Driver `disableActiveInteraction`, Shepherd `canClickTarget` | view `interactive` (default true), a `clip-path` hole in the `blocker` | adopt |
| page blocked outside (`preventInteraction`) | Zag | the `blocker` takes every press outside the hole | adopt (always) |
| outside press dismisses (`closeOnInteractOutside`, `overlayClickBehavior`) | Zag, Driver | view `dismissOnOutside` (default false: a stray press keeps the tour, Shepherd's default) | adopt |
| next / back / skip, done on the last | all | Slots `next`, `back`, `skip`; `labels` | adopt |
| progress text `2 of 5` (`progressText`, Reactour badge) | Zag, Driver, Reactour | Slot `progress`, view `progressLabel`; a bar from `--fk-tour-progress` | adopt |
| keyboard arrows (`keyboardNavigation`) | Zag, Shepherd, Reactour | `Pressed { key }` with `readingKey` (right to left, ArrowLeft goes on) | adopt |
| Escape (`exitOnEsc`, `closeOnEscape`) | Shepherd, Zag | view `closeOnEscape` | adopt |
| scroll the target into view (`scrollTo`, `smoothScroll`) | Shepherd, Driver | `ShowStep` Command, smooth unless reduced motion | adopt |
| focus the step; back to the opener at the end | Shepherd | `PlaceStep` (anchor's `focusAfterPosition`) or `ShowStep` for a centred step; `FocusOpener` | adopt |
| focus trap | Shepherd | — | skip: a step may ask the reader to use its target, which Tab must reach; the step is a non-modal dialog |
| the end, completed or skipped (`onStatusChange`) | Zag, Driver | `Ended { completed }` OutMessage | adopt |
| arrow (`arrow`) | Zag, Shepherd | Slot `arrow`, the anchor's `arrowId`, Popover's `arrow` recipe piece | adopt |
| `addStep`/`removeStep`/`setSteps` | Zag | the application's `Config` | inherent |
| dots navigation | Reactour | — | skip: the bar and `2 of 5` say the place; jumping ahead skips the steps' sense |
| top layer | ours | the `layer` box (`topLayer` around `Spotlight`) | adopt |
| the cutout glides between steps | Zag (CSS vars) | `Spotlight` re-reads `data-target`, so one element follows every step; recipe transition (`travelled`) | adopt |

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

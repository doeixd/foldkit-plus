# UI Showcase

A page for every `@foldkit/ui` component, from Animation to Virtual List, each
in its basic and harder configurations: animated, disabled, nested, stacked,
grouped, multi-select. A sidebar (a full-screen dialog on a phone) links the
pages through the URL. It ports Foldkit's
[UI showcase](https://github.com/foldkit/foldkit/tree/main/examples/ui-showcase)
to Foldkit Plus, where its point is `foldkit-mixins-ui`: every component with
an adapter is drawn through it.

## Who owns what

`@foldkit/ui` owns each component's state and accessibility, as upstream. The
Model holds each component's Submodel and the value it edits (a checkbox's
`isChecked`, a slider's number). What changed is who owns the look:

```text
@foldkit/ui toView(attributes) -> X.resolve(attributes, [XStyle.mixin]) -> h.button(resolved.button)
                                   foldkit-mixins-ui: the bundles as Slots   foldkit-mixins: Recipes + page Styles
```

A component with no adapter takes the page's own Slots instead, through
`childAttributes(slots.x.attrs())`. Where `@foldkit/ui` takes only a class name
(a menu item, a listbox option, a toast entry), the element is styled from its
container's Slot by the role and data attributes the component writes.

## Run it

```bash
pnpm --filter foldkit-example-foldkit-ui-showcase dev
```

| Concern | Owner | Where |
| --- | --- | --- |
| The route, links, the mobile menu closing on navigation | plain Foldkit routing | `src/main.ts` |
| Each component's state, keyboard and pointer handling, ARIA | `@foldkit/ui` Submodels in `UiModel` | `src/ui/model.ts`, `update.ts`, `subscriptions.ts` |
| The values the demos edit | the Model | `src/ui/model.ts` |
| Button, Input, Textarea, Select, Checkbox, Switch, Fieldset, Disclosure, Dialog, Popover, Tooltip, Hover Intent, Slider, Tabs, Radio Group, Calendar (also inside Date Picker) | `foldkit-mixins-ui` adapters (`X.resolve`) | `src/ui/view/*.ts` |
| Their looks | `Recipes.Button`, `Input`, `Textarea`, `Checkbox`, `Switch`, `Dialog`, `Tabs` (with `.extend`); page Styles for the rest | `src/ui/style/*.ts` |
| Menu, Listbox, Combobox, Date Picker, Toast, File Drop, Drag and Drop, Animation, Virtual List, Nav | `@foldkit/ui`, drawn with the page's own Slots | `src/ui/view/*.ts` |
| Meter and Progress | local ports of upstream's `@foldkit/ui` views | `src/ui/meter.ts`, `progress.ts`, `range.ts` |
| Theme, shell, every page's Slots | `foldkit-mixins` | `src/style.ts`, `src/ui/style/*.ts` |

### What is not used, and why

- **`foldkit-primitives` Behaviors.** Every keyboard, focus and selection
  behavior on these pages is the component's own: `@foldkit/ui` owns the
  roving focus of Tabs and Radio Group, typeahead in Menu and Listbox, the
  Calendar grid's arrow keys. A Behavior on the same element would be a
  second owner of the same keys and the same state.
- **`foldkit-mirror`.** The route is the only state in the URL, and it is the
  route: nothing the Model owns is copied there.
- **`foldkit-surface`, `-agent`, `-remote`, `-sync`, `-form`, and Bundles.**
  There is no server, no agent, nothing durable, and no form with validation:
  the fields are components shown for themselves. The component Submodels are
  folded with `Update.foldChild` as upstream folds them, but each fold's `read`,
  `write` and `toParentMessage` come from one `foldkit-bundle` Link per
  component (`Update.foldChild({ ...virtualListDemo, update: VirtualList.update })`), so
  a Message a component ignores leaves the Model as it was instead of redrawing
  the page.

## Differences from upstream

- **Meter and Progress** are not in the pinned `@foldkit/ui` 0.163.0; `src/ui`
  ports upstream's views, cut to the inputs this page passes.
- **The volume slider is horizontal.** The pinned Slider has no orientation,
  so its section is "Fractional steps" instead of "Vertical".
- **Checkbox and Switch controls are empty.** The shipped recipes draw the
  check, the dash and the knob from `aria-checked`, in place of upstream's
  `✓`, `—` and knob elements.
- **One calendar drawing** (`src/ui/calendarGrid.ts`) serves the Calendar and
  Date Picker pages, which upstream draws twice.
- **Dialog widths** are the recipe's `sm` (24rem) and `md` (32rem), where
  upstream uses 24, 28 and 32rem.
- **A `ChangedUrl` for the page shown, with the menu closed, returns the Model
  unchanged.** Upstream closes the menu on every URL change, and closing a
  closed dialog copies its Model, which redrew the page.
- The look approximates upstream's Tailwind indigo and grays with a
  `Theme.oklch` palette.

## Foldkit Plus gaps met

- No `foldkit-mixins-ui` adapter for Menu, Listbox, Combobox, Date Picker or
  Toast (no `toView` seam), nor for File Drop, Nav, Drag and Drop, Animation
  and Virtual List, which do hand out attribute bundles.
- No recipe for Select, Fieldset, Disclosure, Popover, Tooltip, Hover Intent,
  Slider, Radio Group or Calendar.
- A recipe's pieces are optional per slot, so reusing `Recipes.Button`'s look
  on a plain `h.button` needs `?? Style.empty`; and `extend` cannot drop a
  slot's piece, so the Dialog recipe's corner close button is destructured out.

## Tests

From the repository root: `npx vitest run examples/foldkit-ui-showcase`.

- `test/story.test.ts`, `test/scene.test.ts`: upstream's, unchanged but for
  the import paths.
- `test/update.test.ts`: a `ChangedUrl` for the page shown changes nothing,
  and one to another page leaves a closed menu alone.
- `test/view.test.ts`: every route, and the menu, listbox, popover, calendar,
  dialogs, toasts and mobile menu open, drawn inert: every element is in a
  Slot but what `@foldkit/ui` draws itself, and every token the drawn Styles
  read is in the stylesheet. `Inert.draw` supplies the Submodel render frame;
  interaction cases also use Scene to drive clicks and resolve Commands/Mounts.
- `test/gauge.test.ts`: the Meter and Progress ports' ARIA, clamping and state.
- `test/runtime.test.ts`: the real runtime in jsdom: a nav link opens its page
  and marks itself current, the Button counts clicks, and the Styles of the
  drawn Slots reach the document.

# Platform-independent Style and Behavior

**Status:** design, 2026-09-24. Nothing here is built. Follows
[styleImprovements-DESIGN.md](./styleImprovements-DESIGN.md) (the Style
kernel, Layers, Theme, Layout, Recipes) and
[behaviors-DESIGN.md](./behaviors-DESIGN.md) (the Behavior catalog). It asks
one question: how much of `foldkit-mixins` means something off the web, and
what would it take to make that part real without weakening the web path.

## The claim, and its limit

The idea that makes Mixins work is a portable one. A view publishes typed
slots. Callers attach appearance and interaction from outside. Nothing owns
state except the Model. None of that is specific to HTML.

The *encoding* is web-specific. It lives in five places:

| Where | What is web-bound today |
| --- | --- |
| `StaticContribution.attributes` | Foldkit `Attribute<Message>` values from `foldkit/html` (`h.AriaExpanded`, `h.OnClick`) |
| `StaticContribution.mounts` | `MountAction` from `foldkit/mount`, which receives a DOM `Element` |
| Rule pieces | selector strings (`&:hover`, `> *`) and at-rule strings (`@media …`, `@container …`) |
| Declaration values | strings with CSS units (`'16px'`) and CSS functions (`var()`, `oklch(from …)`, `color-mix()`, `light-dark()`) |
| The view | `HtmlBuilder`: every slot is an HTML element |

The last row is the limit. Foldkit renders HTML. Portable Style and Behavior
only pay off where a Foldkit view reaches another renderer, and today the
only route is `foldkit-react-codegen`, which compiles views to TSX. So the
realistic first target is **React Native through codegen**, not a Foldkit
native renderer. This document designs for any host but measures every
decision against that one.

## What is already portable

An audit of the code as of `0ef92e2`.

| Piece | Portable? | Why |
| --- | --- | --- |
| `Capability`, `Event`, `Attr` tokens | Yes as data | They are `MetadataToken`s: names and inheritance, no behavior. The *names* are web vocabulary (`keydown`, `aria-expanded`), which section 3 separates from meaning. |
| `Slots.define`, `Slot.make`, `Slots.describe` | Yes | Pure metadata. |
| `A11y.validate`, `Patterns.catalog` | Yes | Compares contracts, never a DOM. The catalog already records a `floor`, the native fallback per pattern. |
| Style kernel: `inline`, `compose`, `when`, `whenInput`, `perItem`, `recipe`, `recipeFor` | Yes, with caveats | Pure data over a `{ property: string }` record. Caveats in section 2. |
| `Theme.define`, `compose`, literal token values | Yes | Records of named values. |
| `Theme.ref(theme)` | Symbolically | It prints `var(--fk-…)`, but each reference is a typed group and name, so another host could resolve it. |
| `Theme.oklch` derivations | No | Values are CSS expressions only a browser evaluates. |
| Rule pieces, `Layers`, `stylesheet` | No | Selectors, at-rules, cascade layers. |
| `Layout.stack`, `cluster`, `center`, `pad` | Mostly | Flexbox. React Native lays out with Yoga, which is flexbox. |
| `Layout.split`, `sidebar`, `switcher`, `autoGrid` | No | Container queries, `flex-basis` wrap math, CSS grid. |
| Stateless Behaviors (`Disclosure`, `ToggleState`, `FieldAssociation`, `SpinValue`, `Collection`) | Meaning yes, encoding no | Their state is the parent's Model. What they emit is `h.Aria*` calls. |
| Stateful interaction (`RovingTabindex`, `Typeahead`, `Press`, `DismissLayer`, …) | Model yes, Mounts no | The Bundle's Model and update are portable. Its Mount calls `element.addEventListener`. |

The pattern is consistent. **The Model side and the metadata side already
travel. What does not is the last step, where intent becomes a
platform-specific attribute, listener, or CSS string.** That last step is
what this design moves behind an interface.

## The architecture: intent, then a host

```text
Style / Behavior  ──▶  Contribution (portable intent)  ──▶  Host.interpret  ──▶  platform props
                             │                                   │
               declarations, conditions,               web: class, style, CSS, aria-*, listeners
               a11y intents, events, mounts            native: style objects, accessibility*, Pressable
```

Today the contribution *is* the platform output: a class list, a style
record, and Foldkit attributes. The change is to make the contribution a
small, typed intermediate form, and to make the current behavior the **web
host**. The web host must produce byte-identical output for every existing
style and behavior; that is the compatibility test for the whole design.

```ts
export interface Host<Target extends string> {
  readonly target: Target
  /** Declarations after conditions are resolved, in the host's own shape. */
  readonly style: (resolved: ResolvedStyle<Target>) => HostStyle<Target>
  /** Semantic accessibility intent to host attributes. */
  readonly a11y: (intent: A11yIntent) => HostA11y<Target>
  /** A semantic event to the host's handler name, or a diagnostic. */
  readonly event: (event: EventToken) => HostEvent<Target>
  /** The element handle a Mount receives on this host. */
  readonly handle: HandleCapabilities<Target>
}
```

Hosts live outside `foldkit-mixins`. `foldkit-mixins` ships the intent types
and the web host, because the web host is today's resolver. A native host
would live beside the renderer that uses it, `foldkit-react-codegen` or a
future `foldkit-native`.

## 1. A target on every piece

Portability is only useful if a web-only piece cannot reach a native view
unnoticed. Give `StyleValue` and `NamedBehavior` a phantom target:

```ts
type Portable = 'web' | 'native'           // the set grows with hosts
interface StyleValue<T extends string = Portable> { … }

Style.inline(...)          // StyleValue<Portable>
Style.pseudo(':hover', …)  // StyleValue<'web'>
Style.compose(a, b)        // StyleValue<TargetOf<a> & TargetOf<b>>  (the intersection)
```

A view rendered by a host declares its target. `Style.forSlots` for a native
view then requires `StyleValue<'native'>`, so passing a piece that contains a
`pseudo` rule is a **type error at the attach site**, not a silent no-op on
the device. `compose` narrows by intersection, so one web-only piece makes
the whole composition web-only, which is the truth.

Default the parameter to `'web'` at first. Every existing signature keeps
compiling, and pieces opt in to `Portable` as they are audited. Flipping the
default is a later, separate breaking change.

## 2. Portable styles

### 2.1 Values

Declarations are typed as `string` today. React Native wants numbers for most
lengths and rejects `'16px'`. Keep strings for the web and add structure for
the portable profile:

```ts
type Length = number | `${number}%` | Ref<'space' | 'size' | 'radius'>
type Color = string | Ref<ColorGroups>
```

A number means density-independent pixels on native and `px` on the web. The
web host prints `16` as `16px`. `Ref` is a symbolic theme reference: a group
and a name. `Theme.ref(theme)` returns printed strings today
(`var(--fk-surface-overt)`); it would return `Ref` values instead, which the
web host prints to the same string and a native host resolves against the
active theme to a literal. Callers of `Theme.ref` do not change.

### 2.2 Property profiles

`Declarations` is built from csstype today, which accepts `display: 'grid'`,
`position: 'sticky'`, and `cursor`, none of which exist on native. Add a
profile per target:

```ts
type Declarations<T> = T extends 'native' ? NativeDeclarations : WebDeclarations
```

`NativeDeclarations` is the intersection of csstype with React Native's
`ViewStyle | TextStyle | ImageStyle`, keyed in camelCase. A portable piece is
typed against the intersection of every target's profile, so it can only use
properties that exist everywhere.

### 2.3 Conditions as data

The web-only part of Style is conditions written as strings. Replace the
string with data for the conditions that have a meaning on every platform:

```ts
type Condition =
  | { state: 'hover' | 'focus' | 'focusVisible' | 'pressed' | 'disabled' }
  | { dataState: string }                        // Style.states already
  | { scheme: 'light' | 'dark' }
  | { width: Breakpoint }                        // Style.responsive already
  | { reducedMotion: true }
  | { child: 'first' | 'last' | number }

Style.on(condition, declarations)                // StyleValue<Portable>
```

The web host compiles `Style.on` to exactly what `pseudo`, `states`,
`responsive`, and `media` produce today. A native host resolves each
condition at render time:

| Condition | Native source |
| --- | --- |
| `hover` | ignored on touch; pointer hover where the platform reports it |
| `focus`, `focusVisible` | focus state the host tracks per element |
| `pressed` | the `Pressable` pressed state |
| `disabled` | the element's disabled prop |
| `dataState` | the value the view or Behavior wrote |
| `scheme` | `Appearance.getColorScheme()` |
| `width` | window dimensions |
| `reducedMotion` | `AccessibilityInfo.isReduceMotionEnabled()` |
| `child` | the index the view passes in `attrs(base, item)`, which `perItem` already receives |

Descendant selectors, sibling combinators, `:has()`, container queries, and
`@starting-style` have no portable meaning. They stay `StyleValue<'web'>`.

### 2.4 Layers without a cascade

A native host has no cascade, but it has merge order. Layers become a static
precedence: resolved declarations merge from the first layer to the last,
and later wins within a layer. Because `Layers.standard` already fixes the
order, a portable sheet means the same thing on both hosts. The unlayered-rule
diagnostic carries over unchanged.

### 2.5 Theme as an expression tree

`Theme.oklch` stores its derivations as CSS strings, so only a browser can
evaluate them. That was the right call for the web: one knob override
re-derives everything live. Keep that and add a second reading of the same
source:

```ts
type Expr =
  | { lit: string | number }
  | { ref: [group: string, name: string] }
  | { oklch: [l: Expr, c: Expr, h: Expr] }
  | { from: Expr; l?: Delta; c?: Delta; h?: Delta }   // relative color syntax
  | { mix: [a: Expr, b: Expr, amount: Expr] }          // color-mix in oklch
  | { lightDark: [light: Expr, dark: Expr] }
  | { calc: … }
```

`Theme.oklch` builds `Expr` values. The web host prints them to exactly
today's CSS strings. A native host evaluates them in TypeScript, doing the
OKLCH math and the gamut mapping, to concrete sRGB colors per scheme, and
re-evaluates when a knob or the scheme changes. The derivation table is
written once. This is the one change that makes a portable theme real rather
than nominal.

### 2.6 Layouts

`stack`, `cluster`, `center`, `pad`, and `frame` become `StyleValue<Portable>`
with numeric gaps. `split`, `sidebar`, `switcher`, and `autoGrid` stay web.
A portable `split` is possible later with `onLayout` measurement feeding a
`width` condition; it is not free, so it waits for demand.

## 3. Portable behaviors

A Behavior today returns builder calls:
`[h.AriaExpanded(open), h.AriaControls(id)]`. That is already the right
information, in the wrong vocabulary. The change is to have Behaviors return
**intents**, and have the host spell them.

### 3.1 Accessibility intents

```ts
type A11yIntent = {
  readonly role?: Role                                  // a closed set, not a string
  readonly state?: {
    expanded?: boolean; selected?: boolean; checked?: boolean | 'mixed'
    disabled?: boolean; invalid?: boolean; busy?: boolean; pressed?: boolean
  }
  readonly value?: { min?: number; max?: number; now?: number; text?: string }
  readonly label?: string
  readonly relations?: {
    controls?: string; describedBy?: string; labelledBy?: string; activeDescendant?: string
  }
  readonly hidden?: boolean
  readonly live?: 'polite' | 'assertive'
}
```

| Intent | Web host | React Native host |
| --- | --- | --- |
| `role` | `role` | `accessibilityRole` (mapped; unmapped roles are a diagnostic) |
| `state.*` | `aria-expanded`, `aria-selected`, … | `accessibilityState` |
| `value` | `aria-valuemin/max/now/text` | `accessibilityValue` |
| `label` | `aria-label` | `accessibilityLabel` |
| `relations.labelledBy` | `aria-labelledby` | `accessibilityLabelledBy` (Android); dropped with a diagnostic on iOS |
| `relations.controls`, `describedBy`, `activeDescendant` | `aria-*` | no equivalent: a diagnostic, or the pattern's floor |
| `hidden` | `hidden` / `aria-hidden` | `accessibilityElementsHidden`, `importantForAccessibility` |
| `live` | `aria-live` | `accessibilityLiveRegion` (Android); `AccessibilityInfo.announceForAccessibility` on iOS |

`Disclosure`, `ToggleState`, `FieldAssociation`, `SpinValue`, and
`Collection` rewrite to return `A11yIntent`. Their inputs, requirements, and
tests do not change. The web host's output for them must be byte-identical.

The existing `Attr` tokens stay as the *requirement* vocabulary for slots
(`attributes: [Attr.AriaInvalid]`). A slot declaring `Attr.AriaInvalid`
admits the `state.invalid` intent. The token names keep their ARIA spelling
because ARIA is the most precise shared vocabulary; the host maps meaning,
not spelling.

### 3.2 Events

`Event.Press` already exists beside `Event.Click`. Make the semantic events
the portable ones:

| Portable event | Web | Native |
| --- | --- | --- |
| `Press` | click, plus Enter and Space on non-buttons | `onPress` |
| `LongPress` | the primitives' long-press timing | `onLongPress` |
| `Focus`, `Blur` | focus, blur | `onFocus`, `onBlur` |
| `Change`, `Input` | change, input | `onChangeText`, `onValueChange` |
| `Submit` | submit | `onSubmitEditing` |
| `KeyDown` | keydown | hardware keyboards only; web-typed |
| `PointerDown/Up`, `Hover`, `Click` | as named | web-typed |

A Behavior that requires `Event.Click` is `NamedBehavior<'web'>`. One that
requires `Event.Press` is portable. The existing capability and event checks
in `Behavior.forSlots` are unchanged; the target is one more phantom
parameter checked the same way as Style's.

### 3.3 Mounts get a handle, not an element

A Mount receives a DOM `Element` today. Most Mounts use a handful of things:
focus it, measure it, scroll it into view, listen to it. Give Mounts a typed
handle whose capabilities depend on the target:

```ts
interface Handle {
  focus(): void
  blur(): void
  measure(): Effect<Rect>
  scrollIntoView(options?: { block?: 'start' | 'center' | 'end' | 'nearest' }): void
}
interface WebHandle extends Handle { readonly element: Element }   // the escape hatch
```

A Mount written against `Handle` is portable. A Mount that reads `element` is
web-typed. `Autofocus`, `Bounds`, `Resize`, focus restoration in
`FocusScope`, and `scrollIntoView` in `ListNavigation` fit `Handle`. `Press`,
`Move`, `DismissLayer`, and `HideOutside` listen to raw pointer and document
events, so they stay web and get native counterparts that use the platform's
responder system and feed **the same Bundle Messages**. The Bundle, its
Model, and its `update` are shared. Only the Mount is per host.

That split is the real payoff of the repository's ownership rule. Because a
Behavior never owns state, porting a stateful interaction means porting one
Mount, not a component.

### 3.4 Keyboard-first patterns

`RovingTabindex`, `Typeahead`, `ListNavigation`, and `GridNavigation` assume
a keyboard. On touch they are not wrong, just mostly idle. Their Bundles run
unchanged. Their Mounts become no-ops on hosts without a hardware keyboard,
and the pattern catalog's `floor` says what the widget falls back to. That
is already how the catalog describes `<details>` as the floor for
`Disclosure`.

## 4. The view

Everything above changes what a slot receives. None of it changes that
`HtmlBuilder` builds HTML. Two options, and a recommendation.

**Option A: codegen hosts.** `foldkit-react-codegen` already turns a view
into TSX. A native target maps tags to primitives (`div` to `View`, text
nodes to `Text`, `button` to `Pressable`, `input` to `TextInput`, `img` to
`Image`) and emits a call to the native host's `interpret` for every slot's
contribution. Views stay HTML at authoring time. Tags without a mapping are
a codegen diagnostic.

**Option B: a neutral element vocabulary.** A builder with `box`, `text`,
`pressable`, `field`, `image`, `scroll`, that each host renders. Clean, but
it is a second view language, and every existing view and `@foldkit/ui`
component would need porting.

**Recommendation: A.** It reuses the one renderer bridge the repository
already has, and it keeps HTML as the authoring language, which is what
Foldkit is. Option B is a separate project, and should only be revisited if
A's tag mapping proves too lossy in practice.

## 5. Where each thing lives

| Thing | Package | Notes |
| --- | --- | --- |
| Target phantom on `StyleValue`, `NamedBehavior` | `foldkit-mixins` | defaults to `'web'` |
| `Length`, `Color`, `Ref`, `Condition`, `Style.on` | `foldkit-mixins` kernel | portable |
| `Declarations<T>` profiles | `foldkit-mixins` kernel | `NativeDeclarations` is types only |
| `Expr` and `Theme.oklch` over it | `foldkit-mixins/theme` | web printer beside it |
| `A11yIntent`, `Handle` | `foldkit-mixins` | types plus the web mapping |
| Web host | `foldkit-mixins` | today's resolver, rewritten over intents |
| Native host, native Mounts | `foldkit-native-host` or inside `foldkit-react-codegen` | depends on `react-native` as a peer |
| Native `Expr` evaluator | beside the native host | OKLCH to sRGB, gamut mapping |

The kernel rule from the style design holds: none of the portable types
imports `foldkit/html` or `foldkit/mount`. The import-graph test extends to
cover them.

## 6. Rejected alternatives

- **Interpret CSS strings on native.** Parse `&:hover` and `@media` at
  runtime on the device. It works for a demo and fails on every selector
  that has no meaning off the web. The type system could not say which pieces
  are portable.
- **Evaluate the theme in TypeScript everywhere.** One code path, but the web
  would lose live re-derivation from one overridden custom property, the main
  thing `Theme.oklch` is for.
- **Make ARIA strings the portable vocabulary.** Hosts would parse
  `aria-expanded="true"`. Typed intents are shorter, checkable, and map to
  both sides.
- **A separate portable package** beside `foldkit-mixins`. It would duplicate
  the slot contracts and the resolver. The phantom target does the separation
  inside one algebra.
- **Portability by default.** Flipping every piece to `Portable` at once
  would make most of today's pieces type errors. Default to `'web'` and widen
  as each piece is audited.

## 7. Phase plan

1. **Target phantom, defaulted to `'web'`.** No behavior change. Type tests
   show `compose` narrowing and a web piece refused by a hypothetical
   `'native'` slot view.
2. **`A11yIntent` and the web host for it.** Rewrite the five stateless
   Behaviors over intents. Byte-identical web output is the test.
3. **`Style.on` and `Condition`.** Web compilation equal to today's
   `pseudo`, `states`, `responsive`, and `media` output. Mark the portable
   Layout pieces and recipes `Portable` where they qualify.
4. **`Length`, `Color`, `Ref`, and the property profiles.** The web host
   prints numbers as px. The portable profile is a type-level intersection
   only.
5. **`Expr` under `Theme.oklch`.** A web printer that reproduces today's
   strings exactly, then a pure evaluator with tests against known OKLCH
   conversions.
6. **`Handle` for Mounts.** Port `Autofocus`, `Bounds`, `Resize`,
   `FocusScope`, and `ListNavigation` to it.
7. **A native host spike through codegen.** Tag mapping, the style and a11y
   interpreters, a native `Press` Mount, and the todo-app rendered in React
   Native as the proof. Only after this do the host interfaces freeze.

Phases 1 to 6 are useful even if phase 7 never ships. They make web output
more typed, make the theme data inspectable, and make Behaviors describe
meaning rather than spelling.

## 8. Open questions

- **Text styles.** React Native only inherits text styles inside `Text`.
  Portable text styling may need a `text` slot capability so the host knows
  where to put font declarations.
- **Units in tokens.** `Theme.tokens.space` is in `rem` today. Portable
  tokens want unitless numbers with the web host adding `rem` or `px`.
  Choosing between them changes every token.
- **Where `Host` is chosen.** Per view, per application, or per render
  call. Per application is simplest. Mixed trees, such as a web view inside
  a native WebView, are out of scope.
- **Animation.** `Style.enter`, `stagger`, and keyframes are web. A portable
  motion story would build on `foldkit-primitives/motion`'s `Tween` and
  `Spring` Bundles, which are already Model-owned and portable.

# Mobile: touch, safe areas, the keyboard and the small screen

An audit of every package for how it behaves on a phone or tablet: what a tap leaves behind,
where a finger can and cannot reach, what the on-screen keyboard covers, where a notch or the
home indicator cuts in, and what overflows a 360px screen. Four read-only audits (styling
foundations, overlays, gestures, forms and layout) found the items below. Each is
**confirmed** (read in the source) unless marked **hypothesis**.

## How the work runs

- **Systems first.** Part A fixes the rules every recipe shares, so a dozen findings close at
  once and no component patches its own copy.
- **A touch claim is a browser test in the `browser-touch` project** (`*.touch.browser.test.ts`,
  whose page is a touch screen from the start: `pointer: coarse`, `hover: none`). A fine-pointer
  twin keeps the desktop as it was. Geometry and computed style, never markup alone.
- **Keyboard and safe-area claims** cannot be emulated by Chromium alone; they are checked
  against the CSS they produce and on a device where named.
- **What is done well stays** (the end of this document).

## A. Foundations: what every recipe inherits

1. **Hover sticks after a tap** (high). A touch screen keeps `:hover` on what was tapped
   last; 61 hover rules in 40 files were unguarded. **Done:** the stylesheet writes each hover
   selector under `@media (hover: hover)`, and a copy without its hover under
   `@media (hover: none)`, so `:is(:hover, :focus-within)` still reveals on focus
   (`packages/mixins/src/styleRules.ts`). The reset's raw link and button hovers are guarded
   by hand. Tests: `hoverGuard.browser.test.ts` and its touch twin, with mutations.
2. **`text-size-adjust: none` blocked the reader's text size** (high, `defaults.ts`). **Done:**
   `100%`, which still stops landscape inflation.
3. **The grey tap flash** (med). **Done:** the reset makes it transparent; plain buttons and
   links get `:active`. Recipes need their own pressed state: A5.
4. **Double-tap zoom on fast taps** (low). **Done:** `touch-action: manipulation` on
   interactive elements in the reset.
5. **Pressed feedback only on Button** (med). Menu, listbox and tree rows, tabs, segmented,
   toggle, accordion trigger, pagination showed nothing on a tap once hover is guarded.
   **Done:** the recipes' `hover()` is `:is(:hover, :active)`, and so are the raw hover fills of
   rows and pressable parts; under the guard a touch screen keeps only the `:active` branch.
   Field borders keep hover alone (a press there is a focus, which has its own ring).
6. **Controls under 44px on touch** (med). Control heights are 28 to 40px (`tokens.ts:99`), and
   `Touch.target` is used by no recipe. Add a `control.touch` floor token, 2.75rem under
   `(pointer: coarse)`, and make the ladder's `minBlockSize` `max(height, floor)`, so every
   control gets it and the desktop keeps its density. Thumbs, splitter grips, the sheet handle,
   close buttons, steppers, day cells and the grid's handles widen their hit area with a
   transparent `::before` under `(pointer: coarse)` rather than growing (Part C).
7. **Fields that still zoom on iOS** (med). `touchText` misses the OTP input, the color
   picker's hex input and the data grid's cell editor. Compose it in; a coarse-pointer
   backstop in `Defaults.controls` covers application inputs.
8. **Safe areas, as tokens** (med). Only the Sheet reads `env(safe-area-inset-*)`. Add a
   `safe` token group (`top`, `right`, `bottom`, `left`), a `Layout`/`Utilities` piece that pads
   by it, and use it in Toast, the full Dialog, the maximized FloatingPanel, the Sidebar sheet
   and Banner. Examples' viewport meta gains `viewport-fit=cover` (without it every inset is 0).
9. **Prefixes Safari still needs** (low). `userSelect` is written unprefixed, and iOS Safari
   reads only `-webkit-user-select`; `-webkit-touch-callout` is set nowhere. A `draggable`
   piece in `design.ts` (`touch-action: none`, both selects, `touch-callout: none`) for every
   drag surface.
10. **Smaller items** (low). `theme-color` meta in the examples; `100vw` in toast, nav,
    cascadeSelect and tour (counts a desktop scrollbar) to `100%` or `100dvw`;
    `scroll-margin-block` on fields so a focused one clears a sticky header and the keyboard.

## B. Overlays: the keyboard, safe areas, small screens

1. **The on-screen keyboard covers fields** (high). Nothing reads `visualViewport`. A
   `KeyboardInset` Mount (primitives/dom) writes `--fk-keyboard-inset` from `visualViewport`
   `resize` and `scroll`; the bottom Sheet pads by it, a Dialog caps its height by it and aligns
   to the top while it is above 0; the Anchor re-places a panel on the same events. Document
   `interactive-widget=resizes-content` for Android.
2. **ContextMenu cannot open by touch** (high). iOS fires no `contextmenu` on long-press, and
   Android's opens at the fallback point. Wire `interaction/long-press.ts` for touch, record the
   point on every `pointerdown`, swallow the click after, and give the target
   `-webkit-touch-callout: none`. `LongPress` first gains a movement slop and suppresses the
   native `contextmenu` while held (C7).
3. **Toasts under the notch and the home indicator** (high). Inset each stack by the safe area
   (A8), and cap the width by it.
4. **Autofocus opens the keyboard on open** (med). Under a coarse pointer, a Dialog or Sheet
   focuses its panel or title unless `initialFocus` is given.
5. **Scroll chains to the page** (med). `overscroll-behavior: contain` on the dialog and sheet
   panels, `listScroll`, the Command list and the Sidebar nav.
6. **Tooltip and HoverCard on touch** (med). They open on emulated hover after a tap and stay.
   Ignore a `mouseenter` that follows a touch `pointerdown`; offer long-press to open.
7. **A click-away tap activates what is beneath** (med, hypothesis). The menu closes on
   `pointerdown` and the backdrop is gone before the tap's `click`. Swallow that click on touch.
8. **Panels wider than the screen** (med). Cap popup, HoverCard and menu panels at
   `calc(100% - 1rem)` of the viewport; a submenu on a phone drills in instead of opening beside.
9. **Close buttons under 44px** (low): A6.

## C. Gestures

1. **Builder drags do nothing on touch** (high). `PointerDrag` sets no `touch-action`, so the
   browser takes the gesture as a scroll and cancels. A touch path that starts on a held press
   (about 400ms within 8px), so a list still scrolls; the mouse keeps its 4px threshold.
2. **Data grid's fill handle and header reorder** (high). `touch-action: none` and a 44px hit
   area on the fill handle; header reorder on a held press; a wider resize grip.
3. **ImageCropper has no pinch** (high). Two pointers zoom about their midpoint through the
   wheel's `zoomed()`; a second finger cancels the one-finger move.
4. **Slider, Resizable and Sheet handles too small** (med): A6's hit areas.
5. **Carousel autoplay ignores touch** (med). It pauses on mouse enter and leave: pause on
   `pointerdown` and scroll, resume on `Settled`.
6. **Rich text block drag has no threshold** (med). A tap's jitter starts a drag; require 4 to
   6px first.
7. **`LongPress` lacks a slop and the `contextmenu` guard** (low): before B2 and C1.
8. **Grid range selection by touch** (med): a held press enters range mode.

## D. Forms and layout

1. **Generated forms cannot ask for a keyboard or autofill** (high). `FieldAttrs` in
   mixins-form gains `autocomplete`, `inputmode`, `enterkeyhint`, `autocapitalize` and
   `spellcheck`; `email`, `tel` and `url` default autocapitalize and spellcheck off.
2. **A wide Table overflows the screen** (high). Its frame scrolls inline, with the scroll fade.
3. **Search fields autocorrect what is typed to filter** (med). Combobox and Command inputs:
   `autocapitalize="none"`, `autocorrect="off"`, `spellcheck=false`, `enterkeyhint`.
4. **NumberField's keypad** (med). `inputmode="decimal"` has no minus on iOS: `numeric` for a
   whole non-negative step, `text` where negatives are allowed.
5. **TagsInput on Android** (med). Gboard reports the comma as `Unidentified`; commit on the
   delimiter in the typed text too.
6. **Rich text's floating toolbar under the system callout, and its menu under the keyboard**
   (med). On touch, dock the selection toolbar below the selection or at the bottom; place the
   slash menu by `visualViewport` (B1).
7. **Data grid editing on touch** (med). Double-click never comes; a tap on the focused cell
   edits. Multi-select by touch needs a checkbox column or a select mode.
8. **Select and Combobox on a phone** (med). A sheet presentation below `sm`; list height
   `min(16rem, 40dvh)`.
9. **Native date input on touch** (med). A `native` option, as the grid's `choiceEditor` has.
10. **Smaller items** (low). Scrolling tabs by default; Menubar scrolls or folds below `sm`;
    the Builder's narrow preview at 360px.

## Already done well

The `travel` knob and reduced motion; `:focus-visible` throughout; `color-scheme`; no `100vh`
anywhere; `overscroll-behavior: contain` on the dialog's scroll, ScrollArea, Carousel and Tabs;
`touch-action: none` on every drag surface; `Move`, `Swipe` and `PointerPosition` capture the
pointer, handle `pointercancel` and follow one pointer; the native range input; Carousel's
native scroll snap; FluidHover and the popup rows skip touch for hover; the 16px field text
on touch (`touchText`); the OTP field's `one-time-code`; the password field's autofill; the
Sheet's safe areas; the toast's swipe and hold; the iOS scroll lock; Sidebar becoming a sheet
below `md`; compact Pagination.

## Status

- **A7 and A9: done**: the stylesheet adds `-webkit-user-select` beside `user-select`; every
  recipe rule with `touch-action: none` sets `-webkit-touch-callout: none` (a test over the
  compiled recipes); `touchText` on the OTP input and the colour picker's fields, 16px for the
  grid's editor. The grid's resize and fill handles get theirs with C2.
- **B1: done** for the Dialog and the bottom Sheet: `KeyboardInset` (primitives/dom) and the
  opt-in `Dialog.keyboard` mixin (it sends no Message, so it is not on by default), with
  browser tests and mutations. The Anchor re-placing popups on `visualViewport` changes, and
  documenting `interactive-widget=resizes-content`, are left.
- **A6: done.** `--fk-touch-floor` (the reset, coarse pointers only) and `controlHeight` in
  `design.ts`, for the ladder's controls and rows and the square icon controls
  (`touchTarget.touch.browser.test.ts`, with mutations). Thumbs, grips and handles that must
  not grow visibly still need their `::before` hit areas (Part C).
- **A8 and B3: done** for the tokens, Toast and Dialog (`safeArea.browser.test.ts`, under
  Chrome's emulated insets, with mutations); the FloatingPanel, Banner and a body helper are
  left. The examples keep their viewport meta: `viewport-fit=cover` lets the page's own
  content run under the notch too, so an application opts in once its layout pads by `safe`.
- **A1 to A5: done.** (`tagsInput.browser.test.ts`'s burst test fails now and then under a
  wide run, before and after; alone it passes.)
- Next, in order: A6 (pressed state, touch floor), A8 with B3 (safe areas), B1 (keyboard),
  A9 with C1 to C3 (gestures), B2 (long-press menu), D1 to D3, then the rest by severity.

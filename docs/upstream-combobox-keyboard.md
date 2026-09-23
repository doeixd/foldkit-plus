# Upstream notes: `@foldkit/ui/combobox` keyboard behavior

Notes for a pull request against foldkit, gathered while pinning the
Combobox keyboard contract as Scene tests in
`packages/mixins-ui/test/comboboxContract.test.ts` (Phase G of
[behaviors-DESIGN.md](./design/behaviors-DESIGN.md)). Checked against
`@foldkit/ui` 0.163.0. Line numbers refer to
`dist/combobox/shared.js` in that build.

The contract is the one effect-atom-jsx's research settled on, which is
the WAI-ARIA Authoring Practices (APG) editable combobox with list
autocomplete plus the conventions Downshift and React Aria share. Each
note says where the contract comes from, so the rows that are APG can be
weighed differently from the rows that are only convention.

Every row below has a Scene test prefixed `upstream:` that pins today's
behavior. When upstream changes, that row fails and gets turned around, so
the fix and the test land together.

## Summary

| #   | Key                          | Today                                   | Contract                                    | Source                | Priority |
| --- | ---------------------------- | --------------------------------------- | ------------------------------------------- | --------------------- | -------- |
| 1   | Alt+ArrowDown (closed)       | opens with the first item highlighted   | opens with no highlight                     | APG                   | high     |
| 2   | Alt+ArrowUp (open)           | moves the highlight up                  | closes, keeps focus in the input            | APG                   | high     |
| 3   | Home / End (open)            | move the highlight to first / last item | move the caret in the input                 | APG                   | high     |
| 4   | Ctrl+Home / Ctrl+End         | work only because plain Home/End do     | first / last item                           | Downshift, React Aria | medium   |
| 5   | PageUp / PageDown (open)     | ignored                                 | move the highlight by ten                   | APG (optional)        | low      |
| 6   | Escape (open, highlighted)   | closes at once                          | first clears the highlight, then closes     | Downshift, React Aria | medium   |
| 7   | ArrowDown on the last item   | wraps to the first                      | stays on the last item                      | React Aria            | low      |
| 8   | Typing / Backspace           | both highlight the first item           | typing opens with no highlight              | APG (manual selection) | medium  |

## The root cause behind 1 through 4

`handleInputKeyDown` at `shared.js:524` is declared as `(key) => ...` and
is attached with `h.OnKeyDownPreventDefault(handleInputKeyDown)` at
`shared.js:601`. Foldkit calls that handler with `(key, modifiers)`, so the
`KeyboardModifiers` record (`altKey`, `ctrlKey`, `metaKey`, `shiftKey`) is
already there and is dropped on the floor. Every modifier row is the same
fix: take the second argument and branch on it before the plain-key match.

```ts
const handleInputKeyDown = (key: string, modifiers: KeyboardModifiers) =>
  Match.value(key).pipe(
    Match.when('ArrowDown', () => {
      if (modifiers.altKey) return isOpen ? Option.none() : Option.some(Message.Opened({ maybeActiveItemIndex: Option.none() }))
      // ... existing branch
    }),
    Match.when('ArrowUp', () => {
      if (modifiers.altKey) return isOpen ? Option.some(Message.Closed({ restingInputValue, isClearable: !isReadOnly })) : Option.none()
      // ... existing branch
    }),
    Match.whenOr('Home', 'End', () => {
      if (!modifiers.ctrlKey) return Option.none() // the caret keeps the key
      // ... existing branch, which already resolves first / last
    }),
    // ...
  )
```

## Notes per row

### 1. Alt+ArrowDown opens with a highlight

APG: "Alt+Down Arrow: opens the listbox without moving focus or changing
selection." Today the ArrowDown branch (`shared.js:524-538`) does not look
at `altKey`, so Alt+ArrowDown behaves like ArrowDown and opens with
`maybeActiveItemIndex: Option.some(firstEnabledIndex)`. The fix is the
`Opened({ maybeActiveItemIndex: Option.none() })` path that
`PressedToggleButton` and the programmatic `open` already use.

### 2. Alt+ArrowUp moves the highlight

APG: "Alt+Up Arrow: if the listbox is displayed, returns focus to the
textbox and closes the listbox." Today it moves the highlight up like a
plain ArrowUp. The fix is the same message Escape sends,
`Closed({ restingInputValue, isClearable: !isReadOnly })`. Whether it
should commit the highlighted item first is a design choice: APG's editable
example does not, React Aria does not, Downshift does not. Recommend not.

### 3. Home and End move the highlight

APG: in an editable combobox Home and End "move focus to the first or last
character in the textbox." Today `keyToIndex` (`keyboard.js:7`) maps
`Home` and `End` to first and last item, and the `Match.whenOr('Home',
'End')` branch at `shared.js:564` sends `ActivatedItem` whenever the
listbox is open. That is the right behavior for a select or a listbox,
where `keyToIndex` is shared from, but in a text input it steals the
caret. The fix is to fall through unless `ctrlKey` is set (row 4). When
closed the branch already returns `Option.none()`, which is correct and is
pinned by a passing row.

### 4. Ctrl+Home and Ctrl+End

Downshift and React Aria both use Ctrl+Home and Ctrl+End for first and last
item precisely because plain Home and End belong to the caret. Today the
passing row only passes because the modifier is ignored and plain Home does
the same thing. Once row 3 is fixed, this row needs the `ctrlKey` branch or
it regresses. `keyToIndex` already resolves `Home` and `End` to the right
indices, so only the gate is new.

### 5. PageUp and PageDown

APG lists them as optional: "moves focus up or down a page of options."
Today they hit `Match.orElse` and fall through. `keyToIndex` maps them to
first and last (same as Home and End), which is a reasonable minimum, but
the contract and React Aria move by a page of ten. If the listbox knows
its visible row count, that is the better step; otherwise a fixed ten.

### 6. Escape in one stage

Downshift and React Aria: the first Escape with a highlighted item clears
the highlight and keeps the listbox open; the second closes. APG only says
Escape "dismisses the listbox if it is visible," so a single stage is APG
compliant. The two-stage form matters for screen-reader users who move the
highlight by accident and want to recover without losing the filter text.
Today `shared.js:559` sends `Closed` whenever `isOpen`. A fix would send
`DeactivatedItem` when `maybeValidActiveItemIndex` is `Some` and
`activationTrigger` is `Keyboard`, and `Closed` otherwise. Note
`DeactivatedItem` today only clears when the trigger is `Pointer`
(`shared.js` update branch), so it would need a keyboard-clearing variant
or a new message.

### 7. ArrowDown wraps on the last item

`findFirstEnabledIndex` wraps by construction (`wrapIndex`,
`keyboard.js:5`). APG's own examples wrap, so this is a convention
disagreement, not a bug. React Aria stops at the ends in a combobox on the
grounds that the input is the "before first" position. Lowest priority;
the row is pinned so the choice is at least explicit.

### 8. Typing highlights the first item, and so does Backspace

`UpdatedInputValue` (`shared.js:344`) always sets
`maybeActiveItemIndex: Option.some(0)`. That is APG's "list autocomplete
with automatic selection," which is a legitimate mode, but it is the only
mode offered, and it means Backspace re-highlights after the user cleared
the highlight. The contract asks for manual selection by default: typing
opens with no highlight, and Enter with no highlight submits the form. The
smallest change is a config flag (`autoHighlight`, default false) read in
`UpdatedInputValue`; Backspace then follows for free since it is just
another input event.

## Rows the Combobox already meets

For completeness, the rows that pass today without a prefix: ArrowDown and
ArrowUp open with the first and last item highlighted; ArrowDown moves to
the next item; Enter selects the highlighted item, closes, and emits
`Selected`; Enter, Escape, Home and End fall through when closed so the
form and caret keep them; Tab does not commit in list mode; blur closes
without moving focus. The pointer-over-content exception to blur is the
`AttachComboboxPreventBlur` Mount, which a Scene cannot exercise, so it is
noted rather than tested.

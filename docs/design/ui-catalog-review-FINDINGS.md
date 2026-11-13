# Widget catalog: review findings

A review of `foldkit-mixins-ui` made on 2026-11-13 during the UI SDK work, in
three sweeps by family, plus a browser audit of overlay behaviour. The sweeps
read source; each item is a lead until a failing test confirms it. Items are
in the reviewers' shorthand: `file:line` is approximate, and S/M/L is effort.
The status section at the end says what was fixed.

## Overlay behaviour (browser audit, tests in `packages/mixins-ui/test/overlay*.browser.test.ts`)

- KEY FACT: no shipped mixins-ui widget uses Overlay.behaviors / Presence / Leaving / dismiss-layer / focus-scope. Dialog/AlertDialog/Sheet = upstream @foldkit/ui Dialog (plain <dialog>, show(), Foldkit dom.js showDialog/closeDialog); Popover/HoverCard/Tooltip upstream + popover=manual; Menu/Listbox/Combobox forked views, remove handlers while leaving; Toast own.
- Defects (committed as test.fails):
- O1 opener removed while dialog open → focus to body on close (upstream closeDialog no fallback).
- O2 Dialog leaving panel: its controls still work (pressing "Open inner" mid-exit opens). RenderInfo has no isLeaving.
- O3 portaled panel doesn't inherit region knobs/theme (36px vs 28px rows).
- O4 RTL portaled listbox placed for LTR (~165px off): h.Dir only on wrapper listboxShared.ts:382; likely Menu/Combobox too.
- Recommendation: Leaving is not a drop-in for Dialog (page still inert by upstream isolation); gate panel controls instead (inert on content when data-leave). Leaving pays off for non-modal.

## Overlays, popups and menus

- No pattern: drawer, sheet(reuses DialogSlots), hoverIntent, picker. Only Listbox has obligations.
1. HIGH defect toast: PressedAction on a leaving entry still emits OutMessage.Acted (toast.ts:555-566; leave() no-ops at :388 but outMessage added). S
2. HIGH a11y command: active row never scrolled into view (command.ts:318-331; KeepInView exists in primitives/dom/keep-in-view.ts). S (opt-in mount)
3. MED command keymap short (no Home/End/PageUp/Down), closed switch, slot declares KeyDown → app can't add key. M
4. MED floatingPanel drag trigger: focusable div with aria-label, no role (floatingPanel.ts:535). S
5. MED sheet partial snap points unreachable by keyboard/AT (dialog.ts:130 handle aria-hidden). M
6. MED toast live region reads one toast per politeness; identical repeat not re-read (toast.ts:844-849); LiveAnnounce exists. M
7. MED toast: dismissing focused toast drops focus to body → FocusRecovery. S
8. MED listbox/combobox invalid: listboxShared.ts:347,387 only data-invalid; combobox aria-invalid unstyled; no invalid rules in recipes/listbox.ts, combobox.ts. S
9. MED hoverIntent: no Escape, no pattern, no trigger↔panel relationship. M
10. MED patterns missing (drawer, sheet, hover card, picker) + obligations for Menu, Combobox, Command, CascadeSelect, Menubar. M
11. MED menu/menubar rows identified by label (menu.ts:1190,1242,1050; menubar.ts:231,318); no value/icon. M
12. MED hand-written keydown switches: menubar.ts:271, cascadeSelect.ts:682, tour.ts:382, floatingPanel.ts:406,524, picker.ts:288, toast.ts:888, command.ts:318. L
13. MED hand-rolled focus Commands: tour.ts:157 FocusOpener, floatingPanel.ts:174 Focus, picker ~130, menubar FocusTrigger; removed opener → body. M
14. MED combobox recipe: size sm/md only (recipes/combobox.ts:151), hover on disabled wrapper (:59), clearButton 1.5em. S
15. LOW listbox trigger hover while aria-disabled (recipes/listbox.ts:116 :not(:disabled) but widget uses aria-disabled). S
16. MED drawer body visibility:hidden immediately on close (recipes/drawer.ts:71-73). S
17. LOW popover/hoverCard no presence/leave; tooltip overflow !important (recipes/tooltip.ts:42). S
18. MED cascadeSelect single-letter typeahead (:372-381), value.join('/') ambiguous (:726), no exit anim. M
19. LOW combobox Home/End swallowed while open. S
20. MED test gaps: no keyboard browser tests popover/drawer/datePicker/select/hoverCard/combobox keymap; SSR only datePicker. M
21. MED datePicker no typed entry/parsing. L
22. MED no TriggerMenu (mention/slash); autocomplete demo-only. L
23. LOW drawer bottom-only; label swap + aria-expanded double announce (:241). M
24. LOW signature disagreement: Sheet.view mixins only; Toast direction in Model; Menubar.menuMixins required. S
25. LOW z-index literals (20/40/50) → layer token group. S
26. LOW slot events omit events bundles own (Tooltip keydown, Popover keydown) → Assembly can't predict. M
- Leads: Escape bubbling popup inside FloatingPanel/Tour; IME guard (Foldkit OnKeyDownPreventDefault filters composition per ledger); Tour tab reaches page; no toast hotkey; Command aria-expanded constant true.

## Form controls and inputs

- No pattern: buttonGroup, field, label. No browser test: checkbox, input, fileDrop, field/label.
1. HIGH recipe: Input/Textarea `filled` variant kills invalid+hover border (recipes/field.ts ~L36 invalid borderColor in component; filled ~L62 variant borderColor transparent). S
2. HIGH Input.view drops name/readOnly/required/autocomplete/inputMode/maxLength/form/attributes (input.ts forwards id,value,isDisabled,isInvalid,hasDescription,type,placeholder); mixins-form/src/ui.ts ~L186 draws plain h.input instead. FieldAssociation behavior unused. M
3. HIGH NumberField parse: numberField.ts ~L150 `Number(text.trim().replace(',', '.'))` corrupts thousands-separated text; value can't be empty. M
4. MED errors not announced: field.ts descriptionOf no live region; checkboxGroup aria-invalid on fieldset. M
5. MED OtpField: no id/invalid/name/readOnly; recipe no disabled/invalid. M
6. MED FileDrop recipe: no focus-within indicator, no disabled look, hidden input absolute w/o positioned root; no browser test. S
7. MED touch floor: raw ladder('height') in numberField, otp cells, inputCopy L37, tagsInput L102, password toggle, segmented minBlockSize; Segmented xs only. S-M
8. MED RadioGroup one axis; readingKeys RTL opt-in. M
9. MED Attr tokens lack AriaChecked/Valuenow/Labelledby/Controls/Readonly/Required; radioGroup.ts declares AriaSelected on option but upstream writes aria-checked. M
10. MED no forced-colors handling anywhere. M
11. MED PasswordInput input slot draws OnKeyDown (caps lock) without declaring Event.KeyDown. S
12. MED CheckboxGroup no name/hiddenInput (mixins-form/src/ui.ts L112 compensates). S
13. MED name written 3 ways; stale "client-only" comments slider.ts:242, rating.ts:178, colorPicker.ts:773; no SSR test of names. S
14. MED TagsInput: two key handlers, no blur-add, no name, no chip arrows, hard-coded "Remove"/×; hand focus Command. M
15. MED Rating Ends hand-written keydown Mount; name = id. S
16. MED Segmented single-choice semantics/keys/name. M
17. LOW-MED sibling API disagreement (onInput/onChange/onPress/onToggle/onMessage; id meaning; invalid/readOnly coverage; toView vs view). L
18. LOW-MED InputCopy hides copy failure. S
19. LOW Checkbox/Switch/Radio no invalid state. S-M
20. LOW Slider no onCommit/description/invalid. S
21. LOW keyboard browser test gaps. M
22. LOW patterns for buttonGroup, field, label. S
23. missing widgets: SearchField, DateInput/TimeInput, FileInput button, token input.
- Cross-cutting: FieldControl options spine; recipe state-matrix browser test; controlHeight-only gate; Attr extension + declared-vs-written gate; shared field-message piece; key routes; form-participation SSR gate; forced-colors piece.

## Navigation, structure, lists and display

- No pattern: pagination, breadcrumb, table, windowList, scrollArea, appShell, card, item, avatar, badge, empty, skeleton, spinner, kbd, typography, codeBlock, image, figure, icon, separator, aspectRatio (catalog pinned toHaveLength(59) in patterns.test.ts).
1. MED defect pagination: pageCount<2 returns h.empty incl. per-page select + summary (pagination.ts:133). S
2. MED pagination: native Disabled on prev/next at ends drops focus (:150); page buttons unkeyed (:189-199). S
3. MED patterns missing (Pagination, Breadcrumb, Table, ScrollArea at least); gate should list *Slots not in catalog. M
4. MED scrollArea viewport Tabindex(0) no role/name (scrollArea.ts:56). S
5. MED carousel off-screen slides not inert (carousel.ts ~405; recipe never reads data-current). S
6. MED treeView: `*` not handled; typeahead single char (:352, :403); no multi-select. M
7. MED no FocusRecovery use: tabs close (tabs.ts:213), alert dismiss, card dismiss, sidebar inert nav (:527); windowed rows. M
8. MED resizable handle no aria-controls (resizable.ts ~210; sidebar.ts:582 has it). S
9. MED key switches: nav.ts:407,473,518; resizable.ts:215 & sidebar.ts:586 (dup splitter code); tabs.ts:206 Delete (tab slot declares only Click, tabs.ts:31). M
10. MED card: aria-disabled on roleless div/li (~149, :308), native Disabled on overlay (:128), fixed h3, aria-current for selected (:117). S
11. LOW nav aria-controls to undrawn panel (~470); link keys by href collide. S
12. LOW steps complete vs upcoming identical to AT (marker aria-hidden ~294). S
13. LOW table cells string-only (~68), no row header, empty expansion header td (~230). M
14. LOW sidebar tips keyed by init rows; missing id silently no tooltip (~225, ~540). M
15. LOW hard-coded words: pagination (:151,:176), breadcrumb (:230). S
16. LOW 0/1-based disagreement; breadcrumb chosen by label (:121). S
17. LOW skeleton/spinner always role=status (skeleton.ts:39, spinner.ts:52). S
18. LOW codeBlock trailing newline extra line (~104); "Copied" not announced (~140). S
19. LOW forced-colors. M
20. LOW literal sizes: recipes/badge.ts:95, carousel dots. S
21. LOW resizable focus ring = hover, outline none (recipes/resizable.ts:16). S
22. LOW carousel autoplay ignores reduced motion; no arrow keys. M
23. LOW marquee clones repeat ids; controls:false. S
24. MED missing widgets: Toolbar (example only), timeline, gauge. M
25. LOW test gaps: meter, typography, codeBlock, figure, aspectRatio browser; SSR for table/tree/nav/pagination/breadcrumb/accordion/tabs. M
- Leads: windowList/virtualList focused row scrolled out → body? ; sidebar rail inert focus drop; three RTL mechanisms (direction option, readingKey(), ReadingKeys Mount).

## Status

Being worked in the second wave of the UI SDK work; updated when it lands.

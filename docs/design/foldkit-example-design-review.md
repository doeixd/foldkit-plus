# Design issues exposed by the Foldkit example ports

Reviewed 2026-10-01 against the working tree at `53d6a41a`.

## Summary

The omission sections expose real integration gaps, especially between **Form, generated form views, and the styled UI controls**, and between **dynamic SSR and the host's document template**. They also contain stale claims about limitations already fixed. Treating every omitted package as a missing feature would create duplicate state owners rather than improve the project.

The recommended order is:

1. Correct stale documentation and remove obsolete workarounds.
2. Make the existing form-rendering extension points easy to use with the shipped UI controls.
3. Fix example-level URL and submission semantics that upstream parity currently preserves.
4. Provide dynamic SSR with an explicit host-head integration.
5. Investigate richer nested-form lifecycles and interaction helpers only against concrete adopters.

This is a source review of all 18 `examples/foldkit-*` READMEs, followed by targeted inspection of their examples, package implementations, and relevant installed `@foldkit/ui` types. It does not claim browser reproduction or a new test run. Proposed API shapes below are design directions, not existing callable APIs.

## Findings

### 1. Generated forms and the project's UI recipes do not compose on the normal path

**Priority: high. Owner: Foldkit Plus integration design.**

The Form and Auth READMEs say they bypass `foldkit-mixins-form` because its default controls are plain HTML rather than `@foldkit/ui` controls styled through `foldkit-mixins-ui`. Job Application additionally needs mixed layouts, status marks beside labels, and fields interleaved with independently owned pickers.

The gap is real, but it is **not the absence of customization**. [FormView](../../packages/mixins-form/src/index.ts) already has renderer overrides, a custom field view, per-key overrides, and `FormView.fields` for application-owned layouts. [The waitlist example](../../examples/foldkit-form/src/main.ts) imports that package and uses `FormView.fields`, then routes each control kind to `Input.field` or `Textarea.field` and repeats the surrounding layout. Its README's package-level “not used” claim is therefore inaccurate: the full generated view is bypassed, while the package is used.

**Fix:** supply an optional bridge between FormView's renderer/field contracts and the shipped Input/Textarea/Button adapters. Keep `foldkit-form` headless and the default HTML renderer usable without `@foldkit/ui`. First extract the waitlist's existing integration into a reusable, typed recipe or renderer set; prove it by adopting it in Form and Auth before expanding it. Preserve blur, validation, ids, labels, required state, and descriptions when crossing the bridge. A control that looks right but loses these associations is not an improvement.

For Job Application, use the existing field-level layout seam rather than force its whole page into the generated form layout. Status marks should be composable field parts/Slots if repeated implementations justify that addition.

**Verification:** compare actual markup, accessible naming, check status, blur Messages, submission, and refusal errors across the default and UI-backed renderers; exercise the view through a real Submodel, not only directly.

### 2. Submit policy exists, but the examples still present it as a limitation

**Priority: high for documentation; low for new API. Owner: examples/docs.**

Form contrasts upstream's disabled-during-check button with FormView's enabled button that queues a submit. Both are coherent policies. [FormView.submodel](../../packages/mixins-form/src/index.ts), lines 1013–1044, already accepts a `canSubmit` predicate and defaults to `form.canSubmit`. [Form](../../packages/form/src/index.ts), lines 1586–1599, distinguishes `canSubmit` from `isValid`.

**Fix:** describe the default as a policy choice, show the strict predicate path, and adopt it in an example that needs it. The remaining control-rendering mismatch is separate. Do not add a second submit-policy switch that duplicates the predicate.

The examples also show an important distinction: a visually disabled `@foldkit/ui` submit button can still submit because it uses `aria-disabled`. Form's README documents validation through Enter or that button. A visual gate is not an operation guard.

**Verification:** test Enter and click while checking, while the application's request runs, and after a failed check. Confirm the reducer enforces the intended policy independently of button presentation.

### 3. Multi-form submission lacks a convenient typed value handoff

**Priority: medium. Owner: form DX plus application policy.**

[Job Application](../../examples/foldkit-job-application/README.md) does not use forms' `Submitted` OutMessages. Its parent reveals all errors, reads per-step completion, then starts the application request. Keeping that decision in the parent is correct: four independently valid records are not automatically one valid application.

The awkward part is the value-reading seam. Form exposes `isValid`, `partial`, and a full decoded value through `engine.value`; that last method is described as the nesting engine's API, while `partial` deliberately does not promise a complete input. [The current submit Command](../../examples/foldkit-job-application/src/command.ts) takes no application payload at all—it only sleeps and reports success. The example therefore demonstrates gating, not a real aggregate-data submission contract.

**Fix:** expose a small public pure accessor returning the complete decoded value as an `Option`, if this workflow is to be supported as an application API. Let the parent compose those values with picker/file values into a defined application input, capture that input at submit time, and pass it to the Command. Do not use `partial` plus a cast to manufacture completeness. No new wizard state owner is necessary.

**Verification:** reject one incomplete record, include transformed schema values, and prove the sent payload is the submitted snapshot even if the user edits while the request runs.

### 4. The job example has unresolved submission-session semantics

**Priority: medium. Owner: example application.**

[The root update](../../examples/foldkit-job-application/src/update.ts), lines 144–198, handles `ClickedSubmit` without checking whether `submission` is already `Submitting`. Each complete submit starts another Command. When revealing starts an async check, the root returns the revealed result; later child Messages are folded normally, without a root pending-submit continuation. The README accurately says the notice remains until the check answers, but it does not establish that the original submit resumes automatically.

These are control-flow observations, not a browser reproduction. They matter because individual Form submits do have a wait-and-resume policy, while this aggregate submit does not inherit it.

**Fix:** explicitly choose “validate, then press Submit again” or “wait, then submit this attempt”. For the latter, keep the pending intent in the root Model and define what edits, removal of an entry, and navigation do to it. Guard duplicate starts in the reducer; use a request identity if concurrent or stale completion is possible. Keep Next unrestricted if browsing steps is deliberate—Next need not mean “commit this step”.

**Verification:** two submits before completion; submit during an email check; edits and removal during that wait; a failed check; a late answer after the attempt was cancelled.

### 5. Nested forms cannot carry the lifecycle of richer row controls

**Priority: medium. Owner: Form/Bundle integration.**

Job Application keeps date pickers, listboxes, and radio-group state beside each entry's form. That is reasonable for a parity port, but it exposes a ceiling on treating a whole entry as nested form input. [Form's nestedPlanOf](../../packages/form/src/index.ts), lines 525–553, explicitly refuses a nested form whose Bundle has Subscriptions or Resources: rows currently do not run those lifecycles. Commands are lifted separately.

`Input.bundle` already supports custom stateful controls, so “pickers cannot be form keys” is too broad. The narrower issue is making those controls work inside repeatable nested rows, with lifetime and service ownership intact. Having unvalidated values is not itself a reason to exclude them from a submitted input schema.

**Fix:** first demonstrate a picker-backed key in a flat form using the existing Bundle-control seam. Then design row lifecycle lifting with stable row ids, cancellation on removal, and routing of late results. Resources require special care: [Bundle collections](../../packages/bundle/src/parent.ts), lines 31–34, already reject Managed Resources because instances would share a service tag. Merely deleting Form's refusal would silently create broken lifecycles.

Keep `File` at a browser boundary; define upload metadata/handles for storage and transport. Add a file-control integration only if actual editing/validation demands it, not to make every browser object a stored form value.

### 6. UI adapter coverage is incomplete; some gaps require upstream seams

**Priority: medium-high. Owner: Plus adapters and upstream `@foldkit/ui`.**

[UI Showcase](../../examples/foldkit-ui-showcase/README.md) and Query Sync expose the missing adapter path for Menu, Listbox, Combobox, Date Picker, Toast, File Drop, Nav, DragAndDrop, Animation, and Virtual List. [The export barrel](../../packages/mixins-ui/src/index.ts) confirms those component adapters are absent. The example uses page Slots, `childAttributes`, and descendant role/data selectors instead.

These are two different problems. Components offering attribute bundles can receive a conventional adapter. Components drawing internal item markup through class-name configuration need a better customization seam upstream. For example, the installed Menu types expose container attribute hooks but item `className` configuration; DatePicker exposes trigger/panel hooks and a Calendar renderer. An outer adapter alone cannot turn all their internally drawn elements into individually typed Slots.

**Fix:** audit per-component seams and prioritize Listbox/Combobox/DatePicker because they recur in Query Sync and Job Application. Implement adapters where the installed API supports them. For the others, propose item/render callbacks or attribute-bundle hooks upstream that preserve its existing state and accessibility owner. Do not fork a second menu state machine merely to gain styling access.

The absent Select, Fieldset, Disclosure, Popover, Tooltip, HoverIntent, Slider, RadioGroup, and Calendar recipes are a **default-design-system coverage gap**, not a behavioral defect. Add recipes after the Slot contract is stable, with visible focus, disabled, invalid, selected, and high-contrast states tested.

### 7. UI Showcase's gap list and workaround code lag behind the packages

**Priority: high, small scope. Owner: examples/docs.**

Three specific README claims are obsolete:

| Claim in UI Showcase | Current implementation | Recommended action |
| --- | --- | --- |
| Textarea's resolved bundle cannot be passed to `h.textarea` | `ResolvedTextarea` explicitly narrows its textarea bundle; `resolve` returns it (`packages/mixins-ui/src/textarea.ts:19–38`) | Remove the obsolete cast/wrapper in `src/ui/textareaField.ts` where practical, then typecheck callers. |
| RadioGroup and Dialog export no resolved result type | Both types are re-exported in `packages/mixins-ui/src/index.ts:53–59` | Correct the README; use these names where explicit types are needed. |
| `Inert.draw` cannot draw `h.submodel` | It deliberately opens a Scene frame (`packages/mixins/src/testing.ts:102–130`) | Simplify the helper when it only needs a draw. Keep Scene for actual interaction steps. |

The showcase test helper still explains the old Inert limitation and wraps another Scene. Its `steps` parameter also performs interactions, so replacing every use with a plain draw would remove behavior rather than just a workaround.

**Fix:** review gap lists whenever a related API changes, and remove workaround comments/code in the same change. Link remaining workarounds to a precise supported-version constraint or tracked issue. Otherwise readers and future design work will treat repaired limitations as current architecture.

### 8. Recipe extension is additive; subtraction and precise result typing are awkward

**Priority: low-medium. Owner: Mixins API ergonomics.**

[UI Showcase's Dialog style](../../examples/foldkit-ui-showcase/src/ui/style/dialog.ts), lines 63–84, removes `closeButton` from each selected recipe result. [Style.recipeFor](../../packages/mixins/src/style.ts), lines 466–585, defines `extend` as composition of base/variant pieces with appended compounds. It has no removal semantics. Recipe results also type slot pieces as optional, producing `?? Style.empty` when a shipped recipe is reused on a plain element.

**Fix:** decide whether this warrants an explicit typed omission operation over selected recipe pieces, or a design-system variant controlling an optional piece. Prefer that focused operation to changing additive `extend` into an ambiguous overwrite/delete mechanism. If callers need required recipe keys, preserve known output keys in recipe typing instead of making every Slot required—partial styles are intentionally valid.

Removing a style is not removing markup. An unwanted close control must be omitted by the view's composition policy; dropping its style only removes the recipe's appearance.

### 9. Dynamic SSR rejects the same metadata supported by generated pages

**Priority: high for production SSR. Owner: SSR/host integration boundary.**

[SSR's omission section](../../examples/foldkit-ssr/README.md) says dynamic serving has no per-page head markup because the host owns the template. [SSR.entry](../../packages/ssr/src/index.ts), lines 940–987, confirms this is enforced: plans with `meta` throw, and per-page styles ride in the root instead. `SSR.generate` can insert metadata/head markup into a template.

Host ownership explains why the entry should not silently take over the template; it does **not** explain why dynamic serving must lack metadata. Production request-specific pages commonly need description, canonical, social metadata, and first-paint styles in the head. The cookie counter does not need them, so this limitation is easy to miss in the example.

**Fix:** introduce an explicit host cooperation seam: either pass a template/render-document capability to the dynamic integration or return head contributions in a result the host knows how to apply. Share metadata generation and checks with the static path. Keep escaping, head deduplication, HTTP headers, CSP handling, and hydration consistency under defined ownership. Check Foldkit's real `Rendered`/template protocol before choosing the shape.

**Verification:** two request-specific metadata values; parser-equivalent markup; styles in the first response head; no cross-request leakage; matching client metadata after navigation. Keep the current refusal until a host actually consumes the contribution.

### 10. Upstream parity preserves a broken URL-to-search contract in Shopping Cart

**Priority: medium. Owner: example application, not Mirror.**

Shopping Cart explicitly preserves not reading a search from the starting URL. [Its init](../../examples/foldkit-shopping-cart/src/main.ts), lines 47–55, parses the route but initializes Products without that route's search. `ChangedUrl`, lines 117–125, updates only the route. The field/filter live in the Products child, so the address and actual filter can disagree on cold load and navigation.

Rejecting Mirror as a second URL writer is sensible; retaining an inconsistent shareable URL is not. Routing's People example already shows the alternative: initialize child args from the parsed route and deliver route changes as Messages.

**Fix:** choose URL ownership for this query and feed its parsed value into Products at init and on navigation. Alternatively move ownership to the Model and adopt Mirror, as Query Sync does, while removing the existing route-query writer. Use one approach per parameter.

**Verification:** opening a copied filtered URL, back/forward, navigating from another page, and a same-route echo without extra writes or unwanted resets.

### 11. Interaction primitives have a missing higher-level composition story

**Priority: medium for interaction-heavy applications. Owner: interaction API/docs; one example gap.**

Kanban rightly retains upstream DragAndDrop: `PointerDrag` supplies pointer target facts but no keyboard sorting, ghost, auto-scroll, cross-container ordering, or focus policy. Pixel Art needs press-and-sweep rather than drag-one-item semantics. Making either port adopt PointerDrag directly would move existing behavior back into application code.

**Fix:** keep low-level pointer facts small. For sortable collections, prefer a Slot adapter around upstream DragAndDrop, or a higher-level integration with the same accessibility owner. For painting, consider a distinct delegated pointer-stroke Mount that reports visited cells and cancellation, using position hit-testing for touch/pen and interpolating skipped cells if required. [Pixel Art's canvas](../../examples/foldkit-pixel-art/src/view/canvas.ts) currently attaches mouse handlers per cell; [its subscription](../../examples/foldkit-pixel-art/src/subscription.ts) ends strokes on document `mouseup`. Touch/pen and keyboard painting are not demonstrated.

There is also a concrete release-time concern in the low-level primitive: [PointerDrag](../../packages/primitives/src/dom/pointer-drag.ts), lines 167–183 and 214–218, drops the cached `over` from the last move rather than hit-testing release. A layout change or scroll without another move can invalidate it.

**Fix for release:** recompute the DOM target/zone from the release position, then let the receiving reducer resolve placement against current domain state. Test a moved or removed target between move and release. The cached preview is not the final authority.

### 12. Auth shows the limits of struct-first conveniences, not a reason to move transitions into Mirror

**Priority: low-medium. Owner: Bundle DX/docs.**

Auth's root Model is a union. Login/logout replace the active branch and its state, with initialization data known only during that transition. Standard field declarations and `assembly.initial(rest)` fit struct parents more naturally.

The README overstates “a placement is a field of a parent struct”: [Link.make](../../packages/bundle/src/link.ts), lines 127–179, accepts custom `read`, `write`, and wrapper functions, including absence. The real issue is ergonomic branch linkage and transition-time initialization, not that all child folding is impossible outside a struct.

**Fix:** document a branch-aware Link and how the parent's transition initializes a new branch while gates stop the inactive branch's lifecycle. Add a union-branch helper only if the concrete example removes enough repetitive code to justify it. Keep existing `Update.foldChild` valid; a one-off auth union need not become an assembly.

Keeping session save/clear as Commands is appropriate. Restoring a session selects a branch and applies a route guard; Mirror copies a writable slice and must not become an authorization or login transition owner. Mirror also accepts writable projections, so its README description as strictly “top-level fields” is narrower than the actual API.

## Omissions that are sound boundaries

- **Weather:** a submit-triggered geocode→forecast Command need not become an entity cache. `foldkit-primitives/net` lacking a one-shot HTTP wrapper is not a gap when Foldkit/Effect already owns HTTP. Add Remote only if keyed reuse or screen-driven fetching is wanted.
- **WebSocket Chat:** an echo conversation is page-owned transient state, not Remote server facts. Keeping reload forgetful, and a single blank-field check outside Form, is reasonable.
- **Snake:** `ticks` reads running/speed from the parent Model; Timer/Interval would add an unnecessary running field. The smaller seam already exists and is adopted. High-score persistence would be a feature change.
- **Pixel Art History:** pure History operations record painting and undo grouping in the same transition. A placed History machine is not mandatory and should not require a second Message per cell.
- **Kanban announcements:** immediate Model text and debounced, auto-cleared `LiveAnnounce` text have different semantics. Its current implementation really introduces delayed Read/Cleared Messages. Keep the plain region for this example; use `LiveAnnounce.reread` if repeated identical text must be announced, with assistive-technology verification.
- **Route Transitions:** route entry/exit policy is not animation Presence. Fake-latency constants can remain Commands when teaching when a transition starts work.
- **Routing and Query Sync:** router-owned query data and Model-owned mirrored filters are both coherent. The problem is failing to feed the chosen owner's value to its consumer, not the existence of both patterns.
- **Counter and static/simple pages:** no consumer means no reason to declare a Surface, and no remote data means no reason to add Remote/Sync/Agent.
- **SSG:** eager boot, no static region, and a separate path-oriented envelope generator are sensible scope choices. Preview/static-host rewrite behavior and wrong-route hydration refusal are deployment contracts to document and test, not reasons to silently hydrate the wrong page.
- **Todo/Kanban/Pixel Art persistence:** versioned Mirror storage rejects upstream formats; this is a documented compatibility change. A production migration needs an explicit importer or a new key, rather than treating unreadable data as migrated. Mirror's disposable, last-write-wins storage is not a durable collaboration guarantee. It already has write pacing; Pixel Art explicitly selects `throttle: 0`, so per-cell writes are an example policy, not an absent throttling API.

## Coverage of the 18 READMEs

| Example | Assessment |
| --- | --- |
| `foldkit-api-cache` | No omission section. Current Remote ownership/caching story is coherent; it does not justify forcing Remote into Weather/Chat. |
| `foldkit-auth` | Form-renderer integration and branch-placement ergonomics; session transitions appropriately remain Commands. |
| `foldkit-counter` | Appropriate minimal scope. |
| `foldkit-form` | Main form/UI integration adopter; submit policy already configurable; “package not used” is stale. |
| `foldkit-job-application` | Field layout, nested control lifecycle, aggregate value/submission semantics. |
| `foldkit-kanban` | Higher-level sortable integration missing from Plus primitives; upstream remains appropriate. |
| `foldkit-pixel-art` | Painting interaction integration opportunity; pure History and Flags bootstrap are appropriate. |
| `foldkit-query-sync` | Coherent Model-owned mirroring; repeats missing Listbox styling seam. |
| `foldkit-route-transitions` | Appropriate transition-policy focus. |
| `foldkit-routing` | Coherent route-owned child state; no Surface/Mirror needed. |
| `foldkit-shopping-cart` | Route/search inconsistency preserved under parity; hand-wired child is acceptable. |
| `foldkit-snake` | Parent-driven clock seam already solves the cited timer mismatch. |
| `foldkit-ssg` | Appropriate minimal static example; static-host route contract deserves clear documentation. |
| `foldkit-ssr` | Dynamic metadata/head integration is a real limitation. |
| `foldkit-todo` | Appropriate local Mirror owner and pre-first-frame bootstrap. |
| `foldkit-ui-showcase` | Incomplete adapter/recipe coverage; three repaired gaps and obsolete workaround explanations. |
| `foldkit-weather` | Appropriate one-shot Command, no cache requirement. |
| `foldkit-websocket-chat` | Appropriate socket Bundle and transient page state. |

## Delivery plan

**Small corrective pass:** update the UI Showcase/Form rationale, remove the textarea workaround, simplify draw-only tests where possible, demonstrate strict FormView submission, and fix Shopping Cart's route→child search delivery. These use existing APIs and should be independent changes.

**Integration pass:** ship one optional FormView/UI bridge with Form and Auth as adopters; make Job Application capture a typed application payload and define duplicate/pending-submit behavior; add high-demand UI adapters with real upstream seams.

**Architecture pass:** design dynamic host-head cooperation; prototype lifecycle-aware nested rows; decide whether branch Links and a pointer-stroke integration earn public helpers. Each needs a real adopter and failure-path tests before becoming general API.

**Success criterion:** an omission section gets shorter because the normal path now composes, or more precise because a boundary is intentional. Package adoption counts alone are not evidence of better design.

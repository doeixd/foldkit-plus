# What the `foldkit-ssr` tests prove

For maintainers. Each entry names a phase of
[the implementation plan](../../../docs/design/ssr-PLAN.md), where the reasons
and the decisions behind it are recorded. Most files hold one test, because a
hydrated Foldkit program cannot be stopped and a document holds one
application.

- **Phase 0, the ground:** Foldkit's own rendering and hydration, one test file
  per case, because a hydrated program cannot be stopped and a page holds one
  application. The cases are a counter, a page from another build, Flags, a
  routing application, a keyed list, a controlled input with trusted
  `InnerHTML`, a custom element that renders its own contents, and head fields.
  Every hydration test fails if the server's nodes are replaced instead of
  adopted.
- **Phase 1, the envelope:** the slice round-trips onto the baseline, nothing
  outside it is in the page, each refusal has its test, and a hostile string in
  the Model cannot break out of the script.
- **Phase 2, the handover:** `init` runs once, on the server; the browser adopts
  the server's nodes and the page works; a large field left out of the plan is
  nowhere in the page; Flags never reach it; `boot` runs, including a
  `Mirror.kv` restore; and each refusal above, on the server and in the
  browser, has its test.
- **Phase 3, coverage:** each kind of gap is reported, naming the Surface and
  the field: an unsent read, an unsent activation, a Remote read, and a Surface
  the browser would activate differently, including one whose Remote id comes
  from an unsent field. A sent parent field covers its children; a local place
  with no path covers nothing; an inactive Surface is not checked.
- **Phase 4, static regions:** a region's render runs once on the server and
  never in the browser, its nodes are the same after hydration and after a
  Message, and what it reads is not in the envelope. A duplicate id is refused,
  a region missing from the page is reported and rendered, a client-only render
  works, and a render leaves no context behind.
- **Phase 5, static generation:** each path is rendered to its file, with its
  own Flags; a generated page resumes at its path with a query and a trailing
  slash, and is refused at another path; and each path no file can be served
  at is refused.
- **Phase R, Remote's state:** a page with Remote data hydrates with the data
  present and no request, and with the node the server rendered; a field no
  Surface selects is not in the page; a part that is missing, unknown or does
  not restore refuses the page; a covered Remote read passes the coverage
  check. `foldkit-remote`'s own tests pin the capture: relations, connection
  boundaries, stale marks, live cursors under the key the live entry uses,
  and retention keeping what was resumed.
- **Phase 6, delivery:** through Foldkit's real `handleRequest`, `GET` answers
  the resumable page and the browser resumes it on its route without `init`;
  `HEAD` answers with no body; `POST` is answered `405`; a missed asset renders
  nothing; a refused plan is answered `500` with the reason logged; and each
  request gets its own Flags, kept out of the page.
- **Phase A, bindings:** each binding, keyed elements included, is marked with
  its ordinal in render order and written into the envelope as its encoded
  Message, decodable by the Message Schema; a closure is not marked; a binding
  built from an unsent field is refused, naming the element; a plan without
  the Schema is refused. In the browser the markers are gone after the first
  patch, the nodes are kept, and a click, an input and a key press each
  dispatch the Message their binding names. A member that leaves the wrong
  fields fails to compile, and at runtime says why.
- **Phase B, delegated dispatch:** with no runtime booted, a click, an input,
  a change, a key press and a focus each dispatch the Message their binding
  names, with holes filled from the event; two bindings on one element both
  run and `Stop` keeps the click from the parent; a submit's default is
  prevented; a handler the page could not name stops the walk and is
  reported, so a parent is not answered alone; the listeners can be removed;
  and a marker naming no binding, an entry that is not a Message, or an
  entry for no event attribute each refuse the page.
- **Phase C, deferred boot:** a page planned to start on interaction has no
  runtime until the first event; what was typed before boot is in the Model
  after it and the input it was typed into is adopted, not rebuilt; the click
  that boots the page counts once, though the live page would have answered
  it too; an event at a handler the page could not name boots it and is
  answered by the live page alone, once, including an event no binding names;
  after boot the live page answers, not the markers; `'idle'` boots without an
  event. On the server a deferred plan is refused naming each Subscription,
  and each Managed Resource the sent Model asks for, that would start late,
  unless the plan declares it or Remote's part vouches for it.
- **Phase D, what a page may dispatch:** a binding whose Message no active
  Surface lists is refused naming the element and the tag, and one a listed
  Surface would send is not; a Surface inactive for the served Model lists
  nothing; a page with bindings and no `surfaces` is refused, on the server
  and in the browser; the browser refuses an entry an active Surface does not
  list even though it is one of the application's Messages; a handler inside
  a static region is refused naming the region and the element, and one after
  a region is not.
- **Phase E, a form without scripts:** a form with a named `OnSubmit` is
  written to post its Message to its own URL, and one with a closure, or under
  a plan with no fallback, is not; a post through Foldkit's real
  `handleRequest` runs the plan's `boot`, then `update` with the posted field
  overriding the Message's, then the Command that follows under the config's
  `resources`, and answers with the resumable page that results; a Message no
  active Surface lists, a missing Message, one that is not JSON and one that
  does not decode are each `400`; a Command that yields no Message folds
  nothing in and the page is still answered, and one that reschedules itself
  is stopped with `500` naming it; a form inside a placement has its posted
  fields filled inside the wrapper; `POST` is `405` for a plan with no
  fallback, and named among the allowed methods for one with.
- **Review hardening:** a tampered bindings list (not a list, an entry that is
  not a binding, a negative depth) and parts that are not an object are each
  refused as `Invalid`, never thrown on.
- **Second review:** a `$` pattern in the Model's data reaches the envelope as
  written; a template's `</BODY>` in capitals takes the envelope and one with
  none is refused, by `SSR.page` and when `SSR.entry` is made; an event that
  does not bubble is answered at its target alone; a custom element's string
  `value` fills a hole; the server fallback runs `boot` before the posted
  Message, and no `init` Command; an event no binding answers reaches the
  document and boots the page; while lazy bodies load, a held event goes back
  to its own target, so the named handler inside and the unnamed one around it
  both answer; and a hole form whose field refuses the empty placeholder
  renders, marked as unnamed.
- **Phase F, bodies on demand:** the server waits for a lazy bundle's bodies
  and renders the real view, once per bundle; the placement root is stamped
  with its slot; a binding inside the placement is the parent's Message with
  its hole one wrapper down, and one after it is the application's own; in the
  browser a page starting now with bodies on their way does not boot, answers
  a click, a press only the live page can answer and typing from its markers,
  boots when the bodies arrive, and shows the click once, the press once and
  the text; the stamp is gone after the first patch.

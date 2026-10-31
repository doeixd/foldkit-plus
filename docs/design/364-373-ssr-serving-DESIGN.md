# What porting foldkit-domains asked of `foldkit-ssr` (#364, #365, #371, #372, #373)

Status: built (2026-10-30).

`examples/foldkit/domains-plus` serves upstream's foldkit-domains through
`SSR.entry` on a Worker, and met five gaps (plan
[`foldkit-domains-PLAN.md`](foldkit-domains-PLAN.md) §8). Each section says who
owns the fact, what was built, and what was rejected.

## A page's status (#364)

| Fact | Owner |
| --- | --- |
| Which route a request is on | the server's Model, from `init` |
| The response's status | the host, through `SSR.entry`'s `status` |

`SSR.entry` answered every rendered page `200`; the port parsed the URL a
second time and spread `status: 404` over the entry's result. The Model the
server reached already names the route, so the entry takes
`status: (model, request) => number` and puts it on Foldkit's `Rendered`. It
is the server's Model, not the browser's: the status is the server's answer,
and a field the plan leaves out (who is asking) may decide it.

A status outside 200–599 is what `Response` refuses; it, and a `status` that
throws, is a `500` reported as `PageFailed`, as `headers` that throw are,
rather than a page Foldkit's `toResponse` would throw on later. A page
without `status` carries no status key, as before, so a build can still
prerender it.

Rejected: a status in the plan. A plan describes what crosses to the browser,
and a status never does.

## A served page's styles (#365)

| Fact | Owner |
| --- | --- |
| The CSS of the first paint | the host, through `styles` |
| Where it lives once the page is live | the document's head |
| Which rules the page already carries | `foldkit-mixins`' injection, counted from the page's sheets |

`styles` rode as the stamped root's last child. The view never draws it, so
hydration removed it on its first patch, after the injection had counted it
present and queued nothing; a page that never rendered again (domains-plus's
landing page) kept its classes without their rules.

The server now writes a comment, `<!--foldkit-plus-styles-->`, before the
styles, and `SSR.hydrate` moves every element after it into the head and
removes the rest, before any branch: a page that resumes, is contained, or is
drawn afresh keeps them alike. The injection then counts sheets that stay.
The marker, not the tag, says what to move: a view may draw a `<style>` of
its own, which must stay where it is.

Rejected: the injection watching for a counted sheet's removal
(`foldkit-mixins`). It would repair the page a frame late, after an unstyled
paint, and only by keeping a MutationObserver for the page's life; moving the
sheets first means nothing is ever removed. Nothing in `foldkit-mixins`
changed.

Foldkit's development warning that the server DOM did not match stays after
this, so the styles were not its cause:
[#375](https://github.com/doeixd/foldkit-plus/issues/375).

## `KeepTyped` on an element `h` builds (#371)

The resumable builder marks bindings in its own element functions (`rh.input`),
from the attributes it is given. `rh.KeepTyped()` handed to `h.input` reached
an element nothing marked: the server served `data-foldkit-plus-keep=""` with
no binding marker, and every browser contained the page.

Making the hole forms mark whatever element they land on is not possible: an
attribute cannot see its siblings, and the marker names the ordinal of the
element's own `OnInput` binding. So the server refuses the page instead, as it
refuses `KeepTyped` on any field it cannot replay (`UnkeepableField`). During
the first server render `KeepTyped` writes `?` as its value; `rh`'s elements
take the attribute out and write the ordinal, so a `?` left in the markup is
on an element `h` built, and the refusal names it from the markup
(`input#search`). Foldkit escapes `<` in text and attribute values, so the
last `<` before the marker opens that element.

A hole form (`rh.OnInput(Member)`) on an element `h` builds is not refused:
it is a plain closure to the page, unmarked, so the page boots on that event
as on any other `h` handler.

## A prerendered page served for a query (#373)

| Fact | Owner |
| --- | --- |
| Which paths a build writes as files | the application: `prerenderPaths`, read by Foldkit's plugin |
| Which route a page records | `SSR.entry` (`prerendered`) or `SSR.generate` |
| The URL the browser is at | the browser; the application learns it through `routing.onUrlChange` |

Foldkit's plugin prerenders through the server entry, `renderPage(new
Request(origin + path))`, so the entry cannot tell a build from a visitor.
A page it rendered recorded path and query, and a static host serving that
file for `/?q=acme` had it refused: the route check exists because the
runtime never reports the URL at boot, so a resumed page would show one
address and be at another.

Two halves:

1. **The entry records the path alone for the paths it is told are files.**
   `SSR.entry(..., { prerendered })`, validated as `SSR.generate` validates
   its paths. A request for one of them with no query is what a prerender
   sends, and what a live request for that file would show anyway, so
   recording the path alone for it is right whichever made it. A request
   with a query records it, as before. The module exports the same list as
   `prerenderPaths`, so the plugin and the entry read one list.
2. **A page recorded for its path, opened at a query, starts from the URL.**
   The Model was made without the query, and `init` does not run in the
   browser, so `SSR.hydrate` starts an application with `routing` from the
   resumed Model given `routing.onUrlChange(url)`, at boot (after any lazy
   bundle has loaded), ahead of typing kept by `KeepTyped`, and boots now
   whatever `start` says, since the page does not yet show its address. The
   first render then differs from the served page where the URL does, and
   Foldkit rebuilds that part, as a navigation would redraw it. It applies to
   `SSR.generate`'s pages too, which resumed at `?ref=mail` without the
   application ever seeing the query. Only the query counts: a trailing
   slash or `index.html` is the host's spelling of the same path.

   Rejected: queueing the Message, as typing is, so the first render adopts
   every node. Subscriptions start from the Model the runtime starts from,
   before any queued Message lands, and domains-plus's URL mirror then wrote
   the served address (`/`) over `/?q=acme`, whose own `ChangedUrl` emptied
   the search again: a Chromium probe of the built page ended at `/`.

A page refused only for its query now says how to keep it (`SSR.generate`, or
`prerendered`). Rejected: accepting a query the plan's state does not read.
The state names Model fields, not URL parameters, so nothing can say which
query the Model depends on; and an application that reads `?q=` wants it
read, not ignored.

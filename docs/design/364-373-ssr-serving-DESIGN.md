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

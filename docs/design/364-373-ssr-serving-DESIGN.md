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

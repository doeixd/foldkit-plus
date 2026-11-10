# SSR: a page's head in dynamic serving

Status: decided 2026-11-09; built 2026-11-10, then hardened after an
independent review: `SSR.headed` reads the block from the rendered root's
end alone, since a view can draw marker comments verbatim inside a
`<style>` and a document-wide search moved them. One check below is still
open: no e2e test in `examples/reference` reads a served description, and
no example uses `SSR.headed` yet.

## The problem

A resume plan's `meta` (description, Open Graph, Twitter card) belongs in the
served document's `<head>`. Link previews and crawlers read only the first
response and run no script. Static generation writes it there (`SSR.generate`
splices it in before `</head>`). Dynamic serving cannot.

In dynamic serving the host owns the template. `SSR.entry` answers a
`RenderedApplication`, and the host's document renderer passes it to Foldkit's
`injectIntoTemplate`, which writes only the fields `RenderedApplication` has:
`title`, `lang`, `dir`, `canonical` and `ogUrl`. There is no field for other
head markup, so `SSR.entry` refuses a plan with `meta` rather than drop it.

After hydration the client is fine: `metaEntry` (`shared.ts`) rewrites the
head's meta from the Model. Only the first response lacks it.

## Decision

Carry the markup in the rendered root, as `styles` already is, and give the
host a wrapper that moves it into the head on the server. Make a host that
forgets the wrapper fail loudly, not silently.

1. **`SSR.entry` takes a plan with `meta`.** It renders `metaMarkup(meta(model))`
   after a head marker as the root's last children, beside the styles marker
   (`withInRoot`). The view does not draw it, as with `styles`.
2. **`SSR.headed(render)`** wraps the host's document renderer
   (`(application, assets) => string`, what Foldkit's server entry exports as
   `renderDocument`). It renders the document, then moves everything after
   the head marker in the root to just before the document's `</head>`.
   - It composes with `SSR.keptDocuments`: `SSR.keptDocuments(SSR.headed(renderDocument))`.
     The kept document already holds the moved head.
   - A document with no `</head>` is refused, as `withHead` refuses one.
3. **A host that forgets the wrapper is told.** The markup then stays in the
   body: inert to a reader, but not in the head. `SSR.hydrate` looks for the
   head marker before adopting the page, removes what follows it, and reports
   `HeadNotMoved` through `Diagnostics` (naming `SSR.headed`). The client's
   `metaEntry` then writes the head as it does today. A test of the host's
   real entry (`e2e`) that reads the served HTML catches it before deploy.

## Why this shape

- **Nothing crosses requests.** The markup travels inside the request's own
  rendered page, not in a side table, so no other request can read it. A kept
  page carries the markup it was rendered with, which is right for that page.
- **No second way to do the same thing.** Static generation keeps `withHead`.
  The dynamic path differs only in who renders the document, and both write
  the same `metaMarkup`.
- **Escaping and deduplication are unchanged.** `metaMarkup` already escapes
  each value and marks its elements (`META_ATTRIBUTE`), and `metaEntry`
  replaces exactly those on the client. A template's own `<meta
  name="description">` beside the plan's would be duplicated, as on the static
  path today; the README says the template should not carry what the plan writes.

## Considered and rejected

- **A side table keyed by the `RenderedApplication`** (as `keptApplications`
  is), read by the wrapper. A host without the wrapper would drop the meta
  with nothing said, and the browser could never see it to report it.
- **Meta in the body only, for the client to move.** Crawlers read the first
  response's head.
- **Waiting for upstream.** The clean fix is head markup on a `Rendered`
  result that `injectIntoTemplate` places, with its parser checks: Proposal 2
  in `docs/upstream-foldkit-ssr.md`, not yet filed. It has no date, and the
  served-page gap costs every dynamic site its previews now. When it lands,
  `SSR.entry` uses it, and `SSR.headed` becomes a no-op kept for one release,
  then removed.

## Checks the build must have

- A dynamic page with `meta` serves it in the head through `SSR.headed`, with
  request-specific values (two requests, two descriptions) and none of one
  request's values in the other's document.
- `SSR.keptDocuments(SSR.headed(…))` serves a kept page's head from the cache.
- Without `SSR.headed`, the served body holds the marker, and `SSR.hydrate`
  reports `HeadNotMoved` and removes it; the head then has the meta from
  `metaEntry`.
- Hydration adopts the page: the moved markup is not in the root the view
  draws (no mismatch), with `styles` and `meta` together.
- A value with `"`, `<` and `&` is escaped.
- An e2e test in `examples/reference` reads a served page's description.

# `foldkit-ssr`

Server rendering for a Foldkit application: render once on the server, hand the
browser the part of the Model it owns, and hydrate without running `init` a
second time.

**Status: in development, not published.** Built in phases from
[the plan](../../docs/design/ssr-PLAN.md). Phases 0 and 1 are done; the browser
does not yet start from the handed-over Model. That is Phase 2.

## What it owns

Only the handover. Rendering to HTML and adopting it in the browser stay
Foldkit's own (`foldkit/experimental/server` and `foldkit/runtime`), and this
package does not wrap them. What it adds is a **resume plan**: which slice of
the Model crosses from the server to the browser, written into the page as a
JSON script and read back through the slice's own Schema.

Foldkit's own server rendering runs `init` on both sides and sends the Flags
that produced the page so the browser can. A resume plan sends the browser's
slice instead, and nothing else.

## A resume plan

```ts
import { Projection } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

// Which part of the Model the browser owns. The rest starts from the
// baseline, by default the application's initial Model.
const Editor = SSR.plan(App, {
  id: 'editor',
  state: Projection.pick(App.model.draft, App.model.count),
})

// On the server: the script to write into the page's template.
const script = SSR.envelope(Editor, model)

// In the browser: the Model to start from, or why the page cannot resume.
const resumed = SSR.resume(Editor, document)
```

`SSR.resume` returns a `Result`. It refuses, with a reason, a page with no
envelope or more than one (`Missing`, `Duplicate`), one that is not JSON
(`Unreadable`), one written by another protocol version or for another plan
(`Protocol`, `Plan`), and one whose state does not decode through the plan's
Schema (`Invalid`). A page is never half-restored.

The envelope escapes `<` as Foldkit escapes its Flags, so no string in the
Model can close the script or open another. It also escapes U+2028 and U+2029.

## What the tests prove

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

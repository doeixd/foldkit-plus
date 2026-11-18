# Traps: server rendering, hydration and head tags

Read before touching server rendering, hydration, Resume or the loader entry, head tags in the template, or a page cache.

- **A press on server-drawn markup before hydration is lost.** The auth
  e2e saw "Signed in as grace", which the server draws, pressed Sign out once,
  and the click did nothing while the entry still loaded (one run in six). Draw
  such controls with `Resume.builder`, `KeepTyped` on fields, and an entry that
  is `foldkit-ssr/loader`, which holds the press for `SSR.hydrate` (`examples/auth`).
- **Foldkit warns of a hydration mismatch only in development.** Its
  warning is gated on `import.meta.hot`, which a Vite build strips, so a
  production e2e that listens for "server DOM did not match" passes whatever
  happened. `examples/reference` rebuilt every served element on every
  hydration, and nothing said so. To check adoption, keep the served elements
  as the document turns interactive, before any module runs, and assert they
  are still in the document (`adoption` in `examples/reference/e2e`).
- **Caching a `Rendered` page saves little: the host parses it again.**
  Foldkit's `renderDocument` calls `injectIntoTemplate`, which parses the
  page with parse5 on every request; a kept domains-plus search still cost
  50 ms of 140 until the entry's `renderDocument` was wrapped in
  `SSR.keptDocuments` (0.8 ms). Measure the whole `handleRequest`, not
  `renderPage`. And two renders of one page differ by the time a read was
  stamped (`updatedAt` in the resumed Model), so a check comparing them
  must leave such times out.
- **Check whether a Foldkit builder reaches server markup; do not assume.**
  A Foldkit property marked client-only is left out of a server render, and a
  form tool reading the markup would miss it. `h.Name` was once believed to be
  one; in Foldkit 0.168 it writes through `setDataProp`, which unmarks it, and
  the serializer emits `name` (`datePickerView.ssr.test.ts` renders a hidden
  input to a string, parses it back, and goes red with the name dropped). A
  property a generic write sets (`Prop`, a custom element's) is still
  client-only. Test server output by rendering it to a string.
- **Foldkit fills head tags into the template; it adds none.** A view's
  `canonical` reached no generated page until the template had an empty
  `<link rel="canonical">` (and `og:url` a `<meta property="og:url">`) to fill.

# Traps: server rendering, hydration and head tags

Read before touching server rendering, hydration, Resume or the loader entry, head tags in the template, or a page cache.

- **Draw controls that must work before hydration with `Resume.builder`.**
  The auth e2e saw "Signed in as grace" (server-drawn), pressed Sign out once, and the click did nothing while the entry still loaded (one run in six). Use `Resume.builder`, `KeepTyped` on fields and an entry that is `foldkit-ssr/loader`, which holds the press for `SSR.hydrate` (`examples/auth`).
- **Check hydration adoption by keeping the served elements, not by the mismatch warning.**
  Foldkit warns of a mismatch only in development (gated on `import.meta.hot`, stripped by a build), so a production e2e listening for "server DOM did not match" passes whatever happened; `examples/reference` rebuilt every served element on every hydration unseen. Keep the served elements before any module runs and assert they are still in the document (`adoption` in `examples/reference/e2e`).
- **Test server output by rendering to a string and parsing it back.**
  A client-only property is left out of a server render; `h.Name` was believed to be one, but in Foldkit 0.168 it writes through `setDataProp` and the serializer emits `name` (`datePickerView.ssr.test.ts` goes red with the name dropped). A property a generic write sets (`Prop`, a custom element's) is still client-only.
- **Foldkit fills head tags into the template; it adds none.**
  A view's `canonical` reached no generated page until the template had an empty `<link rel="canonical">` (and `og:url` a `<meta property="og:url">`) to fill.
- **Caching a `Rendered` page saves little: wrap `renderDocument` in `SSR.keptDocuments`.**
  `renderDocument` runs `injectIntoTemplate`, which parses the page with parse5 every request; a kept domains-plus search still cost 50 ms of 140 until wrapped (0.8 ms). Measure the whole `handleRequest`, not `renderPage`; two renders of one page differ by a read's stamped time (`updatedAt` in the resumed Model), so leave times out of comparisons.
- **A page's own styles stay out of the browser's bundle when only the build imports them.**
  The blog's Slots draw into one static region, and their Styles are imported only by `content/library.ts`, so `Style.usedDrawn` writes their CSS into the page's head and the shell the browser loads holds none of it. Import such a Style from a view the client also draws and every page pays for it; measure with `scripts/bundle-report.mjs` (`bundle.test.ts`).

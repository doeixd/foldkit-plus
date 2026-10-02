# Server-Side Rendering

A counter whose count lives in a cookie. Every request is rendered on the
server from that cookie, so a reload shows the latest count before any script
runs; the browser then takes the page over without drawing it again, and each
click writes the cookie the next request reads. It ports Foldkit's
[ssr example](https://github.com/foldkit/foldkit/tree/main/examples/ssr) to
Foldkit Plus.

## Who owns what

The count is the application's, as in any Foldkit app. The cookie is the
browser's copy of it, written by a Command and read only by the server.
`foldkit-ssr` owns the handover: what the page carries from the server's
`init` to the browser, and the check that the browser can start from it.

```text
request   cookie ─▶ readCountCookie ─▶ Flags ─▶ init ─▶ Model ─┬─ view ─▶ HTML + the CSS it uses
                                                                └─ plan.state (the whole Model) ─▶ envelope
browser   envelope ─▶ Model ─▶ SSR.hydrate adopts the HTML ─▶ click ─▶ update ─▶ PersistCount ─▶ cookie
```

The Flags stay on the server: the browser never runs `init`, and starts from
the Model the page carries. Here that is every field, since the page shows all
three (the count, and when and where it was rendered). `SSR.render` renders the
view from the server's Model and from the browser's, and refuses a page where
the two differ, so a field the view reads but the plan leaves out is a `500`
on the server, never a page the browser silently redraws.

## Run it

`FOLDKIT_BUILD_ID` names the deployment being built and served: a commit or
release tag, public and unique per deployment. The `foldkit` Vite plugin
compiles it into both bundles, and `serve.ts` renders pages as it.

```bash
pnpm --filter foldkit-example-foldkit-ssr dev     # renders each request; Vite serves the modules
FOLDKIT_BUILD_ID=$(git rev-parse --short HEAD) pnpm --filter foldkit-example-foldkit-ssr build   # vite build, into dist/
FOLDKIT_BUILD_ID=$(git rev-parse --short HEAD) pnpm --filter foldkit-example-foldkit-ssr start   # renders each request; serves dist/
```

`dev` is Vite on its own port; `start` listens on `PORT` (3000) and takes
`ORIGIN` (default `http://localhost:<port>`) as the origin it serves.

| Concern | Owner | Where |
| --- | --- | --- |
| The count, the Messages, `update`, the cookie write (`PersistCount`) | plain Foldkit | `src/main.ts` |
| Reading the cookie (parsed, decoded to a safe integer, else 0) | plain Effect (`Cookies.parseHeader`), as upstream | `src/cookie.ts` |
| What crosses to the browser (the Model, not the Flags) | `foldkit-ssr` (`SSR.plan`, over a `foldkit-surface` Projection) | `src/main.ts`, `// SSR` |
| Rendering a request: `GET`/`HEAD` render, `OPTIONS` `204`, other methods `405`, a refused render `500` | `foldkit-ssr` (`SSR.entry`) inside Foldkit's `handleRequest` | `src/renderPage.ts`, served by `src/entry.server.ts` in development and `src/host.ts` in production |
| The no-cache headers, on every answer, where a CORS policy would go too | the application, through `SSR.entry`'s `headers` | `src/renderPage.ts` |
| Taking the page over without rerunning `init` | `foldkit-ssr` (`SSR.hydrate`) | `src/entry.ts` |
| The build id both sides compare | the deployment, compiled into both bundles | `FOLDKIT_BUILD_ID`, read as `import.meta.env.FOLDKIT_BUILD_ID` in `src/entry.server.ts` and `src/entry.ts` |
| Static files, the request target, host-refused methods | the host, on Effect's HTTP server and `@effect/platform-node` as upstream's (`HttpStaticServer`; Foldkit's `resolveRequestUrl`, `resolvesToIndexHtml`, `isHostSettledMethod`) | `src/host.ts`, run by `src/serve.ts` |
| The accessible buttons | `@foldkit/ui` Button, styled through `foldkit-mixins-ui` | `src/main.ts`, `src/style.ts` |
| Appearance, and the CSS in each page's first paint | `foldkit-mixins` (`AppStyle`; `Style.usedIn` for the page's classes; `Style.install`, which keeps the copy a served page carries) | `src/style.ts`, `styles` in `src/renderPage.ts`, `src/entry.ts` |

`foldkit-surface` appears only to name the Model's fields for the plan
(`Surface.application(...).model`); no Surface is declared.

### What is not used, and why

- **Per-page head markup.** The host owns the template in dynamic serving, so
  a served page carries its styles in its root (`styles`) and no `meta`: the
  script installs the stylesheet on boot, while `meta` stays a static path
  (`SSR.generate`).
- **Resumable pages** (`Resume.builder`, `start: 'on-interaction'`). The two
  buttons could answer before the runtime boots, but only after a Surface
  listed their Messages, and the cookie write still waits for the runtime. The
  page is small and boots on load, as upstream's does; deferring the boot would
  add a Surface that nothing else uses, to save a boot nobody waits for.
- **`SSR.static`.** The one static paragraph is short; a static region saves
  nothing here.
- **Remote, Sync, Mirror, Agent, Bundle.** Nothing is fetched, synced or
  exposed. The cookie is not a `Mirror.kv`: it is read by the server, per
  request, before the browser has any state, which is the point of the example.

## Differences from upstream

- **The page carries the Model, not the Flags**, and the browser does not rerun
  `init`. What it shows is the same.
- **`POST`, `PUT`, `DELETE` and `PATCH` are answered `405`** (`SSR.entry`
  renders only `GET` and `HEAD`); upstream's entry renders the page for any
  method but `OPTIONS`.
- **The no-cache headers are on every answer from the entry**, the preflight,
  the `405` and a failed render's `500` included; upstream sets them on the
  rendered page. A missing asset's `404`, which Foldkit's `handleRequest`
  answers before the entry, has none.
- **The preflight's `allow` names what the page answers** (`GET, HEAD,
  OPTIONS`), where upstream's names every method a host passes on.
- **A page the server did not render is refused.** `entry.ts` throws, naming
  `pnpm dev`: without a render there is no Model to start from.
- **The browser imports `foldkit-ssr/client`,** which leaves Foldkit's server
  renderer and HTML parser out: 372 kB minified (124 kB gzip), against 575 kB
  (183 kB gzip) through `foldkit-ssr`'s main entry.
- **The hidden select renders its first option selected.** That is Foldkit
  0.163's server rendering of `h.Value('a')` over two options valued `a`; the
  browser, parsing the markup and hydrated, agrees with it, which is what the
  parse-equivalence section exists to check.
- The look is approximated with `foldkit-mixins` and a colorless theme, not
  Tailwind.

## Tests

From the repository root: `npx vitest run examples/foldkit/ssr`.

- `test/scene.test.ts`: upstream's test, unchanged but for the import path.
- `test/cookie.test.ts`: the cookie header, well-formed and not, read as a count.
- `test/server.test.ts`: `entry.server.ts` answering requests in process, the
  page parsed back with `DOMParser`: the count from the cookie, the title, the
  provenance line, the envelope (the Model, no Flags script), the markup a
  parser builds from it, the build id, the styles in the rendered root and
  none in the head, the headers, the preflight, `HEAD`, and the refused methods.
- `test/runtime.test.ts`: the real `entry.ts` in jsdom over a rendered page:
  adopted in place, counts, writes the cookie the next request renders from;
  refuses a page from another build and a page the server did not render.
- `test/host.test.ts`: the host over a built `dist/` on a free
  port: pages for `/` and `/index.html`, files, a missing asset's `404`,
  nothing served from outside `dist/`, an off-origin target's `400`, `TRACE`'s
  `405`, and a preflight handed to the entry.
- `test/view.test.ts`: the page drawn inert, each element through a Slot, and
  every token the drawn styles read defined in the stylesheet.

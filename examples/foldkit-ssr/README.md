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

```bash
pnpm --filter foldkit-example-foldkit-ssr dev     # renders each request; Vite serves the modules
pnpm --filter foldkit-example-foldkit-ssr build   # vite build, into dist/
pnpm --filter foldkit-example-foldkit-ssr start   # renders each request; serves dist/
```

Both servers listen on `PORT` (3000) and take `ORIGIN` (default
`http://localhost:<port>`) as the origin they serve.

| Concern | Owner | Where |
| --- | --- | --- |
| The count, the Messages, `update`, the cookie write (`PersistCount`) | plain Foldkit | `src/main.ts` |
| Reading the cookie (parsed, decoded to a safe integer, else 0) | plain Effect (`Cookies.parseHeader`), as upstream | `src/cookie.ts` |
| What crosses to the browser (the Model, not the Flags) | `foldkit-ssr` (`SSR.plan`, over a `foldkit-surface` Projection) | `src/main.ts`, `// SSR` |
| Rendering a request: `GET`/`HEAD` render, other methods `405`, a refused render `500` | `foldkit-ssr` (`SSR.entry`) inside Foldkit's `handleRequest` | `src/entry.server.ts` |
| The preflight answer and the no-cache headers | the application's entry, as upstream | `src/entry.server.ts` |
| Taking the page over without rerunning `init` | `foldkit-ssr` (`SSR.hydrate`) | `src/entry.ts` |
| The build id both sides compare | the entry script's address | `buildIdOf` in `src/entry.server.ts`, `import.meta.url` in `src/entry.ts` |
| Static files, the request target, host-refused methods | the `node:http` host (Foldkit's `resolveRequestUrl`, `resolvesToIndexHtml`, `isHostSettledMethod`) | `src/host.ts`, run by `src/serve.ts` |
| The accessible buttons | `@foldkit/ui` Button, styled through `foldkit-mixins-ui` | `src/main.ts`, `src/style.ts` |
| Appearance, and the CSS in each page's head | `foldkit-mixins` (`Style.usedIn` for the page's classes) | `src/style.ts`, `head` in `src/entry.server.ts` |

`foldkit-surface` appears only to name the Model's fields for the plan
(`Surface.application(...).model`); no Surface is declared.

### What is not used, and why

- **`@effect/platform-node`**, which upstream serves with, is not usable here
  (only a build for another Effect release is installed). `src/host.ts` is the
  same host on `node:http`: it resolves the target against the origin first,
  answers files, and hands the rest to the page handler.
- **`@foldkit/vite-plugin`** renders upstream's requests in development and
  builds its server bundle; it is not installed. In development `src/host.ts`
  runs Vite in middleware mode for the modules and renders each page itself;
  in production it serves `vite build`'s `dist/`. The server's code runs under
  tsx in both, unbundled.
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
- **The no-cache headers are on every answer from the entry**, the `405` and a
  failed render's `500` included; upstream sets them on the rendered page.
- **A page the server did not render is refused.** `entry.ts` throws, naming
  `pnpm dev`: without a render there is no Model to start from. Upstream never
  meets such a page, since its Vite plugin renders every request; running
  plain `vite` here shows the error.
- **The browser bundle carries Foldkit's server renderer.** `foldkit-ssr` has
  one entry, so `SSR.hydrate` brings `SSR.render` and the HTML parser along:
  575 kB minified (183 kB gzip), as in `foldkit-ssg`.
- **Server code is not reloaded in development.** An edit to it needs a
  restart of `pnpm dev`; the browser's modules reload through Vite.
- **The hidden select renders its first option selected.** That is Foldkit
  0.163's server rendering of `h.Value('a')` over two options valued `a`; the
  browser, parsing the markup and hydrated, agrees with it, which is what the
  parse-equivalence section exists to check.
- The look is approximated with `foldkit-mixins` and a colorless theme, not
  Tailwind.

## Tests

From the repository root: `npx vitest run examples/foldkit-ssr`.

- `test/scene.test.ts`: upstream's test, unchanged but for the import path.
- `test/cookie.test.ts`: the cookie header, well-formed and not, read as a count.
- `test/server.test.ts`: `entry.server.ts` answering requests in process, the
  page parsed back with `DOMParser`: the count from the cookie, the title, the
  provenance line, the envelope (the Model, no Flags script), the markup a
  parser builds from it, the build id, every class and token styled from its
  own head, the headers, the preflight, `HEAD`, and the refused methods.
- `test/runtime.test.ts`: the real `entry.ts` in jsdom over a rendered page:
  adopted in place, counts, writes the cookie the next request renders from;
  refuses a page from another build and a page the server did not render.
- `test/host.test.ts`: the `node:http` host over a built `dist/` on a free
  port: pages for `/` and `/index.html`, files, a missing asset's `404`,
  nothing served from outside `dist/`, an off-origin target's `400`, `TRACE`'s
  `405`, and a preflight handed to the entry.
- `test/view.test.ts`: the page drawn inert, each element through a Slot, and
  every token the drawn styles read defined in the stylesheet.

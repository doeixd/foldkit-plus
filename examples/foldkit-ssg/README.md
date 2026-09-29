# Static Site Generation

Two pages, Home and About, rendered to HTML at build time and taken over in
the browser without being drawn again. Home has a counter to prove the page is
live once it has been taken over; any other address is a Not found page. It
ports Foldkit's
[ssg example](https://github.com/foldkit/foldkit/tree/main/examples/ssg) to
Foldkit Plus.

## Who owns what

The Model is the application's, as in any Foldkit app. What `foldkit-ssr` adds
is the handover: which slice of the Model the build writes into each page, and
the check that the browser can start from it.

```text
build    prerenderPaths ─▶ init(url) ─▶ Model ─┬─ view ─▶ HTML + the CSS it uses   (index.html, about/index.html)
                                               └─ plan.state (the route) ─▶ envelope
browser  envelope ─▶ { ...initial, route } ─▶ SSR.hydrate adopts the HTML ─▶ update, as usual
```

The browser never runs `init`. It starts from the plan's `initial` with the
route the page carries, so the count starts at 0, as `init` starts it. The
build renders each page from both Models and refuses one where they draw
differently, so a later `init` that sets something the browser cannot know
fails the build instead of the page.

## Run it

`FOLDKIT_BUILD_ID` names the deployment being built: a commit or release tag,
public and unique per deployment. The `foldkit` Vite plugin compiles it into
both bundles, and `prerender.ts` writes it into the pages, so the browser
adopts them instead of refusing them.

```bash
FOLDKIT_BUILD_ID=$(git rev-parse --short HEAD) pnpm --filter foldkit-example-foldkit-ssg build
pnpm --filter foldkit-example-foldkit-ssg dev      # renders each request, like the build
pnpm --filter foldkit-example-foldkit-ssg preview  # serves dist/ as a static host
```

| Concern | Owner | Where |
| --- | --- | --- |
| The route union, parsing, the Not found fallback | plain Foldkit (`foldkit/route`) | `src/route.ts` |
| The count, links, `update` | plain Foldkit | `src/main.ts` |
| What crosses to the browser (the route) | `foldkit-ssr` (`SSR.plan`, over a `foldkit-surface` Projection) | `src/main.ts`, `// SSR` |
| Rendering each path to a file in the built `index.html` | `foldkit-ssr` (`SSR.generate`) | `src/prerender.ts`, over the paths `src/main.ts` names |
| Serving each request in development | Foldkit's pipeline (`foldkit({ ssr })`) | `src/entry.server.ts`, `vite.config.ts` |
| Taking the page over, and drawing afresh where nothing was rendered | `foldkit-ssr` (`SSR.hydrate`) | `src/entry.ts` |
| The build id both sides compare | the deployment, compiled into both bundles | `FOLDKIT_BUILD_ID`, read as `import.meta.env.FOLDKIT_BUILD_ID` in `src/entry.server.ts` and `src/entry.ts` |
| Appearance, and the CSS in each page's head | `foldkit-mixins` (`AppStyle`; `Style.usedIn` for the page's classes; `Style.install`, which keeps the copy a generated page carries) | `src/style.ts`, `head` in `src/prerender.ts`, `src/entry.ts` |

`foldkit-surface` appears only to name the route field for the plan
(`Surface.application(...).model.route`); no Surface is declared.

### What is not used, and why

- **Foldkit's built-in prerender.** `SSR.generate` renders the same paths from
  a script run after `vite build`. The built-in prerender records the full
  route, while a generated file serves every query; the envelope records the
  path alone so `/about?ref=mail` resumes the page generated for `/about` (see
  the `foldkit-ssr` README, "At build time"). Each path is also named by
  `prerenderPaths`, which the server entry exports for the pipeline.
- **Resumable pages** (`Resume.builder`, `start: 'on-interaction'`). The
  counter could answer before the runtime boots, but that needs a Surface
  listing `ClickedIncrement` and a deferred boot upstream does not have. The
  page boots on load, as upstream's does.
- **`SSR.static`.** The page text is short and the whole view is the browser's
  anyway; a static region would save nothing here.
- **Remote, Sync, Mirror, Agent, Bundle, `@foldkit/ui`.** Nothing is fetched,
  stored, replicated or exposed, and upstream's button is a plain `<button>`.

## Differences from upstream

- **An address with no generated page is a 404 on a static host**, as in
  `pnpm preview`. A host that answers every address with `index.html` would
  hand the browser the Home page at `/missing`, which `SSR.hydrate` refuses
  (the route differs) and contains, where upstream's `Runtime.hydrate` reruns
  `init` for the address. The dev server still shows Not found.
- **The browser bundle is a little larger.** `src/entry.ts` imports
  `foldkit-ssr/client`, which leaves Foldkit's server renderer out: 389 kB
  minified (125 kB gzip) against 343 kB (114 kB gzip) for the same app on
  `Runtime.run`, and 574 kB (183 kB gzip) through `foldkit-ssr`'s main entry.
- **The About page says "The same generatePages call produced this route"**,
  where upstream names its `renderPage` function, which serves requests here
  rather than generating files.
- **A `ChangedUrl` for the page already shown returns the same Model**
  (clicking Home on Home), where upstream writes the same route again. Nothing
  visible changes.
- `pnpm preview` serves `/about` from `about/index.html` (a small preview
  middleware in `vite.config.ts`); Vite would otherwise answer it with the Home
  page.
- The look is approximated with `foldkit-mixins` and a colorless theme, not
  Tailwind.

## Tests

From the repository root: `npx vitest run examples/foldkit-ssg`. Upstream has
no tests.

- `test/prerender.test.ts`: the generated pages parsed back with `DOMParser`:
  one file per path, the title, heading and route each carries, the root's
  markup unchanged by the parser, the build id both sides were compiled as,
  and every class and token the page draws styled from its own head.
- `test/runtime.test.ts`: the real `entry.ts` in jsdom, over a generated page
  (adopted in place, counts, navigates, one stylesheet), over a page from
  another build (refused), and over a page with no server render (drawn,
  including Not found).
- `test/main.test.ts`: `init` per address, the routers, and `update`.
- `test/view.test.ts`: every page drawn inert, each element through a Slot,
  and every token the drawn styles read defined in the stylesheet.

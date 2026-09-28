# Routing

A small site with a page per route: Home, a People list with a search kept in
the query string, a page per person, a file browser whose every path under
`/files` is one route, a deeply nested route, and a 404. Links, back and
forward, and the `G H` / `G P` / `G F` / `G N` shortcuts all go through the
URL. It ports Foldkit's
[routing example](https://github.com/foldkit/foldkit/tree/main/examples/routing)
to Foldkit Plus.

## Who owns what

The URL owns where the reader is; the Model holds the parsed route and the
People page's own state. Routing is Foldkit's, and stays Foldkit's:

```text
link / back / G P -> URL -> ChangedUrl -> urlToAppRoute (parser combinators) -> Model.route -> view
                                      \-> People.informRouteChanged -> FetchPeople -> People Submodel
```

Every `ChangedUrl` to a People route searches again, as upstream's does, even
for the route already shown: submitting the same search, or clicking People on
`/people`, reruns it and resets the input to the route's text.

## Run it

```bash
pnpm --filter foldkit-example-foldkit-routing dev
```

| Concern | Owner | Where |
| --- | --- | --- |
| Parsing and printing URLs, the route union, the 404 fallback | plain Foldkit (`foldkit/route`) | `src/route.ts` |
| Links, back and forward, the key bindings | plain Foldkit (`routing`, `Subscription.keyBindings`) | `src/main.ts`, `src/entry.ts` |
| The People page: search input, history, results | a hand-wired Foldkit Submodel | `src/page/people.ts` |
| The file tree | a constant | `src/fileTree.ts` |
| The page title per route | the view's `Document.title` | `src/main.ts`, `routeTitle` |
| The search input and button | `@foldkit/ui`, styled through `foldkit-mixins-ui` | `src/page/people.ts` |
| Appearance: theme, layout, every page's Slots | `foldkit-mixins` | `src/style.ts` |

### What is not used, and why

- **`foldkit-surface`.** A Surface per route would be read by nothing: no
  Remote, Agent, Sync or Mirror consumes a projection here, and a Surface with
  no consumer is ceremony. `Surface.when` would record which route activates
  which page, but only Remote and SSR read that.
- **`foldkit-bundle` for the People page.** The page is placed once, and its
  `init` depends on the starting URL (`/people?searchText=ali` starts with
  `ali` searched). A Bundle's `init` takes fixed `args` given at placement, so
  the route would have to arrive after `init`, with a second fetch. The Bundle
  README itself says a one-off child is fine hand-wired; Foldkit's
  `Update.foldChild` and `h.submodel` are used as upstream uses them.
- **`foldkit-metadata`.** It is for package authors attaching facts to
  another package's declarations. A page title is the view's `title`.
- **`foldkit-mirror`.** The search text is in the URL because it is part of
  the route; the People page derives its state from the route, it does not own
  a value the URL copies.

## Differences from upstream

- **The nav link of the current section carries `aria-current="page"`**, which
  is what styles it, in place of upstream's conditional class.
- **Home drops an empty `<p>`** upstream draws after its text.
- Titles are one exhaustive `AppRoute.match`, and the active nav section one
  `AppRoute.match` to an `Option`, in place of `_tag` comparisons and an
  `orElse` that printed the tag; the strings are upstream's.
- The look is approximated with a `Theme.oklch` blue palette, not Tailwind.

## Tests

From the repository root: `npx vitest run examples/foldkit-routing`.

- `test/story.test.ts`, `test/scene.test.ts` and `test/page/*` are upstream's
  tests, unchanged but for the import paths.
- `test/route.test.ts`: a table of URLs to routes and titles, each router's
  printed URL, and that a `ChangedUrl` for the People route already shown
  resets the input and searches again.
- `test/view.test.ts`: every page drawn inert, each element through a Slot,
  every token the drawn styles read in the stylesheet, and the current nav link.
- `test/runtime.test.ts`: the real runtime in jsdom: links, back and forward,
  the search in the URL, the same search resubmitted, People clicked on
  `/people`, and the key bindings.

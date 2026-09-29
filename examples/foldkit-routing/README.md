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
People page's own state. Routing is Foldkit's, and stays Foldkit's; the People
page is a Bundle placed once, with its starting search derived from the route:

```text
start -> init(url) -> assembly.initial({ route }) -> People Bundle, args from the route
link / back / G P -> URL -> ChangedUrl -> urlToAppRoute (parser combinators) -> Model.route -> view
                                      \-> GotPeopleMessage(ChangedRoute) -> FetchPeople -> People Bundle
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
| The People page: search input, history, results | a `foldkit-bundle` Bundle placed once, with `args` derived from the starting route | `src/page/people.ts`, `src/main.ts` |
| The file tree | a constant | `src/fileTree.ts` |
| The page title per route | the view's `Document.title` | `src/main.ts`, `routeTitle` |
| The search input and button | `@foldkit/ui`, styled through `foldkit-mixins-ui` (`Input.toView`, `Button.toView`) | `src/page/people.ts` |
| Appearance: theme, layout, every page's Slots (declared by their style with `AppStyle`'s `slots`) | `foldkit-mixins` (`AppStyle`, `Layout`, `Utilities`) | `src/style.ts`, installed by `src/entry.ts` with `Style.install` |

### What is not used, and why

- **`foldkit-surface`.** A Surface per route would be read by nothing: no
  Remote, Agent, Sync or Mirror consumes a projection here, and a Surface with
  no consumer is ceremony. `Surface.when` would record which route activates
  which page, but only Remote and SSR read that.
- **`foldkit-bundle` for anything but the People page.** The page is placed
  once, with `args` derived from the starting route (`/people?searchText=ali`
  starts with `ali` searched): the placement's factory reads the seed
  `assembly.initial({ route })` was given, so there is no second fetch and no
  post-init Message. Route changes after startup still arrive as Messages:
  the parent's `ChangedUrl` arm folds `GotPeopleMessage(ChangedRoute)` through
  the same placement. The view renders the placement in its long-standing
  `people` slot.
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
- `test/view.test.ts`: every page drawn inert (People through its
  `h.submodel`), each element through a Slot,
  every token the drawn styles read in the stylesheet, and the current nav link.
- `test/runtime.test.ts`: the real runtime in jsdom: links, back and forward,
  the search in the URL, the same search resubmitted, People clicked on
  `/people`, and the key bindings.

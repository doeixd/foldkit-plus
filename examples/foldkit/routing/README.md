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
People page's own state. The route *topology* — nodes, titles, sections,
history intent — is a `foldkit-site` Site over the Foldkit routers; the
People page is a Bundle placed once through it, with its starting search
derived from the route:

```text
start -> init(url) -> assembly.initial({ route }) -> People Bundle, args from the route
link -> ClickedLink -> Site.routing -> Site.Navigate (push/replace) or Site.Load
back / G P -> URL -> ChangedUrl -> Site.routing: set Model.route, inform the People page
                                       \-> GotPeopleMessage(ChangedRoute) -> FetchPeople -> People Bundle
submit -> search at once (Loading + fetch) + push the URL; the echo only syncs the address
```

A `ChangedUrl` for the address already shown touches nothing: unsubmitted
text stays, and nothing refetches. Re-searching is the submit's own job —
`SubmittedSearch` searches directly instead of waiting for its own URL echo,
which keeps submit-same-search refreshing while echoes stay cheap.

## Run it

```bash
pnpm --filter foldkit-example-foldkit-routing dev
```

| Concern | Owner | Where |
| --- | --- | --- |
| Parsing and printing URLs, the route union, the 404 fallback | plain Foldkit (`foldkit/route`) | `src/route.ts` |
| Route nodes, titles, sections, landings, shortcuts, history intent, and the click/change lifecycle | `foldkit-site` (`Site.route`/`make`/`placement`/`routing`) | `src/main.ts` |
| Links, back and forward, the key bindings (derived from the annotated shortcuts) | plain Foldkit (`routing`, `Subscription.keyBindings`) | `src/main.ts`, `src/entry.ts` |
| The People page: search input, history, results | a `foldkit-bundle` Bundle placed once through the Site, with `args` derived from the starting route | `src/page/people.ts`, `src/main.ts` |
| The file tree | a constant | `src/fileTree.ts` |
| The page title per route | the Site's annotated titles, read with `Site.titleOf` | `src/main.ts`, `routeTitle` |
| The search input and button | `@foldkit/ui`, styled through `foldkit-mixins-ui` (`Input.toView`, `Button.toView`) | `src/page/people.ts` |
| Appearance: theme, layout, every page's Slots (declared by their style with `AppStyle`'s `slots`) | `foldkit-mixins` (`AppStyle`, `Layout`, `Utilities`) | `src/style.ts`, installed by `src/entry.ts` with `Style.install` |

### What is not used, and why

- **`foldkit-surface`.** A Surface per route would be read by nothing: no
  Remote, Agent, Sync or Mirror consumes a projection here, and a Surface with
  no consumer is ceremony. `Surface.when` would record which route activates
  which page, but only Remote and SSR read that.
- **`foldkit-bundle` for anything but the People page.** The page is placed
  once through `Site.placement`, with `args` derived from the starting route
  (`/people?searchText=ali` starts with `ali` searched): the placement's
  factory reads the seed `assembly.initial({ route })` was given, so there is
  no second fetch and no post-init Message. Route changes after startup
  inform the page through `changed`, and the view renders `placed.view` —
  one declaration drives the fold and the drawing.
- **`foldkit-metadata`.** It is for package authors attaching facts to
  another package's declarations. A page title is the view's `title`.
- **`foldkit-mirror`.** The search text is in the URL because it is part of
  the route; the People page derives its state from the route, it does not own
  a value the URL copies.

## Differences from upstream

- **The nav link of the current section carries `aria-current="page"`**, which
  is what styles it, in place of upstream's conditional class.
- **Home drops an empty `<p>`** upstream draws after its text.
- Titles and the active nav section are read off the Site
  (`Site.titleOf`, `Site.sectionOf`), in place of two `AppRoute.match`
  tables; the strings are upstream's.
- The look is approximated with a `Theme.oklch` blue palette, not Tailwind.

## Tests

From the repository root: `npx vitest run examples/foldkit/routing`.

- `test/story.test.ts`, `test/scene.test.ts` and `test/page/*` are upstream's
  tests, unchanged but for the import paths.
- `test/route.test.ts`: a table of URLs to routes and titles, each router's
  printed URL, and that a `ChangedUrl` for the address already shown touches
  nothing (the input stays, nothing refetches).
- `test/view.test.ts`: every page drawn inert (People through its
  `h.submodel`), each element through a Slot,
  every token the drawn styles read in the stylesheet, and the current nav link.
- `test/runtime.test.ts`: the real runtime in jsdom: links, back and forward,
  the search in the URL, the same search resubmitted, People clicked on
  `/people`, and the key bindings.

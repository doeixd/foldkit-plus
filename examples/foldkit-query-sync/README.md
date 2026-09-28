# Query Sync

A dinosaur table you can search, filter by diet and period, and sort by any
column, with every one of those choices kept in the URL: copy the address and
the same view opens, and back and forward work. It ports Foldkit's
[query-sync example](https://github.com/foldkit/foldkit/tree/main/examples/query-sync)
to Foldkit Plus.

## Who owns the filters

Upstream keeps the filters in the route: a control writes the URL, and the
Model follows the URL. Here the **Model owns them** and the URL is a copy
that `foldkit-mirror` keeps in step:

```text
control -> Message -> update (modifyFields) -> Model -> Filters subscription -> ?search=…&sorting=…
URL (load, back/forward) -> ChangedUrl -> Filters.reduce -> route -> Model
```

`Mirror.routing` joins the two to Foldkit's `makeApplication`: it takes this
application's `init`, `update` and routing, and gives back the same three with
`Filters` reading the starting URL and every `ChangedUrl`, before the
application routes the path. `src/entry.ts` spreads the result into the
runtime config.

A filter at its initial value is left out of the URL, so the bare page is `/`.
A value the page cannot read (`?diet=Dragon`, `?sorting=Length`) is read as
no filter, and the next write drops it from the address. Every key replaces
the current history entry, as upstream's `replaceUrl` did, so typing a search
does not fill the history.

## Run it

```bash
pnpm --filter foldkit-example-foldkit-query-sync dev
```

From the repository root, `npx vitest run examples/foldkit-query-sync` runs the
tests and `npx tsc -b examples/foldkit-query-sync` type-checks them.

## What owns what

| Concern | Owner | Where |
| --- | --- | --- |
| Search, sorting, diet, period | the Model; `foldkit-mirror`'s `Mirror.url` keeps them in the query string | `src/main.ts`, `// MIRROR` |
| Field references the mirror is declared over | `foldkit-surface` (`Surface.application`) | `src/main.ts`, `// MIRROR` |
| The route (`/` or a 404) | plain Foldkit routing, path only | `src/main.ts`, `// ROUTE` |
| Reading the URL into both at start and on navigation | `Mirror.routing` over the application's own `init`, `update`, routing | `src/main.ts`, `// ROUTING` |
| Link clicks, the two listboxes, filtering and sorting the rows | plain Foldkit and `@foldkit/ui` | `src/main.ts` |
| Appearance: theme, layout, the page's Slots | `foldkit-mixins` | `src/style.ts` |
| Styling `@foldkit/ui` Button and Input | `foldkit-mixins-ui` (`Button.resolve`, `Input.resolve`) | `src/main.ts`, `src/style.ts` |

The rows are a pure function of a fixed array and the four filters, so there
is nothing for `foldkit-entity` or `foldkit-crud` to own. `foldkit-mixins-ui`
has no Listbox adapter; the listboxes take the page's own Slots through
`childAttributes`, and their options are styled from the container's Slot.

## Files

| File | What it holds |
| --- | --- |
| `src/main.ts` | Model, Message, the mirror, init, update, their routing, subscriptions, and the view |
| `src/style.ts` | The theme, the Slots and their Styles, and the stylesheet |
| `src/entry.ts` | Injects the stylesheet and runs the application |
| `src/data.ts` | The dinosaurs, as upstream |
| `test/story.test.ts` | `update`: reading the URL, sorting, the listboxes |
| `test/scene.test.ts` | The view: search, filters, sort headers, the empty state, the 404 |
| `test/mirror.test.ts` | The URL format, the round trip from link to Model, and history replacement |

# Foldkit's own examples, on Foldkit Plus

Every folder here is a port of an example from the
[Foldkit repository](https://github.com/foldkit/foldkit/tree/main/examples): the
same application, the same features, file split and tests, with a
[Foldkit Plus](https://github.com/doeixd/foldkit-plus) package taking over the
concern it owns. `foldkit/counter` is upstream's
[`examples/counter`](https://github.com/foldkit/foldkit/tree/main/examples/counter),
`foldkit/form` is upstream's `examples/form`, and so on; the folder names match
upstream's.

They exist to answer one question at a time: **how do I use Foldkit Plus for
this?** Each folder's README says which Plus package owns what there, what it
deliberately does **not** use and why, and where the behaviour differs from
upstream. A port uses a Plus package only where that package owns a concern;
where nothing in Plus owns it, the port keeps upstream's code unchanged. Every
view draws through `foldkit-mixins` Slots instead of Tailwind classes.

## The ports

| Port | Upstream | What Foldkit Plus owns there |
| --- | --- | --- |
| [`counter`](./counter) | [`examples/counter`](https://github.com/foldkit/foldkit/tree/main/examples/counter) | Styling only; a counter has nothing else for Plus to own |
| [`todo`](./todo) | [`examples/todo`](https://github.com/foldkit/foldkit/tree/main/examples/todo) | `foldkit-mirror` keeps the list in storage |
| [`form`](./form) | [`examples/form`](https://github.com/foldkit/foldkit/tree/main/examples/form) | `foldkit-form`: fields, rules, the debounced email check, submission |
| [`job-application`](./job-application) | [`examples/job-application`](https://github.com/foldkit/foldkit/tree/main/examples/job-application) | `foldkit-form` for every validated field across six steps |
| [`weather`](./weather) | [`examples/weather`](https://github.com/foldkit/foldkit/tree/main/examples/weather) | Styling only; a one-shot search is not Remote's cached server data |
| [`api-cache`](./api-cache) | [`examples/api-cache`](https://github.com/foldkit/foldkit/tree/main/examples/api-cache) | `foldkit-remote`: the cache, dedupe, stale-while-revalidate and refresh |
| [`routing`](./routing) | [`examples/routing`](https://github.com/foldkit/foldkit/tree/main/examples/routing) | Styling only; routing is Foldkit's |
| [`route-transitions`](./route-transitions) | [`examples/route-transitions`](https://github.com/foldkit/foldkit/tree/main/examples/route-transitions) | Styling only; the transition policies are Foldkit's route `Transition` |
| [`query-sync`](./query-sync) | [`examples/query-sync`](https://github.com/foldkit/foldkit/tree/main/examples/query-sync) | `foldkit-mirror` keeps the filters in the query string |
| [`snake`](./snake) | [`examples/snake`](https://github.com/foldkit/foldkit/tree/main/examples/snake) | Lazy rows, so a tick redraws one row of the board |
| [`auth`](./auth) | [`examples/auth`](https://github.com/foldkit/foldkit/tree/main/examples/auth) | `foldkit-form` for the login form |
| [`shopping-cart`](./shopping-cart) | [`examples/shopping-cart`](https://github.com/foldkit/foldkit/tree/main/examples/shopping-cart) | Styling only; the cart and its Submodel stay as upstream wires them |
| [`websocket-chat`](./websocket-chat) | [`examples/websocket-chat`](https://github.com/foldkit/foldkit/tree/main/examples/websocket-chat) | `foldkit-primitives`' websocket bundle owns the socket |
| [`kanban`](./kanban) | [`examples/kanban`](https://github.com/foldkit/foldkit/tree/main/examples/kanban) | `foldkit-mirror` keeps the board; dragging stays `@foldkit/ui`'s |
| [`pixel-art`](./pixel-art) | [`examples/pixel-art`](https://github.com/foldkit/foldkit/tree/main/examples/pixel-art) | `foldkit-primitives`' History for undo, `foldkit-mirror` for the canvas |
| [`ui-showcase`](./ui-showcase) | [`examples/ui-showcase`](https://github.com/foldkit/foldkit/tree/main/examples/ui-showcase) | `foldkit-mixins-ui`'s adapters and recipes for every component that has one |
| [`ssg`](./ssg) | [`examples/ssg`](https://github.com/foldkit/foldkit/tree/main/examples/ssg) | `foldkit-ssr` prerenders each page and adopts it in the browser |
| [`ssr`](./ssr) | [`examples/ssr`](https://github.com/foldkit/foldkit/tree/main/examples/ssr) | `foldkit-ssr` renders each request and adopts the page in the browser |

## Run one

Each is a private package named `foldkit-example-foldkit-<name>`, a browser
app:

```bash
pnpm --filter foldkit-example-foldkit-api-cache dev     # the app
npx vitest run examples/foldkit/api-cache               # its tests, from the root
npx tsc -b examples/foldkit/api-cache                   # its types
```

`ssg` needs a build id to build (`FOLDKIT_BUILD_ID=$(git rev-parse --short
HEAD) pnpm --filter foldkit-example-foldkit-ssg build`), and `ssr` takes one
for `start`; each README says why.

## Where to start

Read one that owns a concern you care about, side by side with its upstream
folder: [`api-cache`](./api-cache) for server data, [`form`](./form) or
[`job-application`](./job-application) for forms, [`kanban`](./kanban) or
[`pixel-art`](./pixel-art) for local state kept across reloads, [`ssr`](./ssr)
for rendering. `counter` and `weather` are the smallest; `ui-showcase` is the
styling reference. The applications in [`../`](../) — todo-app, cms, pages,
sync — show the same packages composed around an app of their own, rather than
around an upstream port.

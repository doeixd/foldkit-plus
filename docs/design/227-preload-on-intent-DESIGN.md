# Preload a link's page on intent (#227)

Part of #236 (Site as the data router). Field report: #231.

## The problem

Following a link to a page nobody has read yet draws "Loading…" first, though
the application already knows what that page reads: its node's Surface says
so, and `Site.sourcesFor` (or the application's own `actives`) turns that
into Sources. Remote already reads a destination ahead: `Data.preload(there,
active)` is `Data.satisfy` as a Command, whose reads land as one `Preloaded`
Message in the Model as it is by then.

What applications still write by hand is the step between a reader's intent
and that Command. The CMS site does it like this:

- a `pointing` subscription over `pointedLinks()` (`foldkit-primitives/dom`);
- a `PointedAtLink { url }` Message;
- an `update` branch: `Site.routeAt` for the address, a skip when it is the
  route shown, and `Data.preload({ ...model, route }, actives)`.

Chirp's field report went further by hand: a `preload: Option<AppRoute>`
Model field, an `IntendedLink` Message sent by `OnMouseEnter`, `OnFocus` and
`OnTouchStart` on every link, two extra `Surface.at` entries for
`model.preload`, and the field added to the SSR plan's `local`.

Both repeat what `Site.routing` already knows (which addresses the tree
holds, the route shown, how to set a route in a Model), and `pointedLinks`
counts every link a pointer crosses as intent: moving down a list of ten
links starts ten reads.

## Options

1. **A `Site.link(target, { preload }, h)` view helper and an "intended
   route" slot in the Model** (the issue's first suggestion). Each anchor
   carries its own hover, focus and touch handlers; `Site.routing` keeps the
   intended route in a Model field, and the target's Surfaces activate from
   it. Rejected:
   - the slot is a second owner of "where the reader is going", next to the
     route field, which SSR must then cover as `local`;
   - a Surface kept active by a hover keeps its live reads and subscriptions
     open for a page the reader may never open;
   - every link must be drawn through the helper, so a link in rendered
     Markdown or a third-party Slot is never preloaded;
   - it is a second way to do what `Data.preload` already does.
2. **The application keeps its subscription and Message, and only the update
   branch moves into `Site.routing`.** Smaller, but the subscription and the
   branch are two halves of one feature that an application can wire half
   of.
3. **`Site.routing` takes a `preload` option and owns the whole path:** the
   intent subscription, the Message's tag, the address check and the
   destination Model, handing the destination to the application's own
   `read` (its `Data.preload`). Chosen.

And for what counts as intent: improve `pointedLinks` in
`foldkit-primitives/dom`, which already listens on the document for every
same-origin link, rather than write a second listener in `foldkit-site`.
`foldkit-site` cannot import `foldkit-primitives` (whose peers include
`foldkit-mixins`), so the application passes the stream in.

## Ownership

```text
pointedLinks()      the DOM: which same-origin link the reader means to follow
Site.routing        the tree: is it one of ours, is it elsewhere, the Model there
Data.preload        Remote: what that Model reads that the store lacks
Preloaded           the one Message that writes what was read
```

No new Model field, no new store, no new Message of Remote's.

## The API

```ts
import { pointedLinks } from 'foldkit-primitives/dom'

const Message = defineMessageUnion({
  // ...
  PointedAtLink: { url: Url },
})

const Routing = Site.routing<Model, Message, Route, RemoteClient>({
  site: SiteMap,
  route: { dependency, get, set },
  parse: routeOf,
  tags: { clicked: 'UrlRequested', changed: 'UrlChanged' },
  completed: Message.Ticked,
  preload: {
    links: pointedLinks(),
    intended: Message.PointedAtLink,
    read: there => Data.preload(there, actives),
  },
})
```

- `links` is where intent comes from: a Stream of addresses. The wiring
  subscribes to it for the application's life (`site.intent`).
- `intended` is the application's Message constructor taking `{ url }`, as
  `completed` is. The wiring claims its tag (`handles`, `reduces`), so the
  application's `update` has no branch for it.
- `read` gets the Model as it would be at the destination: the current Model
  with the route field set (through the `RouteField`'s own `set`) to the
  route the tree reads at the address. It returns the Command that reads
  ahead, normally `Data.preload(there, actives)` over the same `actives`
  `Data.wiring` takes. The routing never returns that Model.

On an intended address, the wiring does nothing when the tree holds no node
for it (`Site.routeAt` is `None`: another document's page, or another
origin's) or when it is the route already shown. Otherwise it returns the
Model it was given, unchanged, with `read(there)` as its one Command.

A `preload` without a `Schema`-tagged constructor in `intended` throws at
`Site.routing`, as `completed` does.

## What counts as intent

`pointedLinks()` emits the address of a same-origin `a[href]`:

- **Hover** (`pointerover` from a mouse or pen): once the pointer has rested
  on the link for 50 ms. Leaving it before then (`pointerout` to anything
  outside the link) cancels.
- **Focus** (`focusin`, a keyboard reader tabbing): the same 50 ms, cancelled
  by `focusout`. Tabbing through a nav bar starts no reads until the reader
  stops on one.
- **Touch** (`pointerover` with `pointerType: 'touch'`, which the browser
  sends as a finger lands, before `pointerdown` and `click`): at once, since
  the tap that follows is the navigation itself, and a wait would spend the
  head start.

Crossing the elements inside one link (its text, an icon) is staying on it:
neither restarts the wait nor counts again. Coming back to a link after
leaving it counts again; `Data.preload` over a destination already in the
store asks the server nothing.

## Debouncing and cancelling

One listener on the document reads all four events, so they are read in the
order they happened (a focus moving between links sends its `focusout` and
`focusin` in one task, and a merge of four event streams read them the other
way round in a probe). It keeps the link the reader is on and one pending
timer: a new link replaces the timer, leaving clears it, and a finger offers
at once. That bounds a pointer sweeping a list to one read, for the link it
stops on. The stream's scope removes the listener and clears the timer.

A read that has started is not cancelled. It is speculative and cheap to let
finish: its answers arrive as one `Preloaded` Message and are kept like any
other read until retention next changes. Cancelling it would need Remote to
own a cancellable lane, which is a second runtime for a saving of one
response.

## What a preload may and may not do

- It writes the Model only through Remote's `Preloaded` Message, reduced by
  `Data.reduce` into the Model as it is when the answers land. The routing
  returns the very Model it was given (no render, no undo step).
- It never sets the route, pushes history, moves focus or informs a routed
  page: `arrived` and `pages` run on navigation only.
- It reads only: `read` is the application's, and `Data.preload` never
  mutates and never fails (a failed read is one the destination makes again).
- What it reads is kept until the next change of what is retained. When the
  reader follows the link, the destination's Surface roots it; when they go
  elsewhere, the next retention change drops it, after the wiring's `grace`.

## Deferred

- **`'visible'` preloading** through an `IntersectionObserver` (#236's open
  question). The same `links` slot takes such a stream when one exists.
- **A per-link opt-out** (`data-preload="none"`). No application has needed
  one; every same-origin link the tree holds is preloaded.
- **Skipping a destination the reader may not see** (`Site.accessOf` says
  `Denied`). The server guards the reads, so such a preload fails and is
  dropped; the routing does not know the reader to decide earlier.
- **A configurable wait.** 50 ms is fixed until an application needs another.
- **Per-node data policy** (#236's `data: { preload, retain, revalidate }`).
  This option is the preload half's mechanism; a node-level policy can
  compile to it later.

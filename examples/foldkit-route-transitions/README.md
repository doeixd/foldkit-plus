# Route Transitions

A small gallery app whose every navigation is described by Foldkit's
`Transition` helpers, with a live log beside the page narrating what each one
said: a cold load, entering and exiting a route, staying on the Painting route
with a new id, or staying within a route. Entering the Gallery loads the
catalog, entering or changing a painting loads it, and leaving the Studio saves
the draft once. It ports Foldkit's
[route-transitions example](https://github.com/foldkit/foldkit/tree/main/examples/route-transitions)
to Foldkit Plus.

## Who owns what

The URL owns where the reader is. The Model holds the parsed route, the log,
and what each route loaded. Every policy is a small step over one
`Transition`, and `init` and `ChangedUrl` share them:

```text
init(url)        -> Transition.coldLoad(route) ----------\
ChangedUrl(url)  -> Transition.make(model.route, route) --+-> handleTransition
                                                             |- logTransition           (always)
                                                             |- entered Gallery  -> LoadCatalog
                                                             |- entered Painting -> LoadPainting
                                                             |- stayed on Painting, new id -> LoadPainting
                                                             '- exited Studio    -> SaveDraft
```

## Run it

```bash
pnpm --filter foldkit-example-foldkit-route-transitions dev
```

| Concern | Owner | Where |
| --- | --- | --- |
| Parsing and printing URLs, the route union, the 404 fallback | plain Foldkit (`foldkit/route`) | `src/route.ts` |
| Entry, exit and stayed policies | plain Foldkit (`foldkit/route` `Transition`) and `Update.combine` | `src/main.ts`, `handleTransition` |
| The transition log | the application's Model | `src/main.ts`, `logTransition` |
| The simulated loads and save | Foldkit Commands over `Effect.sleep` | `src/main.ts` |
| The paintings | a constant | `src/data.ts` |
| Appearance: theme, layout, badges, every element's Slot | `foldkit-mixins` | `src/style.ts` |

### What is not used, and why

- **`foldkit-primitives/motion` (`Presence`, tweens, springs).** They own
  animation state: a timed `hiding` phase so content can animate out. Upstream
  animates nothing; its "entry" and "exit" are facts about a navigation that
  start Commands, which `Transition` already answers from two routes. Adding
  Presence would add a phase nothing draws.
- **`foldkit-bundle`.** Its lifecycle is a placed Submodel's `init` and
  wiring, not a route's. Nothing here is a reusable Submodel; the pages are
  plain view functions over one Model.
- **`foldkit-remote`.** The catalog and paintings are local constants behind a
  fake latency, and what the example shows is *when* a load fires, which is
  exactly the transition policy. Remote would move that decision into a read
  plan and hide the point.
- **`foldkit-mirror`.** The route is the URL itself, parsed by the router; no
  Model field copies it.
- **`foldkit-surface`, `-agent`, `-sync`, `-form`.** No consumer of a
  projection, no agent, no replication, and one textarea with no validation.
- **`@foldkit/ui` / `foldkit-mixins-ui`.** Upstream draws a plain `textarea`
  and links; there is no ui component to adapt.

## Differences from upstream

- **A `ChangedUrl` for the route already shown is still logged.** Upstream logs
  clicking Home on Home as "Stayed within route", and that badge exists for
  it, so this port keeps it rather than making the repeat a no-op. The runtime
  (`foldkit` 0.163) does not report the starting URL again after `init`; the
  jsdom runtime test checks that a start logs only the cold load.
- **The paintings' gradients are CSS values** (`linear-gradient(…)`) in
  `src/data.ts`, not Tailwind classes, passed to the swatch as the custom
  property `--painting-gradient`.
- **The nav link of the current section carries `aria-current="page"`**, which
  is what styles it, in place of upstream's conditional class.
- `PaintingStatus` is read through its exhaustive `match` in place of `_tag`
  comparisons, and the page title through `AppRoute.match` in place of
  `Match.orElse`; the strings are upstream's.
- The look is approximated with a `Theme.oklch` indigo palette, not Tailwind.

## Tests

From the repository root: `npx vitest run examples/foldkit-route-transitions`.

- `test/story.test.ts`: upstream's tests, unchanged but for the import path.
- `test/log.test.ts`: the log's entries and order over a walk through every
  route, and the twenty-entry cap with numbering that keeps counting.
- `test/view.test.ts`: every page drawn inert, each element through a Slot, no
  fixed inline style, every token the drawn styles read in the stylesheet, the
  current nav link, the titles, each log entry's summary and badges for every
  kind of transition, and when a painting shows.
- `test/runtime.test.ts`: the real runtime in jsdom: the log as a reader sees
  it across links, the loads each entry fires, and the save on leaving the
  Studio.

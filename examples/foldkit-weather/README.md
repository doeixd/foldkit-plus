# Weather

Type a US zip code, press Get Weather, and see the place, the temperature, the
sky, the humidity and the wind, fetched from [Open-Meteo](https://open-meteo.com)
(its geocoder, then its forecast). The page shows each state of the request:
nothing yet, loading, failed, or the result. It ports Foldkit's
[`weather`](https://github.com/foldkit/foldkit/tree/main/examples/weather)
example to Foldkit Plus, with the same Model, Messages, `update` and Command;
the styling moves from Tailwind classes to `foldkit-mixins`.

## Who owns what

The request's state is the application's own, and the Model owns it as
Foldkit's `AsyncData`. One Command does the I/O:

```text
submit -> SubmittedWeatherForm -> update: weather = Loading, FetchWeather(zip)
FetchWeather: geocode -> forecast -> decode -> SucceededFetchWeather | FailedFetchWeather -> update -> weather = Success | Failure
```

| Concern | Owner | Where |
| --- | --- | --- |
| The zip code, the request's state (`Idle`, `Loading`, `Failure`, `Success`) | plain Foldkit: the Model, `AsyncData`, `update` | `src/main.ts` |
| The two HTTP requests, decoding Open-Meteo's answers, the failure sentences | plain Foldkit: `Command.define` over Effect's `HttpClient`, provided by Foldkit's `Http.layer` | `src/main.ts`, `// COMMAND` |
| The accessible input and submit button | `@foldkit/ui` Input and Button | `src/main.ts` |
| Their look: the shipped `Recipes.Input` and `Recipes.Button`, extended | `foldkit-mixins-ui` | `src/style.ts` |
| The page's Slots (declared by their style with `AppStyle`'s `slots`), layout (`Layout.stack`, `Layout.intrinsic`), theme, layer order | `foldkit-mixins` | `src/style.ts`, installed by `src/entry.ts` with `Style.install` |

## What is not used, and why

- **`foldkit-remote`.** Remote caches facts a server owns, by entity and id,
  and fetches what the screens that are showing lack. Here nothing is shared
  between screens and nothing is revisited: the fetch is one answer to one
  submit, and the Model keeps only the latest. Remote would change the
  behaviour (a second submit of the same zip code would show the cached answer
  as `Refreshing` instead of `Loading`, or fetch nothing at all) and need a
  hand-written `RemoteClient` translating a `ReadBatch` into the geocoder and
  the forecast, with `query`, `mutate` and `live` left unused. Upstream's
  Command is the smaller, exact owner.
- **`foldkit-primitives`.** Its `net` module has sockets, server-sent events,
  broadcast channels and online status, and nothing for one HTTP request.
  Foldkit's own `Http.layer` owns that.
- **`foldkit-form`.** The form is one text field with no check of its own:
  a blank zip code reaches the Command and comes back as the failure
  "Zip code required", in the same box as any other failure. A form Submodel
  would move that into a field error.
- **Surface, Mirror, Sync, Agent, Entity.** Nothing is read by another
  feature, kept in the URL or storage, replicated, exposed to an agent, or
  modelled as a domain entity. Reloading the page forgets the search, as
  upstream's does.

## Run it

```bash
pnpm --filter foldkit-example-foldkit-weather dev
```

It calls the real Open-Meteo API, which needs no key.

## Differences from upstream

- **A place without a region reads "Beverly Hills", not "Beverly Hills, ".**
  Upstream turns a missing `admin1` into `region: ''`. Here the field is
  `maybeRegion: Option<string>`, and the view writes the comma only when there
  is a region. The Model is never stored, so it keeps the `Option`.
- **The colours are derived, not Tailwind's.** One `Theme.oklch` accent at
  blue-500 gives the button, the numbers and the background gradient; the
  card is the theme's base surface, a near-white.

## Tests

From the repository root: `npx vitest run examples/foldkit-weather`. None of
them reach the network.

- `test/story.test.ts` and `test/scene.test.ts` are upstream's tests,
  unchanged but for the import paths and the repository's formatting;
  `test/main.fixture.ts` is upstream's
  fixture with `maybeRegion`.
- `test/update.test.ts`: a submit while loading starts no second fetch.
- `test/command.test.ts`: `fetchWeatherEffect` against a fake `HttpClient`:
  a blank zip code sends nothing, a 404 or an empty geocoder answer is
  "Location not found", a failed forecast or an answer that does not decode
  is "Failed to fetch weather data", the forecast is asked for the geocoder's
  coordinates in Fahrenheit and mph, and a place with no region keeps none.
- `test/view.test.ts` draws the view inert in each state: every element is
  drawn by a Slot, the stylesheet defines every token the styles read, the
  button carries the recipe, and the place is named with and without a region.
- `test/runtime.test.ts` runs the real runtime in jsdom with `fetch` stubbed:
  typing and submitting shows the loading state until the fake Open-Meteo
  answers, then the card, and every drawn class has its CSS; a blank submit
  shows the error without a request.

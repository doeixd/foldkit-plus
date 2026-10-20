# Media design: images and icons

Status: design, nothing built. Written 2026-10-20; revised the same day for
Cloudflare as the reference deployment and for how each part sits on Foldkit,
Foldkit Plus and Effect (§9–§13). Code in this document is a sketch against
today's APIs and has not been compiled; names marked *probe* rest on library or
platform behaviour that must be checked against the installed version before
anything is built on it.

## 1. What this adds

Foldkit Plus draws images and icons, but owns neither:

- `mixins-ui`'s `Avatar` draws one `img` with a `src`, and `AspectRatio` reserves
  a box. Nothing writes a `srcset`, a `sizes`, a priority, or a placeholder,
  though Foldkit has every builder for them (`Srcset`, `Sizes`, `Loading`,
  `Decoding`, `Fetchpriority`, `picture`, `source`).
- `Icon` draws whatever `content` it is given, and `Icons.byAttribute` masks
  whatever `url(…)` it is given. The drawings themselves are Lucide path data
  copied twice, into `mixins-richtext/src/icons.ts` and
  `examples/cms/src/views/icons.ts`.
- No package resizes an image, at build time or on a server.

This design adds one package, `foldkit-media`, and an `Image` view in
`mixins-ui`. It covers responsive images, placeholders, a resizing server that
deploys to Cloudflare Workers or Node, a build step, and icon data. It does not
cover the upload screen and the `Asset` Entity (that is `foldkit-cms-media`,
[cms-DESIGN.md](./cms-DESIGN.md) §14, which §9.5 hands its facts to), video, or
signed URLs for private images.

## 2. The decision everything follows from: an image is a URL to write

There are two ways to think about responsive images.

**As files to process.** Fetch the original, resize it, store the variants,
serve them. This is how the corps-place application does it: a sharp endpoint
writing every variant into SQLite. It makes the resizer the centre, and every
image, including one a CDN could already resize, passes through it.

**As URLs to write.** Every serious image host already resizes on request:
Cloudflare's `/cdn-cgi/image/…`, Shopify's `_400x`, imgix's `?w=`. A responsive
image is then a list of URLs at chosen widths, and the only work in the view is
writing them. [unpic](https://unpic.pics) is built on this: each provider is a
pair of functions, URL to `{ src, operations }` and back, and 28 providers cover
most hosts. A server of our own is one more provider, for originals no CDN
holds.

This design chooses the second, because of what follows from it:

- **The view does no I/O.** `Image` writes attributes from a value. The browser
  chooses a candidate from `srcset` and `sizes`; nothing in the application
  decides which width to fetch.
- **Our server is optional.** An application on Cloudflare, Shopify or a CMS
  with an image API needs no resizer of its own, and pays nothing for one.
- **One codec is the wire.** Our server is an Effect `HttpApi` endpoint whose
  path is a Schema. The view writes URLs with that endpoint's URL builder, and
  the server decodes requests with the same Schema at its validation boundary,
  the way Remote's payloads are one schema on both sides (§9.1).
- **Variants are a cache.** Whoever produces them, CDN or our server, can
  discard them; the original and the request are enough to produce them again.

## 3. Ownership

| Fact | Owner | Kind |
| --- | --- | --- |
| The original image | Its source: an R2 object or file keyed by content hash, a file in the repository, a third-party host | Authoritative |
| Its facts: width, height, alpha, placeholder, hash | Whoever owns the original, stored beside it (`foldkit-cms-media`'s `Asset` row, or the build's import) | Derived once from the original; recomputed, never edited |
| A variant (a width and format of it) | The provider's cache: a CDN, the Cache API, our `Variants` store | Disposable; producing it again is recovery |
| Which variant a page shows | The browser, from `srcset` and `sizes` | Not in the Model |
| Which widths exist | One `Widths` ladder, declared once (§5) | Configuration |
| An icon's drawing | The icon set it was imported from, at build time | Static data |

The view owns none of these. `Image` reads an asset's facts and a provider and
writes markup; it holds no Model and sends no Message (§7.4).

## 4. Prior art, and what each taught

**corps-place** (this author's React application) resizes on demand with sharp
into WebP, stores every variant as a SQLite BLOB, and draws icons from
generated components. What it got wrong is the list this design is checked
against:

- Any width from 1 to 1024 makes a permanent row, with no eviction, so anyone
  can fill the store. Widths must come from a ladder.
- Every response is `immutable` for a year, but local logos are re-ingested
  under the same URL. Immutability is a claim the URL must keep: it needs the
  content hash in it.
- When the store write fails, the full original goes out under the year-long
  header. A failure must be a failure response.
- Two concurrent misses both fetch and resize.
- No `img` has `width` and `height`; only one has a real `srcset`. Layout
  stability and candidates must be derived, not hand-written per call site.
- No placeholders, though per-logo colours exist in its data.
- Its icon generator finds icons by scanning source with a regular expression
  and deletes the files nothing it saw imports, so a re-export or relative
  import loses an icon.

**unpic** taught §2, and the layout model (§6): `fixed`, `constrained` and
`fullWidth` derive both the candidate widths and `sizes` from one width.
`background: 'auto'` asks the same CDN for a 24px version and sets it as the
image's own background, a placeholder with no build step and no wrapper
element.

**unplugin-icons** taught that the import is the selection
(`~icons/<set>/<name>` is a virtual module), so the module graph is the list of
used icons and nothing scans or prunes. It also showed two things to avoid: its
type declaration is a `~icons/*` wildcard, so a misspelled name type-checks; and
it makes SVG ids unique with `Math.random`, which would break hydration here.

**cloudflare-worker-image** (a Worker in front of a Rust Photon container)
taught that encoding does not fit in a Worker's own code, so the transform is a
swappable service. Its defects are a checklist for §9: an allowlist matched with
`hostname.endsWith`, so `evilexample.com` passes `example.com`; actions that
fetch further URLs (`watermark`, `blend`) with no allowlist at all; WebP always
encoded lossless, so `quality` is ignored; an unknown format silently becomes
PNG; a cache key of the raw query string, so reordered parameters miss; the
container's response stored without checking its status; the original proxied
on any error; no pixel limit before decoding.

## 5. The core: assets, widths, providers

Pure values in `foldkit-media`, with no I/O, safe to import in a browser.

```ts
// sketch
const ImageAsset = Schema.Struct({
  key: Schema.String, // where the original lives, as its provider reads it
  width: Schema.Int, // intrinsic, in pixels
  height: Schema.Int,
  alpha: Schema.Boolean, // has transparent pixels (§7.3)
  hash: Schema.OptionFromNullOr(Schema.String), // content hash of the original
  placeholder: Schema.OptionFromNullOr(Placeholder),
})
```

The asset is stored and sent, so its optional fields are `OptionFromNullOr`.
`hash` is absent for a third-party original we have never read. These are the
fields `foldkit-cms-media`'s `Asset` Entity holds, so the CMS reads them through
Remote like any other row.

**Widths.** `Widths.make([320, 480, 640, 828, 1080, 1280, 1920, 2560])` is the
one ladder. The view takes candidates from it; the server's path Schema refuses
any other width; the build step emits only these. corps-place's warm-up script
repeats its components' widths (400, 800, 720, 96) by hand, and nothing checks
they agree. The ladder also bounds cost on Cloudflare, where each width of each
original is a billed transformation (§10.3).

**Provider.** A provider writes a URL:

```ts
// sketch
interface Provider {
  readonly url: (asset: ImageAsset, request: { width: number; format: Format }) => Option<string>
  readonly formats: ReadonlyArray<Format> // what it can write a URL for
  readonly negotiates: boolean // picks the format itself from Accept (Cloudflare's f=auto)
}
```

- `Provider.hosted(MediaApi, { baseUrl })` is our server's (§9.1).
- `Provider.cdnCgi({ zone })` writes Cloudflare's `/cdn-cgi/image/…` URLs, for
  originals the zone can already fetch: no Worker of ours runs.
- `foldkit-media/unpic` wraps unpic's `transformUrl` for other hosts. unpic is
  an optional peer, as an adapter's library is here. *Probe*: its operation
  types per provider, and whether `transform` of an already-resized URL is
  stable.
- `Provider.static(variants)` is what a build-time import carries (§11): a table
  of emitted files, no URL scheme at all.
- `url` answers `Option`: a provider that has no URL for a width (a static table
  without it) leaves that candidate out of `srcset`, never a broken URL.

## 6. Layout: candidates and `sizes` from one value

```ts
// sketch
const Layout = defineTaggedUnion({
  Fixed: { width: Schema.Number }, // always this wide
  Constrained: { width: Schema.Number }, // this wide at most, narrower on a small screen
  FullWidth: {}, // the viewport's width
})
```

| Layout | Candidates from the ladder | `sizes` |
| --- | --- | --- |
| `Fixed(w)` | the smallest at or above `w`, and at or above `2w` | `${w}px` |
| `Constrained(w)` | every width up to the first at or above `2w` | `(min-width: ${w}px) ${w}px, 100vw` |
| `FullWidth` | the whole ladder | `100vw` |

Every column then drops widths above the asset's intrinsic width, keeping the
largest one below it. unpic cannot do this, since it does not know the
original's size; we do, and enlarging an image is wasted bytes.

- **`sizes` from the theme's breakpoints.** An image in a grid column knows its
  width only by breakpoint. `Image.sizes(theme, { base: '100vw', md: '50vw',
  lg: '33vw' })` writes the media conditions from `breakpointWidths(theme)`
  (`foldkit-mixins/theme`), the function that already makes CSS and the Model
  agree on what `md` means. `Theme.ref` will not do here: it reads token names,
  and a `sizes` condition needs the number. Writing the pixel values by hand is
  the "one layout decision written twice" trap.
- **`sizes="auto"`.** For a lazy image the HTML standard lets the browser use
  the laid-out width; `Image` writes `auto, ` before the derived list, which a
  browser without it skips. *Probe*: which engines honour it on the pinned
  Playwright browsers.

## 7. The `Image` view

In `mixins-ui`, built like `Avatar`: `Slots.define`, `SlotView.buildersFor`, a
recipe placed in `components` and `variants`. `mixins-ui` takes `foldkit-media`
as a peer and imports only its pure root.

```ts
// sketch
Image.view({
  asset,
  provider,
  layout: Layout.Constrained({ width: 640 }),
  alt: Alt.Described('The 2024 finals, from the press box'),
  priority: false,
  style,
  mixins,
}, h)
```

### 7.1 Markup

- One `img` when the provider negotiates the format or has one format. A
  `picture` with a `source` per format otherwise (`type="image/avif"`, then
  WebP, then the original's), so the URL alone decides the bytes and every
  cache can key on it. Negotiating from `Accept` on our own server was
  rejected: the Cache API and most CDNs key by URL, and a `Vary` header is not
  honoured by every one of them.
- `width` and `height` from the asset, scaled to the layout, so the box is
  reserved before a byte arrives. The ratio also goes on the `img` Slot as
  `--fk-image-ratio`.
- `priority: true` writes `loading="eager"` and `fetchpriority="high"`;
  otherwise `loading="lazy"` and `decoding="async"`.

### 7.2 Alt text is a choice, not a string

`alt` is `Alt.Described(text) | Alt.Decorative`. A decorative image writes
`alt=""` and `role="presentation"`; forgetting to choose is a type error, where
unpic types `alt` as optional (`alt?: string | number | null`).

### 7.3 Placeholders

```ts
// sketch
const Placeholder = defineTaggedUnion({
  Color: { value: Schema.String }, // a CSS color, e.g. derived from the logo
  ThumbHash: { hash: Schema.String }, // ~25 bytes, base64
  LowRes: {}, // ask the provider for its smallest ladder width
})
```

The placeholder is drawn as the `img` Slot's own background, read by the recipe
from `--fk-image-placeholder`: no wrapper element. That property and
`--fk-image-ratio` are set with `Style.inline`, since they are values of one
image that no theme may change; how the background is drawn stays in the recipe.

- `ThumbHash` decodes to a PNG data URL in a pure function, so the server
  render writes it and it paints with the HTML. Decoding is memoized by the
  hash, since a list redraws the same images. It costs one to two kilobytes of
  HTML per image.
- `LowRes` needs no build step and works for any provider, at the cost of one
  small request that does not paint with the HTML.
- **An image with alpha draws no placeholder by default.** A background behind
  a transparent PNG shows through it after it loads, and logos are the commonest
  transparent image. The asset's `alpha` fact decides it; §7.4's mixin is how
  such an image can have one.

ThumbHash over BlurHash: it encodes alpha and the aspect ratio, and is smaller.

### 7.4 Load and failure: an opt-in mixin

Plain CSS cannot tell a loaded image from a loading one. `Image.reveal` is a
mixin carrying a Foldkit Mount (`Mount.defineStream`, as `ImageCropper`'s
`ImageLoad` reads an image's natural size) that listens for `load` and `error`
and sets `data-state` on the `img`. The recipe then clears the placeholder and
fades on `loaded`, and on `failed` hides the image so a `fallback` drawn beneath
it shows, as `Avatar` stacks its initials.

- It sends no Message, so by the rule for such Mounts it is never on by
  default; it ships beside the style, like `Tabs.fluid`.
- An image already complete when the Mount runs (from the cache) must be read
  at insert, not waited for.
- A Mount reads its args once, so an `img` whose `src` changes is keyed by its
  `src`.
- An element holds one Mount, so `Image.reveal` must not be given a slot that
  already carries one; the `img` Slot carries none of its own.
- The fade's duration multiplies by the `motion` knob, not `travel`: it does
  not move.

Without it, a server-rendered image that fails shows its alt text, which is the
browser's own fallback.

### 7.5 Priority and the head

A high-priority image is usually the page's largest paint, and the browser finds
it sooner from a preload in the head. Foldkit fills head tags; it adds none, and
`foldkit-ssr`'s `Head` is a function from the rendered application to a string.
So `Image.preload(asset, provider, layout)` returns a
`<link rel="preload" as="image" imagesrcset imagesizes fetchpriority="high">`
for the application's `head` to include. It is not added for it.

### 7.6 The components that already draw images

- `Avatar` takes an `ImageAsset` and provider beside its plain `src`, and draws
  `Layout.Fixed(size)` through the same attribute derivation, so a 24px avatar
  stops fetching a 144px original. Its fallback stacking is unchanged.
- `Card`'s `image` slot and the CMS `Image` block draw `Image.view`.
- `richtext`'s `Image` atom gains an optional `asset`, an `Option`; without one
  it draws its `src` as today.
- `AspectRatio` stays a box for content that is not an image; an `Image`
  reserves its own.

## 8. Icons

### 8.1 Icon data, not icon components

```ts
// sketch
interface IconData {
  readonly viewBox: string
  readonly nodes: ReadonlyArray<SvgNode> // { tag, attributes, children }
}
```

- `Icon.view({ content: Icon.draw(data, h), label })` draws it inline. The
  existing `Icon` keeps its sizing ladder, `currentColor`, and `aria-hidden`
  unless labelled.
- `Icon.maskUrl(data)` serializes the same data to a `url("data:image/svg+xml,…")`
  for `Icons.byAttribute` and `Icons.glyph`.
- The drawing keeps the set's own `fill` and `stroke`, so filled and duotone
  sets work; corps-place hard-coded `fill="none"` and wrote its filled icons by
  hand.
- The nodes are parsed at build time, not set through `innerHTML`: a property
  write does not reach server markup, and the parse is where the element
  allowlist (§8.3) is enforced.
- Ids inside an icon (gradients, masks) are prefixed deterministically from a
  key the caller gives, never randomized, so a server render and its hydration
  agree.

### 8.2 Two producers of one type

- **Applications** import from a virtual module:
  `import { arrowLeft, heart } from 'virtual:foldkit-icons/lucide'`. The import
  is the selection. The plugin writes a declaration with one named export per
  icon in each installed Iconify set, so a misspelled name is a type error, and
  unused icons are tree-shaken. A folder of the application's own SVGs is a set
  too (`sets: { app: './src/icons' }`).
- **Packages** cannot depend on an application's Vite plugin, so a package that
  ships icons (`mixins-richtext`'s toolbar) commits generated `IconData`
  constants, made by a script from the same parser. This replaces both copies of
  the Lucide paths.

### 8.3 SVG is input

An application's own SVGs are trusted build input, but they are drawn inline,
so the parser keeps an allowlist of presentational SVG elements and attributes,
drops event attributes and any `href` that is not a fragment, and fails the
build on anything else rather than silently dropping it. Iconify sets go
through the same parser.

## 9. The server: `foldkit-media/server`

For originals no CDN can fetch: uploads, a repository's images outside the
build, an allowlisted host. It is written once against Effect services and runs
on Node and in a Cloudflare Worker by swapping Layers (§10).

### 9.1 The endpoint is the codec

```ts
// sketch
const Variant = Schema.String.pipe(/* "w640.avif" <-> { width, format, quality } */)

class MediaApi extends HttpApi.make('media').add(
  HttpApiGroup.make('images').add(
    HttpApiEndpoint.get('variant', '/_image/:variant/:hash', {
      params: Schema.Struct({ variant: Variant, hash: ContentHash }),
    }),
    HttpApiEndpoint.get('remote', '/_image/:variant/remote', {
      params: Schema.Struct({ variant: Variant }),
      query: Schema.Struct({ url: AllowedUrl }),
    }),
  ),
) {}
```

- `Variant`'s decoded side holds a width from the ladder (`widths.Schema`), a
  format literal, and a bounded quality honoured for every format. An unknown
  format is a 400, never a quiet PNG.
- `Provider.hosted` writes URLs with `HttpApiClient.urlBuilder(MediaApi, {
  baseUrl })`, which encodes through the same params Schema the server decodes
  with, so the wire cannot drift. *Probe*: what importing `HttpApiClient` adds
  to a browser bundle. If it brings the HTTP client along (as a constant from
  `foldkit/experimental/server` once brought the server renderer), the provider
  encodes with `Schema.encodeSync` on the params Schema alone, still the one
  definition.
- The originals are keyed by content hash, so a `variant` URL is a pure
  function of bytes and request: it is `public, max-age=31536000, immutable`
  honestly. A `remote` URL holds no hash, so it gets a short `max-age` and an
  `ETag` (`effect/http`'s `Etag`).
- The cache key is the encoded request, so two spellings of one request cannot
  exist.

### 9.2 Services

Each is a `Context.Service`, as the repository declares its services, with a
Layer per runtime.

| Service | Job | Layers |
| --- | --- | --- |
| `Originals` | Bytes of an original by hash, as a stream | `r2(bucket)`, `fileSystem(dir)` (Effect `FileSystem`), `memory` (tests) |
| `RemoteOriginals` | Bytes of an allowlisted URL | One, on Effect's `HttpClient`, with `FetchHttpClient.layer` on both runtimes |
| `Transformer` | Resize and encode; inspect an original's facts | `images(binding)` (Cloudflare), `sharp` (Node), a fake for tests that refuses what the real one refuses |
| `Variants` | Keep what was made | `cacheApi(cache)`, `r2(bucket)`, `fileSystem(dir)`, `none` |
| `Coalesce` | One transform per encoded request at a time | `memory` (Node), `none` (Workers, §10.4) |

`Variants` layers compose in order: on Cloudflare the Cache API in front of R2,
so an evicted variant is found again without another billed transformation.

### 9.3 Handlers and hosts

`Media.handlers` is the `HttpApiBuilder` group for `MediaApi`, requiring the
services. It is hosted the two ways the repository already hosts Effect HTTP:

- **As an Effect HTTP application**, like `AgentMcp.httpApp`: mounted in an
  `HttpRouter` beside other routes on Node, or turned into a web handler with
  `HttpRouter.toWebHandler`.
- **As a Worker's fetch handler**, like `serveFetch` from
  `foldkit-remote-server/fetch`: `Media.serveFetch({ layer: env => … })` builds
  the services from the request's bindings, because a Worker's bindings arrive
  with each request, not at start. The layer is built into a scope the response
  closes, the lesson `serveFetch` already paid for.

`server-DESIGN.md`'s route graph, when built, mounts it as one more route.

### 9.4 What it guarantees, and what it refuses

- **Allowlist by exact host.** `https` only. Redirects are followed by hand and
  each hop re-checked, and every URL the server fetches passes the same check;
  there is no second fetch path for an operation to open.
- **Limits before decoding.** A byte limit while streaming the original, a
  pixel limit before decode (*probe*: sharp's `limitInputPixels`; the Images
  binding takes at most 20 MB of input), and `Effect.timeout` on each step.
- **One transform per request at a time, where that is safe.** On Node,
  `Coalesce.memory` is an Effect `Cache` keyed by the encoded request, whose
  concurrent `get`s of one key run one lookup (documented in `Cache.d.ts`). On
  Workers it is `none` (§10.4).
- **Failure is a response.** Tagged errors carry their status through
  `HttpApiSchema.status`: unknown original 404, refused host 403, too large 413,
  transform failure 502, quota exhausted 503. They carry no internals, are never
  cached, and the original is never sent in a variant's place.
- **Variants are disposable.** Clearing every `Variants` layer costs time and,
  on Cloudflare, transformations; it loses no data.
- **Traced.** Each step is an `Effect.fn` span (`Media.fetch`,
  `Media.transform`, `Media.store`), as `AgentMcp.httpApp` names its own.

### 9.5 Facts at upload

`Transformer.inspect` returns width, height, and a small RGBA thumbnail, from
which the pure core computes `alpha` and the ThumbHash. Hashing is Web Crypto's
`crypto.subtle.digest`, present on both runtimes. An upload route
(`POST /_media/upload`, multipart through `effect/http`'s `Multipart`) streams
the body to `Originals`, inspects it, and answers the facts; `foldkit-cms-media`
then registers them as an `Asset` row through a Remote mutation, so the facts
live in the database the CMS already reads. Image bytes never travel through
RPC: a variant is an HTTP GET a cache can hold, and Remote carries only facts.
Who may upload is a `foldkit-guard` policy on that mutation and the route.

## 10. Deploying on Cloudflare

The reference deployment, and the one the example is tested against.

### 10.1 Shape

```text
Pages (static)                  Worker
  HTML, JS, CSS                   /remote      serveFetch (D1)
  ?image variants (§11)           /sync        Durable Object
                                  /_image/*    Media.serveFetch
                                  /_media/*    upload (Guard)
                                       |
                    R2 MEDIA: originals by hash, then variants
                    IMAGES binding: inspect, resize, encode
                    Cache API: variants at the edge
```

```toml
# wrangler.toml, beside examples/cloudflare's D1 and Durable Object bindings
[images]
binding = "IMAGES"

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "foldkit-media"
```

### 10.2 The Images binding is the transformer

A Worker cannot load sharp, and an encoder compiled to WASM inside the Worker
competes with its memory and CPU limits; cloudflare-worker-image needed a
container for the same reason. The Images binding takes the original's bytes
(`env.IMAGES.input(stream).transform({ width }).output({ format, quality })`),
so originals stay private in R2, and `info` gives width, height and format at no
charge. `Transformer.images` is that call behind the service.

`Provider.cdnCgi` is the cheaper path when originals are already public at a
URL the zone can fetch: Cloudflare resizes at its own edge, and no Worker of
ours runs. The hosted server is for private originals and uploads.

### 10.3 Cost and quota

Cloudflare bills each unique pair of original and parameters once a month;
format and quality do not count, width does. The free allowance is 5,000 a
month, and past it a new transformation fails with error 9422 while cached ones
keep serving. So:

- the ladder is the cost model: eight widths make each original at most eight
  transformations, about 625 originals a month free;
- `Variants.r2` keeps what was made, so a variant evicted from the Cache API or
  asked for next month does not transform again;
- error 9422 maps to the 503 `QuotaExhausted`, never to the original.

### 10.4 What does not cross requests

A Worker request cannot wake a fiber another request is waiting on: the
repository's traps list records workerd tearing such a stream down ("Promise
will never complete"). An in-memory `Cache` shared between requests would do
exactly that when a second request waits on the first's lookup. So on Workers
`Coalesce` is `none`. Concurrent misses each transform, which costs CPU but not
a second billed transformation, and the Cache API in front absorbs repeats.
What requests share is durable: R2 and the Cache API.

### 10.5 Local runs and tests

The repository runs Workers under miniflare. The Images binding there is an
offline version that supports width, height, rotate and format, which is what
the ladder uses; quality is not honoured offline. `wrangler dev --remote` uses
the real service. R2 and the Cache API are emulated. *Probe*: whether the Cache
API stores anything for a Worker served from a `workers.dev` host, where the
public demos live; if not, `Variants.r2` alone serves there.

## 11. The build: `foldkit-media/vite`

`import hero from './hero.jpg?image'` gives `{ asset, provider }`:

- The plugin reads the file, takes its size, alpha and hash, and computes a
  ThumbHash, through the same `Transformer` service and pure core as the server,
  on its sharp layer.
- It emits a file for each ladder width up to the intrinsic width, in each
  configured format, through `emitFile`, so names carry content hashes and the
  static host's `immutable` header is true.
- `provider` is `Provider.static` over those files.
- Results are cached by the original's hash, since AVIF encoding is slow.
- In development a middleware serves the same variants through the same
  handlers, so development and the build share one code path.

With `foldkit-ssr`'s `staticSite`, the pages and the variants deploy together to
Pages. Pages allows 20,000 files per site on the free plan (100,000 on paid)
and 25 MiB per file, and every image costs one file per width and format; a
site with many images sets `formats: ['avif']` with the original as the
fallback, or builds with `target: 'r2'` to upload variants to the bucket and
write `Provider.hosted` URLs instead.

The same plugin serves the icon virtual modules (§8.2): both turn a file into a
typed value at build time.

## 12. How it fits Foldkit and Foldkit Plus

| Piece | What this design uses it for |
| --- | --- |
| Foldkit html | `Srcset`, `Sizes`, `Loading`, `Decoding`, `Fetchpriority`, `Width`, `Height`, `picture`, `source`: the whole of `Image`'s markup, no new builder |
| Foldkit `Mount.defineStream` | `Image.reveal` (§7.4) |
| `foldkit-mixins` | Slots, recipes in `components`/`variants`, `Style.inline` for per-image values, the `motion` knob, radius tokens, `breakpointWidths` for `sizes` (§6) |
| `mixins-ui` | `Image`; `Avatar`, `Card` and `Icon` adopt it (§7.6, §8.1); `imageEdge` outlines it |
| `foldkit-primitives` | Nothing by default. Lazy loading and `sizes="auto"` are the browser's, and an `IntersectionObserver` per image would be a listener for the component's whole life doing what `loading="lazy"` does |
| `foldkit-ssr` | `Image.preload` for `head`; `staticSite` deploys `?image` variants; server markup tested by rendering to a string |
| `foldkit-entity`, `foldkit-cms-media` | `ImageAsset`'s fields are the `Asset` Entity's; the `Asset` control draws `Image` |
| `foldkit-remote` | Reads facts; a mutation registers an upload (§9.5). Bytes never go through it |
| `foldkit-guard` | Who may upload or delete an original |
| `richtext`, `composition`, the CMS | The `Image` atom and block draw `Image.view` |
| `foldkit-plus` | Re-exports `foldkit-media` as a subpath; the skill gets a reference entry |

## 13. How it fits Effect

| Need | Effect piece |
| --- | --- |
| The wire | `Schema` for the path; `HttpApi`, `HttpApiGroup`, `HttpApiEndpoint` for the endpoint; `HttpApiClient.urlBuilder` for the view's URLs |
| Serving | `HttpApiBuilder` handlers; `HttpRouter` on Node; `HttpRouter.toWebHandler` or a `serveFetch`-style per-request Layer on Workers |
| Dependencies | `Context.Service` per service; a `Layer` per runtime, wired with `Layer.provide` so a connection lives as long as what needs it |
| Fetching remote originals | `HttpClient` with `FetchHttpClient.layer` |
| Coalescing on Node | `Cache.make`, keyed by the encoded request |
| Limits | `Effect.timeout`; byte counting on the original's `Stream` |
| Errors | Tagged errors with `HttpApiSchema.status` |
| Revalidation | `effect/http`'s `Etag` for unhashed originals |
| Files on Node and at build | `FileSystem`, `Path` |
| Uploads | `Multipart` from `effect/http` |
| Observability | `Effect.fn` spans |
| RPC | Not for bytes. Facts travel through Remote's existing `RpcGroup`; there is no new RPC group |

## 14. Package layout

| Path | Contents | Peers |
| --- | --- | --- |
| `foldkit-media` | `ImageAsset`, `Placeholder`, `Layout`, `Widths`, `Provider` (`static`, `cdnCgi`), candidates and `sizes`, ThumbHash, `IconData` | `effect` |
| `foldkit-media/api` | `MediaApi` and `Provider.hosted` | `effect` |
| `foldkit-media/unpic` | Third-party providers | `unpic` (optional) |
| `foldkit-media/server` | Handlers, `Media.serveFetch`, the services and their portable Layers, errors | `effect` |
| `foldkit-media/sharp` | `Transformer.sharp` | `sharp` (optional) |
| `foldkit-media/cloudflare` | `Transformer.images`, `Originals.r2`, `Variants.r2`, `Variants.cacheApi` | `@cloudflare/workers-types` (types only) |
| `foldkit-media/vite` | `?image` imports, icon virtual modules | `vite`, `sharp` |
| `mixins-ui` `Image`, `Icon.draw` | The views | `foldkit-media` |

## 15. Testing

- **Candidates and `sizes`**: a table per layout, with a ladder and asset sizes
  chosen so that dropping the intrinsic-width cap, the `2w` bound, or the sort
  changes the answer. Mutation specs beside them.
- **The endpoint**: every URL `urlBuilder` writes decodes back to its request;
  a width off the ladder, an unknown format, and a host that only ends with an
  allowed one are refused.
- **The services**: concurrent misses under `Coalesce.memory` run one transform
  (a counting fake); a failing `Variants` store never sends the original; an
  error is never cached. The fake `Transformer` refuses what the binding and
  sharp refuse, or it tests nothing.
- **The Worker**: `Media.serveFetch` under miniflare with R2, the Cache API and
  the offline Images binding, beside `examples/cloudflare`'s existing tests;
  two concurrent requests for one variant both answer.
- **Server markup**: render `Image` to a string and parse it back, since
  `srcset`, `sizes` and `fetchpriority` must reach server output and a parser
  must build the same `picture`.
- **Browser**: the box has its final size before the image loads (geometry, not
  visibility); `Image.reveal` reads an image already complete at insert; a
  transparent image shows no placeholder through it.
- **Icons**: an unknown element fails the build; ids are equal across two
  renders; a misspelled import is a `@ts-expect-error`.
- **End to end**: the Cloudflare example's e2e loads a page and checks the
  network for one request per image at the expected width.

## 16. Build order

1. **The core.** `ImageAsset`, `Placeholder`, `Layout`, `Widths`, the static and
   `cdnCgi` providers, candidates and `sizes`, ThumbHash. Pure, unit-tested,
   mutation-tested.
2. **The endpoint.** `MediaApi` and `Provider.hosted`, with the bundle probe of
   §9.1 settled first.
3. **The view.** `Image` with alt, priority, placeholder, `picture`, and
   `Image.preload`; then `Image.reveal`; then `Avatar` and `Card` on it.
4. **The server on Cloudflare.** The services, `Transformer.images`, the R2 and
   Cache API layers, `Media.serveFetch`, in `examples/cloudflare` under miniflare.
5. **The server on Node.** `Transformer.sharp`, the file system layers,
   `Coalesce.memory`, the `HttpRouter` host.
6. **The build.** `?image`, then icon data, the virtual modules, and replacing
   the two Lucide copies.
7. **Uploads.** The upload route and its facts, handed to `foldkit-cms-media`
   when that is built.

## 17. Open questions

- **Dark variants.** corps-place inverts dark logos on its server. Here, a theme
  is chosen by the Model, not by `prefers-color-scheme`, so a `source` with a
  media query is wrong. Probably an `Option` of a second asset, chosen by the
  view from the theme it is given; whether inversion is a provider operation is
  undecided.
- **Art direction.** A different crop per breakpoint is a `picture` with
  `media` sources. It fits §7.1's markup but has no input yet.
- **unpic's fit.** If probing shows its types or its re-transform are not what
  §5 needs, the third-party providers are written here, starting with Shopify.
- **Thumbnails in a Worker.** The Images binding outputs encoded images, not
  pixels, so a Worker's ThumbHash needs a PNG decoder in JavaScript. *Probe*: a
  small decoder under workerd, or computing the ThumbHash at upload in the
  browser and checking only its shape on the server.

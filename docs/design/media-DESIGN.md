# Media design: images and icons

Status: steps 1 to 4 of §16 built (`foldkit-media` core, server and Cloudflare
layers; `Image` in `foldkit-mixins-ui`). Written 2026-10-20; revised the same
day for Cloudflare as the reference deployment and for how each part sits on
Foldkit, Foldkit Plus and Effect (§9–§13), and again after steps 1 to 4 for
prerendering, layout stability, caching and stores, abuse limits, recipes and
primitives (§18–§24) and response headers (§25), which reorder §16. Code in this document is a sketch against
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
| Its focal point | The `Asset` row; an editor sets it (§18.5) | Authored |
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

**Provider.** A provider writes a URL, and carries the ladder it makes, so
the view never takes widths separately (built, `src/provider.ts`):

```ts
interface Provider {
  readonly widths: Widths
  readonly sources: ReadonlyArray<Format> // offered as `source`s, most preferred first
  readonly fallback: Encoding // the `img`'s own: a Format, or `auto` for a host that reads Accept
  readonly url: (asset: ImageAsset, request: { width: number; encoding: Encoding }) => Option<string>
}
```

- `Provider.hosted(MediaApi, { baseUrl })` is our server's (§9.1).
- `Provider.cdnCgi({ zone })` writes Cloudflare's `/cdn-cgi/image/…` URLs, for
  originals the zone can already fetch: no Worker of ours runs.
- `foldkit-media/unpic` wraps unpic's `transformUrl` for other hosts. unpic is
  an optional peer, as an adapter's library is here. *Probe*: its operation
  types per provider, and whether `transform` of an already-resized URL is
  stable.
- `Provider.fromFiles(files, formats)` is what a build-time import carries
  (§11): a table of emitted files, no URL scheme at all.
- `url` answers `Option`: a provider that has no URL for a width (a build table
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

A width above the original's own is written with the original's width as its
descriptor (`w1080` of a 1000px original is `1000w`), since a provider that does
not enlarge answers it with the original's pixels, and only the first such width
is kept: the rest would fetch the same pixels. unpic cannot do this, since it
does not know the original's size.

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

*Built: `Image.view`, `Recipes.Image`, alt as `described`/`decorative`, the
placeholder on the `img`'s background, `data-layout`, and `data-unavailable`
for a provider with no URL. `Picture.preload` (§7.5), `Image.watchLoad` (§7.4) and Avatar's derived
picture (§7.6) are built too. Foldkit, not the view, keeps
`loading` before `src`: `src` is a property, set after every attribute.*

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
  hash, since a list redraws the same images. It costs a few kilobytes of HTML
  per image (3.3 KB for a 2:1 sample), so a long list may prefer `Color`.
- `LowRes` needs no build step and works for any provider, at the cost of one
  small request that does not paint with the HTML.
- **An image with alpha draws no placeholder by default.** A background behind
  a transparent PNG shows through it after it loads, and logos are the commonest
  transparent image. The asset's `alpha` fact decides it; §7.4's mixin is how
  such an image can have one.

ThumbHash over BlurHash: it encodes alpha and the aspect ratio, and is smaller.

### 7.4 Load and failure: an opt-in mixin

*Built as `Image.watchLoad`, without the fade this section first planned.*
Plain CSS cannot tell a loaded image from a loading one. `Image.watchLoad` is a
mixin carrying a Foldkit Mount (`Mount.defineStream`) that listens for `load`
and `error` and sets `data-state` (`loading`, `loaded`, `failed`) on the `img`.
`Recipes.Image` hides a failed image, keeping its box, so no broken-image glyph
or stray alt text shows.

- **No fade.** The placeholder is the `img`'s own background (§7.3), and any
  opacity on the `img` fades its background with it: a fade from `loading`
  would show the page, not the placeholder, until the file arrived. Moving the
  placeholder to the frame was rejected: the frame is as wide as its container,
  wider than a constrained image. An image that has not arrived paints nothing
  over its placeholder anyway, so it swaps from placeholder to picture, as
  Next's and unpic's do.
- It sends no Message, so by the rule for such Mounts it is never on by
  default; it ships beside the style, like `Tabs.fluid`.
- An image already complete when the Mount runs (from the cache, or loaded
  before the page hydrated) is marked at insert, never `loading`; a browser
  test watches every `data-state` it takes.
- A later `src` on the same element keeps its mark until its own file settles.
- An element holds one Mount; the `img` Slot carries none of its own.

Without it, a server-rendered image that fails shows its alt text, which is the
browser's own fallback.

### 7.5 Priority and the head

A high-priority image is usually the page's largest paint, and the browser finds
it sooner from a preload in the head. Foldkit fills head tags; it adds none, and
`foldkit-ssr`'s `Head` is a function from the rendered application to a string.
So `Picture.preload(picture)` (built, in `foldkit-media`) returns a
`<link rel="preload" as="image" imagesrcset imagesizes fetchpriority="high">`
for the application's `head` to include, from the same `Picture.derive` the
view draws. It preloads the first `source`'s candidates with its `type`, so a
browser that cannot show that format skips it. It is not added for the page.

### 7.6 The components that already draw images

- *Built.* `Avatar`'s `src` is a URL or an `AvatarPicture`
  (`{ asset, provider, width }`): one input in two forms, not a second one.
  The picture is drawn at `Layout.Fixed(width)` through the same `img`
  attributes `Image.view` writes (`imageAttributes.ts`), so a 24px avatar
  fetches a 48px variant, not the original. The avatar's CSS size comes from
  its recipe, which the view cannot read, so the page says the width. A
  provider with no URL leaves the initials. Its fallback stacking is unchanged.
- `Card`'s `image` slot takes any `Html`, so `Image.view` goes in it as is: no
  change to Card. The CMS `Image` block is still to move.
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

### 8.4 Repeated icons, and the components that take one

- **A sprite for a page that repeats an icon.** A table of fifty rows with a
  delete button draws one path fifty times inline. `Icon.sprite(icons, h)`
  draws each icon once as a `<symbol>` in a hidden `svg`, and
  `Icon.use(data, h)` draws `<use href="#…">` where it appears, with the
  symbol's id from the icon's key (deterministic, §8.1). Inline stays the
  default: a sprite only pays where an icon repeats.
- **The components that take an `icon`** (`Button`, `Alert`, `Breadcrumb`,
  `Command`, `Empty`, `Steps`, `Tabs`, `Segmented`, `Sidebar`, `TreeView`,
  `ThinkingIndicator`, `Toast`) take `Html`, so `Icon.draw` composes with them
  already. The pass checks each one sizes and colours a drawn icon through its
  own slot, and that none draws an icon's `svg` without `aria-hidden`.
- **Any Iconify set** works through the virtual module, Unicons (`uil`)
  included, by its Iconify prefix.

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
- `Provider.hosted` encodes with the space's Schema and fills `Variant.PATH`;
  `MediaApi` (`foldkit-media/server`) routes the same path, and its handler
  decodes with the same Schema (§25.4 says why the route itself takes text),
  so the wire cannot drift; a test sends
  every URL a picture writes through the real router and reads back the request
  it was written from. *Built.* `HttpApiClient.urlBuilder` was measured and
  rejected for the browser: over a bundle of Schema alone (78.8 KB gzip), the
  `HttpApi` definition added 19.9 KB gzip and `urlBuilder` 5.9 KB more, for
  what one `encodeOption` and a string replace do.
- A variant is spelled `w640.avif` or `w640q75.webp`, with no leading zero in
  either number, so one request has one spelling.
- The originals are keyed by content hash, so a `variant` URL is a pure
  function of bytes and request: it is `public, max-age=31536000, immutable`
  honestly. A `remote` URL holds no hash, so it gets a short `max-age` and an
  `ETag` (`effect/http`'s `Etag`).
- The cache key is the encoded request, so two spellings of one request cannot
  exist.

### 9.2 Services

*Built: `Originals`, `Transformer` and `Variants`, the handlers, `layer` and
`serveFetch`, with memory layers; `Coalesce` and the per-runtime layers are
not yet. The services are resolved once, when the route group is built, and
closed over: a handler's own requirements would otherwise be per-request ones,
and a memory store rebuilt each request keeps nothing. So `serveFetch` builds
one router per Worker environment (a `WeakMap` by `env`). Error responses'
headers are §25's.*

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

*Built: `foldkit-media/cloudflare`'s `originalsR2`, `transformerImages` and
`variantsR2` (the Cache API in front of R2 as one layer, since two `Variants`
layers cannot both be provided), and `/_image/` in `examples/cloudflare`. The
layers are tested in Node against miniflare's own bindings
(`mf.getBindings()`, `mf.getCaches()`), so `pnpm mutate`, which edits modules
as Vitest loads them, reaches them; a test of the bundled worker could not. A
response put in the Cache API from Node must be miniflare's own `Response`, so
the test wraps the cache; a Worker's global `Response` is right as is. Found
while probing: the binding outputs raw `rgba`, which answers §17's ThumbHash
question, and `ImagesError` carries a numeric `code`.*

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

### 10.6 A possibility: Photon in the Worker

Not planned; recorded so it is not rediscovered. A `Transformer` over
[Photon](https://docs.rs/photon-rs/latest/photon_rs/) compiled to WebAssembly
(`@cf-wasm/photon`, Apache-2.0, with `workerd` and `node` entry points of one
API) would run in the Worker itself, for an account without Cloudflare Images
or to avoid its per-transformation billing. Probed on 2026-10-20 against 0.4.0:

- **No AVIF, and WebP only lossless.** `get_bytes_webp()` takes no quality and
  writes `VP8L`: a 640px variant of a photograph was 623 KB as WebP and 49 KB
  as JPEG at quality 75. Its space would be JPEG, with PNG for transparent
  images (`Variant.space({ formats: ['jpeg'] })`), and the transformer should
  name the formats it encodes so a space it cannot serve is refused when the
  server is built, not answered with 502s.
- **CPU.** A 3000×2000 original took 92 ms to decode and 116 ms to resize
  (`Triangle`; `Lanczos3` 278 ms, `Nearest` 29 ms). Workers Free allows 10 ms
  of CPU a request, so it needs Workers Paid (30 s by default); kept variants
  make it a cost per variant, not per request.
- **Memory.** It decodes the whole original into RGBA in the isolate's 128 MB
  (24 MB for 3000×2000), so it needs a pixel limit read from the header before
  decoding, which neither the byte limit nor Photon gives.
- **Failure.** Bytes that are not an image trap (`RuntimeError: unreachable`);
  the instance kept working after one, which a test would have to hold to.
- **What it would add beyond resizing:** raw RGBA (`to_raw_pixels`), so a
  Worker without the Images binding could compute a ThumbHash at upload.

## 11. The build: `foldkit-media/vite`

`import hero from './hero.jpg?image'` gives `{ asset, provider }`:

- The plugin reads the file, takes its size, alpha and hash, and computes a
  ThumbHash, through the same `Transformer` service and pure core as the server,
  on its sharp layer.
- It emits a file for each ladder width up to the intrinsic width, in each
  configured format, through `emitFile`, so names carry content hashes and the
  static host's `immutable` header is true.
- `provider` is `Provider.fromFiles` over those files.
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
| `foldkit-primitives` | Not for loading: lazy loading and `sizes="auto"` are the browser's, and an `IntersectionObserver` per image would be a listener for the component's whole life doing what `loading="lazy"` does. An image preload Command and the connection subscription are added there (§24.2) |
| `foldkit-ssr` | `Image.preloadsIn` as a `Head` read from the rendered page (§19.1); an `emit` hook on `staticSite` that writes hosted variants out (§19.2); facts for URL-only images at prerender (§19.3); server markup tested by rendering to a string |
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
| Coalescing on Node | `Cache.make` keyed by the encoded request, or `PersistedCache` (§22.3) |
| Stores | `KeyValueStore` (`effect/persistence`): memory, file system, SQL/D1, and one over R2 (§22.2) |
| Rate limits | `RateLimiter` (`effect/persistence`) on Node; Cloudflare's `ratelimits` binding on Workers (§23) |
| CPU bound on Node | `Semaphore` around the sharp transformer (§23) |
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
| `foldkit-media` | `ImageAsset`, `Placeholder`, `Layout`, `Widths`, `Provider` (`fromFiles`, `cdnCgi`), candidates and `sizes`, ThumbHash, `IconData` | `effect` |
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

Steps 1 to 4 are built: the core, the hosted endpoint, the view (with
`Picture.preload`, `Image.watchLoad` and Avatar's derived picture), and the
server on Cloudflare. Building them, and probing Effect, `foldkit-ssr`,
miniflare and the Images binding along the way, changed the plan from here.
§18 to §25 hold the reasons; this is the order.

5. **Corrections to what is built** (§18, §25). The hash-first path, the
   quality ladder, the unavailable frame's box, the placeholder level, the
   focal point, and the response headers (`headersFor`: a cache lifetime for
   every error, `ETag` and 304, CORS, `nosniff`, `Server-Timing`). Small and
   breaking, so before anything depends on them.
6. **Stores on `KeyValueStore`** (§22). `Variants` and `Originals` over any
   Effect `KeyValueStore`, a `KeyValueStore` over R2, then the Node host: a
   sharp `Transformer`, a `Semaphore` over it, and sharing a pending transform
   (`Cache`, or `PersistedCache` if its probe holds).
7. **Admission** (§23). Rate limits on misses only, through Effect's
   `RateLimiter` on Node and Cloudflare's `ratelimits` binding in the example.
8. **Prerendering** (§19). `Image.preloadsIn` as a `Head`, an `emit` hook in
   `foldkit-ssr`'s `staticSite` and `Media.materialize` on it with the
   `_headers` rules it needs (§25.3), facts for images named only by URL, and
   `Picture.ogImage`.
9. **Stability, recipes and primitives** (§20, §21, §24). A layout-shift
   browser test over every guard, the recipe axes, `Figure`, the image
   preload Command, and the development audit.
10. **The build.** `?image`, then icon data, the virtual modules, and replacing
    the two Lucide copies (§8, §11).
11. **Uploads and adoption.** The upload route and its facts (§9.5), handed to
    `foldkit-cms-media`; the CMS `Image` block, the rich-text atom and the site
    on `Image`; `Provider.detect` through unpic for images on known hosts.

## 17. Open questions

- **Dark variants.** corps-place inverts dark logos on its server. Here, a theme
  is chosen by the Model, not by `prefers-color-scheme`, so a `source` with a
  media query is wrong. Probably an `Option` of a second asset, chosen by the
  view from the theme it is given; whether inversion is a provider operation is
  undecided.
- **Art direction.** A different crop per breakpoint is a `picture` with
  `media` sources. It fits §7.1's markup but has no input yet. The focal point
  (§18.5) covers the common case, one crop that keeps its subject.
- **unpic's fit.** If probing shows its types or its re-transform are not what
  §5 needs, the third-party providers are written here, starting with Shopify.
- **Thumbnails in a Worker.** The Images binding's `output` takes
  `format: 'rgba'`, raw pixels, but not offline: miniflare answers "RGB/RGBA
  output is not supported in local mode" (9520), so a layer using it could not
  be tested. `inspectorImages` makes no thumbnail; a ThumbHash on Workers waits
  on either a PNG output decoded in JavaScript or computing it in the browser
  at upload.
- **`PersistedCache` on Node** (§22.3): whether it can keep successes and not
  failures.
- **`closeBundle` ordering** (§19.2): whether Vite runs plugins' `closeBundle`
  in parallel, which is why materializing waits on a `foldkit-ssr` hook rather
  than a plugin of its own.

## 18. Corrections to what is built

Each is breaking, and each is cheap now and costly once a store holds
variants under the old shape. The packages are 0.x and unreleased.

### 18.1 The hash comes first: `/_image/<hash>/w640.avif`

*Built.*

The path ends in the format's extension. A variant written out as a file
(§19.2) is then a plain file any static host serves with the right type,
where `/_image/w640.avif/<hash>` would be a file named by a hash with no
extension, served as `application/octet-stream`. The `Variants` key becomes
`<hash>/<spelling>`, so an original's variants share a prefix: removing an
original removes them by prefix, and an R2 key mirrors the URL.

### 18.2 Quality comes from a ladder, and formats from a set

*Built as `Variant.space({ widths, formats, qualities })`, whose `size` is the
count. Qualities default to none: no URL names one, so the encoder's default
applies and `Variant.standard` makes 16 variants an original.*

`Variant.schema` accepts any quality from 1 to 100, so each width and format
has a hundred spellings, and a crawler can make the server encode every one.
The server takes `qualities` (default one entry, such as `[75]`) and `formats`
(default `avif`, `webp`), each a Schema of literals like the width ladder, and
`Provider.hosted` writes only those. An original then has at most
`widths × formats × qualities` variants (8 × 2 × 1 = 16 by default), a number
the server can log at start and a deployment can price. Cloudflare bills width
alone (§10.3); storage and CPU count every variant.

### 18.3 An unavailable image keeps its box

*Built, with its alt text: the empty frame is `role="img"` named by it, or
hidden when decorative, as a failed image says its alt.*

`Image.view` draws an empty `picture` marked `data-unavailable` when the
provider has no URL. It collapses, so the page around it is laid out as if
there were no image, unlike a failed load (`watchLoad`), which keeps its box.
The frame carries the ratio and width, and the recipe holds the box, so a
missing variant and a failed one look alike and move nothing.

### 18.4 One ThumbHash, two renderings

*Built.*

A decoded ThumbHash costs a few kilobytes of HTML per image (§7.3). The same
hash also gives its average color (`thumbHashToAverageRGBA`), for nothing. So
the placeholder has a level: `detail` paints the blurred likeness, `average`
paints the color. It is chosen without the page saying so: `detail` for a
`priority` image, the one the reader waits on, and `average` for the rest, so
a grid of fifty thumbnails adds fifty colors to the HTML, not fifty PNGs. An
input overrides it.

### 18.5 A focal point

*Built as `focus`, read with `OptionFromOptionalNullOr`, so assets stored
before it decode as none. The `ratio` axis that crops by it is §24.1's.*

`ImageAsset` gains `focus`, an `Option` of `{ x, y }` from 0 to 1. A style
that crops (`ratio`, §24.1) writes it as `--fk-image-focus`, read by
`object-position`, so a portrait cropped square keeps the face. A provider
that crops on the host (Cloudflare's `gravity`) can be given it too. It is the
one authored fact of an asset: an editor sets it, so it is owned by the `Asset`
row, not derived (the ownership table in §3 gains it).

## 19. Prerendering with `foldkit-ssr`

A static site is where image work pays most: every page is rendered once, by a
build that can read files and run sharp, for readers who never wait on a
server. Four pieces fit `staticSite` as it is, and one needs a hook.

### 19.1 Preloads read from the rendered page

*Built. `Picture.preloadLink` writes the link for both, so `Picture.preload` and
`Image.preloadsIn` cannot disagree; the markup's values are unescaped before it
escapes them, or `&` would arrive twice escaped.*

`foldkit-ssr`'s `Head` is a function of the rendered page, the shape
`Style.usedIn` uses to collect the classes a page drew. `Image.preloadsIn` is
one too: it reads the rendered markup for the `img` with
`fetchpriority="high"` and its `picture`'s first `source`, and writes the
`<link rel="preload">`. The page marks `priority` once, where it draws the
image, and the head follows, with no asset and provider handed to it a second
time. `Picture.preload` stays for a head built by hand.

### 19.2 Hosted variants written out at build

*Built: `foldkit-ssr`'s `emit(pages)` (refusing a path outside the output or on
a file the build or the client build writes), and `materialize({ pages, fetch,
maxFiles?, headersFile? })`, which fetches each variant through `serveFetch`'s
handler. A plugin of its own was not tried: the hook is smaller.*

`Media.materialize` takes the built pages, finds every `/_image/` URL in their
`srcset`s and `src`s, and runs the same handlers in the build process (a sharp
`Transformer`, `Originals` from the file system or a `KeyValueStore`) to write
each variant as a file at its own path. `Provider.hosted` then works on a
static host with no server at all: the Worker becomes optional, needed only
for images a build never saw. With §18.1 the files have their extensions, and
the Variants build cache (§22) makes a second build write without encoding.

It needs one change in `foldkit-ssr`: `staticSite` takes an
`emit: (pages) => Effect<ReadonlyArray<{ file, bytes }>>` and writes what it
returns beside the pages. A plugin of its own would have to run after
`staticSite`'s `closeBundle`, and Rollup runs that hook in parallel across
plugins (*probe*). Pages' limits are counted, not discovered: the step reports
the files it wrote and fails the build above a configured maximum (Cloudflare
Pages: 20,000 files on the free plan).

### 19.3 Facts for images named only by URL

*Built as `factsOf(url, { allow, maxBytes?, cache?, fetch? })` over
`describe` and an `Inspector` service of its own (not a `Transformer`
method, which every fake transformer would have had to grow). Rendering
content with the facts it finds is the adoption step. On Workers
`inspectorImages` reads the size alone: see §17.*

A rich-text `Image` atom or a CMS block may hold a `src` and no facts, and an
`img` with no `width` and `height` moves the page when it arrives. During
prerender (and on save, in the CMS), `Media.factsOf(url)` reads the original
through `RemoteOriginals` (the allowlist applies), inspects it with the
`Transformer`, and keeps the facts in a `KeyValueStore` by URL, revalidated
with the original's `ETag`. The renderer is handed the facts, so a content
image is drawn with its box and its placeholder like any other. An image whose
facts cannot be read is drawn as today and reported by the build, never
silently.

### 19.4 Open Graph images

*Built, taking the page's `origin`: a hosted provider's URLs are relative. A
provider that picks the format (`cdnCgi`) is asked for `auto`.*

`Picture.ogImage(asset, provider)` gives an absolute URL of a JPEG at the first
ladder width of at least 1200, for the plan's `head` `image`. AVIF and WebP are
not offered: link-preview fetchers do not all read them.

### 19.5 No build id in image URLs

A variant's URL is its original's hash and its request, so a redeploy changes
no image URL and empties no cache. Only pages carry the build id.

## 20. Layout stability, end to end

| What could move the page | What holds it | Status |
| --- | --- | --- |
| An image arriving | `width` and `height` from the facts; `height: auto` | Built, browser-tested |
| An image with no facts (named by URL) | Facts read at prerender or save (§19.3) | Planned |
| A provider with no URL | The frame keeps the box (§18.3) | Planned |
| A failed load | `watchLoad` hides it and keeps the box | Built, browser-tested |
| A placeholder swapped for the picture | Same element, same box | Built |
| An avatar's picture | The recipe's size; the picture is absolute | Built |
| Hydration | Server and browser draw the same attributes (no client-only property) | Built, SSR-tested |
| A long gallery below the fold | `defer`: `content-visibility: auto` with `contain-intrinsic-size` from the box (§24.1), so unrendered rows keep their height | Planned |

One browser test covers the table: a page of images whose files are held back
and then released, observed with a `PerformanceObserver` for `layout-shift`,
must report a total of 0. A guard removed by mutation turns it red. *Built:
the files are held in the browser over the DevTools protocol (`Fetch.enable`,
answered with `Fetch.fulfillRequest` after the page is laid out). With `data:`
URLs the test passed with `width` and `height` deleted, since such a file
arrives before the first layout; held, the same deletion reports a shift of
0.006.*

## 21. Automatic, and where it stops

Done without the page asking:

- the candidates, capped at the original's width, and `sizes` from the layout,
  with `auto` first on a lazy image;
- a `source` per format, so the browser picks AVIF where it can;
- `loading`, `decoding` and `fetchpriority` from `priority`;
- no placeholder behind a transparent image, and the placeholder level from
  `priority` (§18.4);
- the facts, wherever an original enters: at upload (§9.5), at import (§11), at
  prerender (§19.3);
- the head's preloads, from the rendered page (§19.1);
- the cache headers and keys, from the URL.

Left to the page, on purpose: `alt` (only the author knows what an image
says), `priority` (only the page knows its first screen), the `layout` (how
wide the design draws it), and the provider.

What it leaves to the page, a check can catch. `Image.audit` is a mixin for
development builds, like `watchLoad` never on by default: a
`PerformanceObserver` for the largest contentful paint reports when that
element is a lazy `img` ("give this image `priority`"), a page with more than
one `priority` image, and an `img` drawn wider than its largest candidate
(blurry) or much narrower than its smallest (wasted bytes), from
`naturalWidth`, the drawn width and `devicePixelRatio`. It logs; it never
changes the page.

`Provider.detect(url)` (through unpic, §5) gives an image named by URL on a
known host (Shopify, Cloudinary, imgix, …) its candidates from that host's own
resizing, with no server of ours.

## 22. Caching and stores

### 22.1 Every layer, end to end

| Layer | Holds | Key | When it goes stale |
| --- | --- | --- | --- |
| Browser HTTP cache | variants | URL | Never: the URL names the bytes |
| Edge (Cache API, a CDN) | variants | URL | Never; evicted at will |
| `Variants` store | variants | `<hash>/<spelling>` | When its original is removed (by prefix) |
| In-process (Node) | a transform in flight | the encoded request | When it settles: sharing, not storing |
| Build cache | facts by hash; variants | content hash and spelling | Never: content-addressed |
| Facts by URL (§19.3) | facts of a remote original | URL | Revalidated with `ETag` |
| The page | decoded ThumbHashes | the hash | Bounded memo (built) |

Nothing here is invalidated by time, because every key is content-addressed
except the remote facts, which revalidate.

### 22.2 One store: Effect's `KeyValueStore`

*Built: `variantsKeyValueStore`, `originalsKeyValueStore` and `keyValueStoreR2`;
the memory layers are gone, and `variantsR2` is the adapter over R2 with the
edge wrapped in front. `originalsR2` stays its own layer: it streams the
original, where the general adapter reads it into memory. `serveFetch`'s layer
may now fail to build (a store that cannot connect), answered as a 500.*

Effect's `KeyValueStore` already keeps bytes (`getUint8Array`, `set`) and
already has the layers a host needs: `layerMemory`, `layerFileSystem`,
`layerSql` (SQLite, or D1 through `@effect/sql-d1`, which is what corps-place
built by hand). So `Variants` and `Originals` each get one adapter over it,
`Variants.keyValueStore` and `Originals.keyValueStore`, in place of a layer per
platform:

- the memory layers built in step 4 become `KeyValueStore.layerMemory` under
  the adapter;
- Node and the build cache are `layerFileSystem`;
- R2 becomes one `KeyValueStore` written here (`keyValueStoreR2(bucket)`), so
  `variantsR2` is the adapter over it with the Cache API in front;
- a variant's media type is not stored: the key's extension (§18.1) says it.

### 22.3 Sharing a transform on Node

*Built as the handlers' `coalesce` option over an Effect `Cache` with a zero
time-to-live: concurrent `get`s share a pending lookup, and the entry expires
as it settles, so it holds work in flight and nothing else, failures
included (probed). The lookup is the make and the store write together, so
concurrent misses also write once. On by default for `layer`, off for
`serveFetch`. `PersistedCache` was not needed.*

Concurrent requests for one missing variant should run one transform. On Node
an Effect `Cache` keyed by the encoded request does it (its concurrent `get`s
share a lookup). `PersistedCache` goes further: an in-memory `Cache` over a
persisted store, which is `Variants` and coalescing in one Effect piece.
*Probe*: whether its time-to-live per exit can keep successes and drop
failures; if not, it would remember a 502. On Workers neither is used:
a request cannot wait on another's fiber there (§10.4).

## 23. Abuse, cost and rate limits

*Built so far: the CPU bound, as `limitTransforms(n)` over any `Transformer`
(so a Photon layer, §10.6, would share it), applied by `transformerSharp`; and
the pixel limit, read from the header before decoding and answered as a 413
(`OriginalTooLarge` now names its unit, bytes or pixels). And `Admission`,
optional (read with `Effect.serviceOption`), asked after a `Variants` miss:
`admissionRateLimiter` over Effect's `RateLimiter`, `admissionRateLimit` over
the Workers binding (in `examples/cloudflare`, 100 a minute), a 429 with
`Retry-After`, and a limiter that fails admits, logged. The client is
`CF-Connecting-IP`, else the connection's address, or a `clientOf` the host
gives.*

The work is bounded before anything is limited:

- **The space is finite.** Widths, formats and qualities are ladders (§18.2),
  and an original must exist by hash, so a crawler can make at most
  `widths × formats × qualities` variants of the originals that exist.
- **Only a miss costs.** A request served from `Variants` or the edge is a
  read. Admission is checked after a `Variants` miss and before the original is
  read.
- **The CPU is bounded.** On Node, transforms run under an Effect `Semaphore`
  (permits of the cores); a request queued past its timeout is a 503 with
  `Retry-After`. On Cloudflare the binding does the work elsewhere.

`Admission` is a fourth, optional service:
`admit(request, client) => Effect<void, RateLimited>`, a 429 with
`Retry-After`. Its layers:

- Effect's `RateLimiter` (`effect/persistence`), a token bucket keyed by the
  client, over its memory store or Redis, for Node;
- Cloudflare's `ratelimits` binding (`RateLimit.limit({ key })` in
  workers-types), for Workers, which miniflare emulates, so the example tests
  it;
- none, by default.

The client key is `CF-Connecting-IP` on Cloudflare and a resolver the host
gives elsewhere; `X-Forwarded-For` is trusted only when the host says its proxy
sets it. A remote-original route (an allowlisted URL) is limited per host as
well as per client. Uploads are limited before the body is read: bytes, then
pixels (sharp's `limitInputPixels`; the binding reads at most 20 MB), the type
taken from the bytes and not the header, and a `foldkit-guard` policy on who
may.

Signed URLs were considered and rejected: the space is already finite and the
originals must exist, and a signature would make every image URL depend on a
secret and stop §19.2 from writing them out.

## 24. Recipes and primitives

### 24.1 `Recipes.Image` axes

*Built: `ratio` and `radius`. Not built, and dropped: `dim`, since CSS's
`light-dark()` takes colours only, a scheme the Model chooses sets
`color-scheme` with no selector to read, and an overlay on the frame would
darken the page beside a constrained image, the frame being wider than it;
and `defer`, since `loading="lazy"` already spares an image below the fold its
fetch, and an `img` has no subtree for `content-visibility` to skip.*

| Axis | Values | What it does |
| --- | --- | --- |
| `fit` | `cover` (default), `contain` | Built |
| `edge` | `none` (default), `line` | Built |
| `ratio` | `auto` (default), `square`, `video`, `portrait` | Crops to a ratio (the names `AspectRatio` uses), at `--fk-image-focus` |
| `radius` | the radius scale | Rounds the corners through the theme's radius tokens and `radius-factor` |
| `defer` | `none` (default), `offscreen` | `content-visibility: auto` and `contain-intrinsic-size` from the box, for long galleries |
| `dim` | `none` (default), `dark` | Lowers a photo's brightness in a dark scheme, through a knob, so a white photo does not glare |

*Built:* a **`Figure`** joins an `Image` and a caption, each in its own slot, for the
CMS block and the rich-text atom, which draw `figure` and `figcaption` by hand
today. A gallery is not a component: it is `foldkit-mixins`' layout pieces
around `Image`s, shown in the README. **`Avatar.widthOf(size)`** reads the
Avatar recipe's size tokens, so an `AvatarPicture`'s width is not written twice.

### 24.2 Primitives

- **An image preload Command**, in `foldkit-primitives/dom`: decodes a URL or a
  `Picture`'s `src` (`img.decode()`) and answers with a Message, so a lightbox
  or carousel switches to the next image only once it is ready, never to a
  blank frame. A Command, not a Mount: the Model decides to show the image, so
  the Message that leads there carries it (the rule for Model-caused DOM
  effects).
- **The connection**, beside `net/online`: `Save-Data` and the effective type
  as a subscription, so an application may choose `average` placeholders and
  its lower quality ladder entry. The server does not read `Save-Data`: a
  response that varied on it would break caching by URL.
- **Observers** are not used for loading (`loading="lazy"` is the browser's).
  The development audit (§21) is the one consumer, through a
  `PerformanceObserver`.
- **Breakpoints**: `Image.sizes(theme, …)` reads `breakpointWidths` (§6).

## 25. Response headers

*Built as written, in `foldkit-media/server`'s `headers.ts`: an `Answer`
union whose `statusOf` and `headersFor` are its exhaustive match, ETag and 304
before the store is read, and `Server-Timing` from a `Kept` value that now
says which layer held a variant. Two departures. The route takes its params as
text and the handler decodes them, because `HttpApi` answers a param that
fails to decode with a 400 of its own, whose headers nothing here can set; and
on a Worker the 404's `CDN-Cache-Control` has no effect, since nothing in
front of a Worker reads it and the Cache API layer keeps variants alone, so
§23's rate limits are what slow a crawler there. §25.3 waits on §19.2.*

What was built before it: a variant is sent with its `content-type` and
`public, max-age=31536000, immutable`; an error is sent with no cache header
at all. That leaves four gaps: an error is either cached by a browser's own
heuristics or asked for again forever; nothing answers a revalidation with a
304; an `img` with `crossorigin` (a canvas, the `ImageCropper`) cannot read the
pixels; and a variant written out at build (§19.2) is served by Pages with
`max-age=0, must-revalidate`, its default, so every return visit asks again
for every image (the CMS sandbox's `public/_headers` exists for that reason).

### 25.1 By response

| Response | `Cache-Control` | Also |
| --- | --- | --- |
| 200, a variant | `public, max-age=31536000, immutable` | `ETag: "<hash>/<spelling>"`; the shared headers below |
| 304, a variant revalidated | as the 200 | Answered from the `If-None-Match` alone, before `Variants` is read: the URL names the bytes |
| 400, a URL off the ladder or malformed | `public, max-age=31536000, immutable` | It is wrong for good, so the edge may keep the refusal and spare the server |
| 404, no original under this hash | `public, max-age=60` (edge), `no-store` to the browser | An upload may yet put it there; a short edge entry blunts a crawler |
| 413, the original too large | `public, max-age=31536000, immutable` | The bytes are fixed, so is the answer |
| 429, rate limited | `no-store` | `Retry-After` |
| 502, the transform failed | `no-store` | May be transient |
| 503, the allowance spent or the CPU queue full | `no-store` | `Retry-After` |
| 200, a remote original's variant (allowlisted URL, no hash) | `public, max-age=86400, stale-while-revalidate=604800` | `ETag` from the upstream's `ETag` and the spelling, revalidated upstream with `If-None-Match` |

The 404's two lifetimes are the case for `CDN-Cache-Control`, which a CDN
reads in place of `Cache-Control` and a browser ignores
(`Cloudflare-CDN-Cache-Control` for Cloudflare alone). On a Worker the edge is
the Cache API, which `Media` fills itself, so the server writes both headers
and the Cache API layer stores what `CDN-Cache-Control` allows.

### 25.2 On every image response

- `X-Content-Type-Options: nosniff`: the type comes from the format in the
  URL, never a guess.
- `Access-Control-Allow-Origin: *`: an image drawn with `crossorigin` (a
  canvas, `ImageCropper`, a colour picker reading a pixel) can be read. Images
  hold no credentials, so `*` is safe; `Vary: Origin` is not needed and would
  split the cache.
- `Cross-Origin-Resource-Policy: cross-origin`: a page isolated with
  `Cross-Origin-Embedder-Policy` can still embed them.
- `Timing-Allow-Origin: *`: the development audit (§21) and real-user
  monitoring read an image's transfer size and timing.
- `Server-Timing: media;desc="edge" | "kept" | "made"`: where the answer came
  from. Tests assert caching through it instead of reading the store, and an
  operator sees a cold cache in the browser's network panel.
- **No `Vary`.** The format is in the URL (§7.1), so nothing varies on
  `Accept`. A test asserts that no layer adds one.

### 25.3 Static hosts

*Built as `headersRule()` and `materialize`'s `headersFile` check.*

`Media.materialize` (§19.2) writes files but cannot write their headers. It
returns them as rules instead, `Media.headers()`: the lines a Pages
`_headers` file (or a Netlify one, the same format) needs for `/_image/*`, as
in §25.2 with the 200's `Cache-Control`. The host owns its one `_headers` file,
so the application includes the lines; the build fails when `/_image/` files
were written and the output's `_headers` has no rule for them. `?image` imports
(§11) are emitted under Vite's `/assets/`, which the host's existing assets rule
already covers.

### 25.4 Where it is decided

One function, `headersFor(answer)`, maps each answer of the handler (a variant
made, kept or served from the edge; each error) to its headers, used by the
handler, by the Cache API layer when it stores, and by `Media.headers()`. The
table above is its test, row by row, so the server, the edge and a static host
cannot disagree.

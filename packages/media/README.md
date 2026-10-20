# foldkit-media

Responsive images for Foldkit Plus. An image is a URL to write: given an
image's facts, a provider that knows a host's URL scheme, and how wide the image
is drawn, `foldkit-media` derives every attribute of its markup (`srcset`,
`sizes`, a `source` per format, the box it reserves, how eagerly it loads). It
performs no I/O.

## What it owns, and what it does not

- **It owns** the derivation: which widths are worth offering, what `sizes`
  says, which URL each variant has.
- **The original image** belongs to its source: a file in your repository, an
  upload your CMS stores, a third-party host.
- **An image's facts** (width, height, alpha, placeholder) are derived from the
  original once and stored beside it. This package reads them as an
  `ImageAsset`; it does not compute them.
- **Variants** belong to whoever makes them, a CDN or a resizing server, and
  are a cache: they can be made again from the original.
- **Which variant a page shows** is the browser's choice, from `srcset` and
  `sizes`. Nothing in your Model decides it.

The design, including the view, the resizing server and the build step still
to come, is in
[docs/design/media-DESIGN.md](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/media-DESIGN.md).

## The model

```text
ImageAsset + Provider + Layout  ->  Picture.derive  ->  attributes a view writes
   facts      URL scheme  how wide                        (no I/O)
```

One `Widths` ladder, carried by the provider, decides which widths exist. A
`Layout` picks the ones worth offering:

| Layout | Candidates | `sizes` |
| --- | --- | --- |
| `Fixed({ width })` | the ladder widths covering 1x and 2x | `${width}px` |
| `Constrained({ width })` | every width up to the one covering 2x | `(min-width: ${width}px) ${width}px, 100vw` |
| `FullWidth()` | the whole ladder | `100vw` |

A width above the original's own is described with the original's width, and
only the first such width is offered: a provider that does not enlarge answers
all of them with the same pixels.

## Sixty seconds

```ts
import { Option, Schema } from 'effect'
import { ImageAsset, Layout, Picture, Provider } from 'foldkit-media'

const hero = Schema.decodeUnknownSync(ImageAsset)({
  key: 'photos/hero.jpg',
  width: 2400,
  height: 1600,
  alpha: false,
  hash: null,
  placeholder: null,
})

const picture = Picture.derive({
  asset: hero,
  provider: Provider.cdnCgi(),
  layout: Layout.Constrained({ width: 720 }),
})

Option.map(picture, ({ img }) => img.srcset)
// "/cdn-cgi/image/width=320,format=auto,fit=scale-down/photos/hero.jpg 320w, …"
```

- `ImageAsset` is a Schema: decode stored facts with it. Its optional fields
  (`hash`, `placeholder`) are `null` when stored and `Option` in code.
- `Provider.cdnCgi()` writes Cloudflare's `/cdn-cgi/image/` URLs: the zone
  resizes the original itself, and no code of yours runs. It only writes URLs.
- `Picture.derive` returns `Option.none()` when the provider has no URL for any
  candidate; otherwise every attribute: `sources`, `img`, and the `ratio`.

## Providers

- **`Provider.cdnCgi({ zone?, widths?, quality? })`** — Cloudflare's resizing on
  a zone that has it on. It picks the format from `Accept`, so it offers no
  `source`s. A `key` may be a path on the zone or an absolute URL.
- **`Provider.fromFiles(files, { sources, fallback })`** — variants a build
  already wrote, as a table of `{ width, format, url }`. Its ladder is the
  widths it has; a variant it lacks is left out of `srcset`.

- **`Provider.hosted({ baseUrl?, widths?, sources?, fallback?, quality? })`** —
  this package's own server, for originals no CDN can fetch. A variant's URL is
  `/_image/<sha-256>/w640.avif`: the original is named by its content hash, so
  an asset without `hash` has no hosted URL. The format is in the URL, so every
  cache can key on it.

A provider is a plain value (`Provider.Provider`): `widths`, the `sources`
formats offered before the `img`, the `img`'s own `fallback` encoding, and a
`url` function answering `Option<string>`.

## Preloading the largest image

A page's largest image is found sooner from a preload in the head. Foldkit adds
no head tags, so `Picture.preload(picture)` returns the `<link rel="preload">`
for your SSR `head` function to include, from the same `Picture.derive` the view
draws with `priority: true`:

```ts
const preloadTag = Option.map(picture, Picture.preload)
```

It names the first `source`'s candidates with its `type`, so a browser that
cannot show that format skips the preload rather than fetch a file it will not
use. With `foldkit-mixins-ui`, `Image.preloadsIn` is a `Head` that reads the
same from the rendered page, so a page marks `priority` where it draws the
image and nothing more.

## Open Graph

`Picture.ogImage(asset, provider, origin)` is the absolute URL of a variant at
least 1200 wide for `og:image`: JPEG where the provider makes it, else WebP or
PNG, never AVIF, which not every link-preview fetcher reads.

## Placeholders

An `ImageAsset`'s `placeholder` is painted behind the image until it loads;
`Picture.derive` gives it as a CSS `background` value (`picture.placeholder`):

- `Placeholder.cases.Color.make({ value })` paints one CSS color.
- `ThumbHash` paints a blurred likeness decoded to a PNG data URL, a few
  kilobytes of HTML per image, so the page paints it with no request; or the
  same hash's average color, a few bytes. `Picture.derive` paints the
  likeness for the `priority` image and the color for the rest, so a grid of
  thumbnails stays small; `placeholder: 'detail' | 'average'` overrides it.
- `LowRes` paints the provider's smallest width of the image: no stored data,
  one small request.

An image with `alpha: true` gets no placeholder, since it would show through the
transparent pixels once the image loads.

## Focal point

An asset's `focus` (`{ x, y }`, 0 to 1 from the top left) is where a crop
keeps the subject; `picture.focus` writes it as `object-position` does
(`"25% 80%"`). It is the one fact an editor sets rather than one derived from
the original, and a stored asset without it reads as none.

## Loading

`priority: true` marks the page's largest image: `loading="eager"` and
`fetchpriority="high"`. Every other image is `loading="lazy"` and
`decoding="async"`, and its `sizes` begins with `auto, `, which lets a browser
that supports it use the laid-out width.

## The variant space

A server makes only what its `Variant.space({ widths?, formats?, qualities? })`
allows: the width ladder, a set of formats (AVIF and WebP by default) and a set
of qualities (none by default: no URL names one, and the encoder uses its own).
A request outside it is a 400, so an original has at most `space.size`
variants, whoever asks: 16 for `Variant.standard`. Give `Provider.hosted` and
the server the same space; the provider refuses, when defined, a format or
quality its server would refuse.

## The server

`foldkit-media/server` answers the route `Provider.hosted` writes, for
originals no CDN can fetch. `MediaApi` is its Effect `HttpApi`, one route;
the handler decodes the path with the space's Schema, the one the provider
encodes with, so a width off the ladder, a leading zero or a malformed hash is
a 400 before any work.

It needs three services, each a Layer you choose per host:

| Service | Job | Kind |
| --- | --- | --- |
| `Originals` | an original's bytes by content hash | authoritative; the server never writes it |
| `Transformer` | resize and encode, never above the original's width | does the work |
| `Variants` | variants already made, by the encoded request | a cache: clearing it costs time, not data |

A request is served from `Variants` when it can; otherwise the original is
read, transformed, kept, and served. A failure is its own response, never the
original in the variant's place, naming its kind (`{ "error": "NotFound" }`)
and nothing of the server's internals.

Every answer's headers come from one function, `headersFor`:

| Answer | Status | `Cache-Control` |
| --- | --- | --- |
| A variant (`ETag: "<hash>/<spelling>"`) | 200 | `public, max-age=31536000, immutable`: the path names the bytes |
| A request already holding it (`If-None-Match`) | 304 | the same; the store is not read |
| A URL outside the space | 400 | a year: it is wrong for good |
| No original under the hash | 404 | `no-store`, and `CDN-Cache-Control: public, max-age=60`: an upload may yet put it there |
| The original above `maxBytes` (20 MB by default) | 413 | a year: its bytes are fixed |
| The transformer failed | 502 | `no-store` |
| The client past its rate limit | 429 | `no-store`, `Retry-After` |
| The allowance spent | 503 | `no-store`, `Retry-After: 3600` |

Every image response also says `X-Content-Type-Options: nosniff`,
`Access-Control-Allow-Origin: *` (a canvas may read it), `Cross-Origin-Resource-Policy:
cross-origin` and `Timing-Allow-Origin: *`, and a variant says where it came
from in `Server-Timing` (`edge`, `store` or `made`). Nothing sends `Vary`: the
format is in the URL.

- `serveFetch({ space?, maxBytes?, layer: env => Layer })` is a Worker's fetch
  handler. The services are built from the request's bindings, once per
  environment. It 404s any other path, so route `/_image/` to it.
- `layer(options)` is the route as an Effect `HttpRouter` layer, for a Node
  server beside other routes.
- `variantsNone` keeps nothing, for a host with a cache of its own in front.

### Stores

`Originals` and `Variants` are kept in any Effect `KeyValueStore`
(`effect/persistence`), the store the application already has:

```ts
const stores = Layer.mergeAll(originalsKeyValueStore(), variantsKeyValueStore()).pipe(
  Layer.provide(KeyValueStore.layerFileSystem('./media')),
)
```

- `KeyValueStore.layerMemory` for tests, `layerFileSystem` on a disk (it
  needs the platform's `FileSystem` and `Path`, Node's on a server),
  `layerSql` over SQLite or D1, `keyValueStoreR2` (below) over R2.
- `variantsKeyValueStore({ prefix })` keeps a variant's bytes under
  `variants/<hash>/<spelling>`; its media type is the key's extension, so
  nothing else is stored. A store that fails a read or a write is logged and
  the request is answered by making the variant: variants are a cache.
- `originalsKeyValueStore({ prefix })` reads an original under its hash. A
  store that fails is a 500, not a 404: the original is the data.

### Rate limits

Only a miss costs work, so only a miss is limited: `Admission` is asked after
the store and before the original is read, and a variant already made is
served to anyone. It is optional; without it every miss is admitted.

- `admissionRateLimiter({ limit, window, algorithm? })` is Effect's
  `RateLimiter` (`effect/persistence`): `limit` misses a client per `window`,
  over `RateLimiter.layerStoreMemory` in one process or Redis across several.
- `admissionRateLimit(binding)` (`foldkit-media/cloudflare`) is a Workers
  rate-limit binding (`[[ratelimits]]`), whose limit and period are its
  configuration.
- A refused client gets a 429 with `Retry-After`. A limiter that fails admits
  the request, logged: a limiter that is down should not take the images down.
- The client is `CF-Connecting-IP`, else the connection's address. Pass
  `clientOf` to read your own proxy's header; `X-Forwarded-For` is the
  client's to write, so it is not read by default.

### On a Node server

`foldkit-media/sharp` gives the `Transformer` (sharp is an optional peer):

```ts
const media = layer().pipe(
  Layer.provide(
    Layer.mergeAll(
      transformerSharp({ concurrency: 4, maxPixels: 50_000_000 }),
      originalsKeyValueStore(),
      variantsKeyValueStore(),
    ),
  ),
  Layer.provide(KeyValueStore.layerFileSystem('./media')),
)
```

- `transformerSharp` reads an original's size from its header before decoding
  it, and refuses one above `maxPixels` (50 megapixels by default) with a 413,
  so a small file that inflates to a huge picture never reaches the heap. It
  never enlarges, and encodes at the URL's quality.
- At most `concurrency` transforms run at once (the machine's cores by
  default), through `limitTransforms(n)`, which wraps any `Transformer`.
- `layer` coalesces: concurrent misses for one variant share one transform
  and one write (`coalesce`, on by default here and off for `serveFetch`,
  since a Worker request cannot wait on another's).

### On Cloudflare

`foldkit-media/cloudflare` gives the three services from a Worker's bindings:

```ts
const answerImages = serveFetch<WorkerEnv>({
  layer: env =>
    Layer.mergeAll(
      originalsR2(env.MEDIA),
      transformerImages(env.IMAGES),
      variantsR2(env.MEDIA, { cache: caches.default }),
    ),
})
```

- `transformerImages(images)` is the Images binding: it scales down, never up,
  and names the format. Cloudflare's code for a spent allowance (9422) is the
  503; any other refusal is the 502, its reason logged.
- `keyValueStoreR2(bucket)` is an R2 bucket as a `KeyValueStore`, for the
  store adapters above or the application's own (`clear` and `size` list the
  bucket).
- `variantsR2(bucket, { prefix?, cache? })` is `variantsKeyValueStore` over
  it, so a variant made last month is not made, and billed, again; with
  `cache`, the Cache API is read first and filled from R2.
- `originalsR2(bucket)` streams an original rather than reading it into
  memory, unlike the general adapter.

Cloudflare bills each new width of each original once a month (format and
quality do not count), so the ladder is the cost: eight widths are at most
eight transformations an original. `examples/cloudflare` routes `/_image/` to
this server.

## Validation

Facts are untrusted input. `ImageAsset` refuses an image with no pixels, and a
`Placeholder.Color` that is anything but one CSS color (no `;`, no `url(`),
since it lands in a style the page writes.

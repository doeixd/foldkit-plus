# foldkit-media

A photo from a phone camera is several megabytes. Sent as it is, a phone on a
slow connection downloads far more than its screen can show, and the page jumps
when the photo finally arrives. Doing it properly means a smaller copy of the
file for each screen width, a modern format such as AVIF with a fallback for
older browsers, the `srcset` and `sizes` attributes that let the browser pick
the right copy, and the image's width and height written into the page so its
space is held while it loads.

`foldkit-media` does that for apps built with
[Foldkit](https://foldkit.dev/), a TypeScript framework whose views are plain
functions that return HTML. You import an image from your repository; at build
time a Vite plugin writes every size and format of it; and one call draws the
markup. You can see the result on the
[Image component page](https://foldkit-plus.pages.dev/components/image).

## Install

```bash
pnpm add foldkit-media foldkit-mixins-ui foldkit-mixins foldkit-primitives @foldkit/ui
pnpm add -D sharp
```

`foldkit-mixins-ui` is the widget package that draws the image; the next three
names are what it is built on. `sharp` reads and resizes your files during the
build, so it is only needed where you build.

## A first image: resize at build time

First, add the plugin to your Vite config. With no options it writes AVIF
copies and WebP ones for older browsers:

```ts standalone
// vite.config.ts
import { images } from 'foldkit-media/vite'
import { defineConfig } from 'vite'

export default defineConfig({ plugins: [images()] })
```

Then add `"foldkit-media/client"` to `compilerOptions.types` in your
`tsconfig.json`, so TypeScript knows what an image import holds.

<!-- docs-check standalone
import 'foldkit-media/client'
-->

Now this view draws `hero.jpg`, a 2400 by 1600 photo, in a column 800 pixels
wide (`h` is the HTML builder Foldkit hands every view):

```ts
import type { HtmlBuilder } from 'foldkit/html'
import { Layout } from 'foldkit-media'
import { Image } from 'foldkit-mixins-ui'

import hero from './hero.jpg?image'

export const banner = (h: HtmlBuilder<never>) =>
  Image.view(
    { ...hero, layout: Layout.Constrained({ width: 800 }), alt: 'The team at the finals' },
    h,
  )
```

The page gets this markup (file names shortened; in a build each is named by
its content, so a browser can keep it as long as it likes):

```html
<picture>
  <source type="image/avif"
          srcset="hero-320.avif 320w, hero-480.avif 480w, … hero-1920.avif 1920w"
          sizes="auto, (min-width: 800px) 800px, 100vw">
  <img src="hero-828.webp"
       srcset="hero-320.webp 320w, hero-480.webp 480w, … hero-1920.webp 1920w"
       sizes="auto, (min-width: 800px) 800px, 100vw"
       width="800" height="533" loading="lazy" decoding="async"
       alt="The team at the finals">
</picture>
```

A phone 400 pixels wide with a sharp screen (two device pixels to each CSS
pixel) downloads the 828-pixel AVIF instead of the 2400-pixel original. The
browser holds an 800 by 533 box from the first paint, so nothing below the
photo moves when it arrives.

### What the example did

- **`import hero from './hero.jpg?image'`** asks the plugin for the photo. At
  build time it measures the file once, writes a copy at each standard width up
  to the photo's own in each format, and hands your code the photo's size and
  the list of copies. Unchanged photos keep their cached copies. The
  development server makes the same variants when a page asks for one, under
  `/@foldkit-media/image/`, and answers any width or format outside the ladder
  with a 404.
- **`Layout.Constrained({ width: 800 })`** says how wide the image is drawn:
  at most 800 pixels, narrower on a narrow screen. That decides which copies
  are offered and what `sizes` says. `Layout.Fixed` is for an image that is
  always one width (an avatar), and `Layout.FullWidth` for one that spans the
  window.
- **`alt`** is required. An image either says something, in words, or is
  decoration, which you write as `alt: Image.decorative`.
- **`Image.view`** writes the markup above. Give the page's largest image
  `priority: true` and it loads first instead of lazily.

The markup above has no styling of its own. To give the image the shipped
look, which paints the photo's average colour in its box until the file
arrives (and a blurred preview behind a `priority` image), pass a style from
`Recipes`, which holds the package's ready-made looks:

```ts
import { Recipes } from 'foldkit-mixins-ui'

const ImageStyle = Recipes.Image.style({})

export const styledBanner = (h: HtmlBuilder<never>) =>
  Image.view(
    { ...hero, layout: Layout.Constrained({ width: 800 }), alt: 'The finals', style: ImageStyle },
    h,
  )
```

### When you have thousands of photos

Each copy is a file, so a site with thousands of photos on a static host can
run into its file limit (Cloudflare Pages allows 20,000 files on its free plan;
the standard widths and two formats make up to eighteen per photo). Write fewer
widths (`images({ widths: Widths.make([…]) })`), or keep the photos on a
resizing server or CDN instead.

## Choosing where images come from

A photo a user uploads, or one on another site, comes from a server or CDN
rather than your build. `Image.view` draws it the same way: instead of
`...hero`, you pass the photo's facts (`ImageAsset`, stored when it was
uploaded) and a *provider*, which writes the URL of each copy.

Under the hood, `Picture.derive` takes those three inputs — an `ImageAsset`, a
`Provider`, and a `Layout` — and computes every attribute (`sources`, `img`, and
the `ratio`) in memory as pure data.

| Layout | Candidates | `sizes` |
| --- | --- | --- |
| `Fixed({ width })` | Ladder widths covering 1x and 2x | `${width}px` |
| `Constrained({ width })` | Widths up to the one covering 2x | `(min-width: ${width}px) ${width}px, 100vw` |
| `FullWidth()` | The whole ladder | `100vw` |

A width above the original's own is described with the original's width, and
only the first such width is offered so providers that skip upscaling avoid
duplicate URLs.

- **`Provider.cdnCgi({ zone?, widths?, quality? })`** — Cloudflare's `/cdn-cgi/image/`
  URLs on a zone with image resizing enabled. It picks the format from `Accept`,
  so it writes `img` directly. A `key` may be a path on the zone or an absolute URL.
- **`Provider.fromFiles(files, { sources, fallback })`** — variants a build
  already wrote, as a table of `{ width, format, url }`. Its ladder is the
  widths it has; missing variants are omitted from `srcset`.
- **`Provider.hosted({ baseUrl?, space?, sources?, fallback?, quality? })`** —
  this package's own server, for originals no CDN can fetch. A variant's URL is
  `/_image/<sha-256>/w640.avif`: the original is named by its content hash, so
  it is a `Provider<HashedAsset>`, and facts without `hash` are a type error
  where the picture is derived. Decode stored facts with the `HashedAsset`
  Schema (an upload answers one), or narrow with `isHashed`. Because the format
  is in the URL, every cache keys on it directly.
- **`detect(url, { widths?, sources?, fallback?, quality? })`** from
  `foldkit-media/unpic` — an image on a host that resizes it (Shopify,
  Cloudinary, imgix, Contentful, and the rest [unpic](https://unpic.pics)
  knows), through unpic, an optional peer. It returns `Option<Provider>`: none
  for a host unpic lacks a provider for. By default `img` asks for `auto` and
  the host picks the format from `Accept`; a format requested as a `source` is
  dropped on a host that ignores it (such as Shopify). The asset's `key` is the
  image's URL, and its size comes from `factsOf(url)` (see [Reading an image's facts](#reading-an-images-facts)).

  ```ts standalone
  import { Option, Schema } from 'effect'
  import { ImageAsset, Layout, Picture, Provider } from 'foldkit-media'
  import { detect } from 'foldkit-media/unpic'

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

  const shopify = detect('https://cdn.shopify.com/s/files/1/0/products/shirt.jpg')
  Option.isSome(shopify) // true
  ```

A provider is a plain value (`Provider.Provider`): `widths`, the `sources`
formats offered before `img`, `img`'s own `fallback` encoding, and a `url`
function returning `Option<string>`.

## Ownership of images, variants, and files

- **This package owns** the markup derivation: which widths to offer, what
  `sizes` says, and each variant URL.
- **The original image** belongs to its source: a file in your repository, an
  upload your CMS stores, or a third-party host.
- **An image's facts** (`width`, `height`, `alpha`, `placeholder`) are computed
  from the original once via `describe` where an original enters and stored
  beside it; the view only reads them as an `ImageAsset`.
- **Variants** belong to whoever builds them (your Vite build, a CDN, or the
  resizing server) and are a cache that can always be rebuilt from the original.
- **An uploaded file** (any file, not an image to resize) belongs to `FileStore`
  with the facts the upload route recorded; your application decides which row
  holds it and who may read it ([Uploads for any file](#files)).
- **Which variant loads** is the browser's choice from `srcset` and `sizes`;
  your Model stays free of media queries and chosen widths.
- **An icon's drawing** belongs to its SVG set (Lucide or your SVG folder); the
  build reads and checks it once, and `foldkit-mixins` theme `icon` tokens pick
  which drawing a component renders.

## Preloading the largest image

A page's largest image is discovered sooner from a preload tag in `<head>`.
`Picture.preload(picture)` returns the `<link rel="preload">` element for your
SSR `head` function from the same `Picture.derive` the view draws with
`priority: true`:

```ts standalone
import { Option } from 'effect'
import { Picture } from 'foldkit-media'

export const preloadTag = (picture: Option.Option<Picture.Picture>) =>
  Option.map(picture, Picture.preload)
```

It names the first `source`'s candidates with its `type`, so a browser that
skips that format also skips the preload. With `foldkit-mixins-ui`,
`Image.preloadsIn` is a `Head` that reads the same from the rendered page, so a
page only marks `priority` where it draws the image.

## Open Graph

`Picture.ogImage(asset, provider, origin)` returns the absolute URL of a
variant at least 1200 wide for `og:image`: JPEG where the provider makes it, else
WebP or PNG, avoiding AVIF for broader link-preview compatibility.

## Placeholders

An `ImageAsset`'s `placeholder` is painted behind the image until it loads;
`Picture.derive` gives it as a CSS `background` value (`picture.placeholder`):

- `Placeholder.cases.Color.make({ value })` paints one CSS color.
- `ThumbHash` paints a blurred likeness decoded to a PNG data URL, a few
  kilobytes of HTML per image, so the page paints it with no extra request; or
  the same hash's average color in a few bytes. `Picture.derive` paints the
  likeness for `priority` images and the color for the rest, keeping thumbnail
  grids small; `placeholder: 'detail' | 'average'` overrides it.
- `LowRes` paints the provider's smallest width of the image: no stored data,
  one small request.

Images with `alpha: true` omit placeholders so background color fails to bleed
through transparent pixels after load.

## Focal point

An asset's `focus` (`{ x, y }`, 0 to 1 from the top left) is where a crop
keeps the subject; `picture.focus` formats it as `object-position`
(`"25% 80%"`). Editors set it on the asset; an unset focus reads as `Option.none()`.

## Loading

`priority: true` marks the page's largest image: `loading="eager"` and
`fetchpriority="high"`. Every other image is `loading="lazy"` and
`decoding="async"`, and its `sizes` begins with `auto, `, letting supporting
browsers use the laid-out width.

## Reading an image's facts

An `ImageAsset`'s facts are derived from its original once, where it enters,
and stored beside it. `describe` lives in the core package; each inspector lives
in the subpath for its runtime (`/sharp`, `/browser`, `/cloudflare`), and
`factsOf` lives in `foldkit-media/server`:

- `describe(key, bytes)` reads them through the `Inspector`: size, alpha, the
  SHA-256 hash, and a ThumbHash when the inspector generates thumbnails.
- `inspectorSharp({ maxPixels? })` (Node) reads all of them; alpha is true only
  when a pixel is transparent, so opaque PNGs still receive placeholders.
- `inspectorBrowser({ maxPixels? })` (`foldkit-media/browser`) reads them in
  the browser or a web worker, with its own decoder: an editor describes a
  dropped file (including ThumbHash and hash) before upload and stores its facts
  beside the image (such as a rich-text `Image`'s `asset`). Unrecognized formats
  fail decoding.
- `inspectorImages(binding)` (Cloudflare) reads the size from `info` without
  billing a transformation. It skips thumbnails and marks non-JPEG images as
  having alpha so placeholders remain accurate.
- `factsOf(url, { allow, maxBytes?, cache?, fetch? })` describes an image named
  only by URL (such as a rich-text image), giving it dimensions like any other.
  It accepts only `https` URLs on exact hosts in `allow` at the default port,
  re-checking redirects and bounding streamed bytes. Given a `KeyValueStore` as
  `cache`, facts are cached by URL and revalidated with `ETag`.

## Variant spaces and revisions

A server makes only what its `Variant.space({ widths?, formats?, qualities?, revision? })`
allows: the width ladder, a set of formats (AVIF and WebP by default), and a set
of qualities (omitted by default, leaving encoding quality to the encoder).
Requests outside the space return 404 before any transform runs, bounding an
original to at most `space.size` variants (16 for `Variant.standard`). Share one
provider across pages and server so both agree: define
`const media = Provider.hosted({ space })` once and pass it to `serveFetch`'s
`images.provider` (or `layer({ provider })`).

A variant's URL names its parameters (hash, width, format, quality), and its
response is cached for a year as immutable. Because encoder upgrades can change
output bytes, changes to how variants are built belong in a new `revision` on
the space rather than behind existing URLs. `Variant.space({ revision: 1 })`
writes `w640.r1.avif`; revision 0 (the default) omits the revision segment so
existing URLs keep their spelling. A server at revision 2 still answers earlier
revisions: serving stored earlier variants while present, or redirecting (`302`)
to the current revision with a short cache header for rolling deploys. Requests
for a future revision return 404 with the same short cache header.

## Running the resizing server

`foldkit-media/server` serves the `/_image/` route that `Provider.hosted`
writes, for originals no CDN can fetch. `MediaApi` defines the Effect `HttpApi`
endpoint; the handler decodes each path with the space's Schema. URLs outside
the grammar (leading zeros, malformed hashes) return 400; well-formed URLs
outside the configured space return 404. Variants cache for a year; error
responses cache for one minute at the edge and are marked `no-store` for
browsers so rolling deploys recover quickly.

Variant URLs carry unguessable SHA-256 hashes, though every page rendering an
image publishes its hash; keep sensitive files out of public variant routes.

The server needs three Effect services, each a Layer you choose per host:

| Service | Job | Kind |
| --- | --- | --- |
| `Originals` | Original bytes by content hash | Authoritative; read-only |
| `Transformer` | Resize and encode without enlarging | Stateless compute |
| `Variants` | Cached variants by encoded request | Rebuildable cache |

A request is served from `Variants` when cached; otherwise the original is
read, transformed, stored, and served. Failures return structured error JSON
(`{ "error": "NotFound" }`) without server internals.

Every response gets its headers from `headersFor`. Unhandled defects (such as
failing stores or missing Worker layers) produce a framework 500 response.

| Answer | Status | `Cache-Control` |
| --- | --- | --- |
| Variant (`ETag: "<hash>/<spelling>"`) | 200 | `public, max-age=31536000, immutable` |
| Conditional hit (`If-None-Match`) | 304 | Same as 200; skips reading bytes |
| Malformed URL | 400 | `no-store` (`CDN-Cache-Control: public, max-age=60`) |
| Width/format outside space | 404 | Same as 400; next release may add it |
| Retired revision not in store | 302 | Redirect to current revision; 60s CDN cache |
| Missing original | 404 | Same as 400; upload may arrive later |
| Original over `maxBytes` (20 MB) | 413 | Same as 400 |
| Transformer failure | 502 | `no-store` |
| Rate limited | 429 | `no-store`, `Retry-After` |
| Quota spent | 503 | `no-store`, `Retry-After: 3600` |

Every image response also sends `X-Content-Type-Options: nosniff`,
`Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy: cross-origin`,
`Timing-Allow-Origin: *`, and `Server-Timing` (`edge`, `store`, or `made`).
Because the format is encoded in the URL path, `Vary` is left unset.

- `serveFetch({ images?, uploads?, otherwise? })` builds a Worker fetch handler
  owning `/_image/` and `/_media/`. Unmatched subpaths and `OPTIONS` preflights
  under those prefixes return 404; other paths route to `otherwise` (404 by
  default).
- `layer({ provider?, maxBytes?, coalesce? })` mounts the route as an Effect
  `HttpRouter` layer for Node servers.
- `variantsNone` skips variant caching for deployments fronted by an external
  cache.

### Stores

`Originals` and `Variants` read from any Effect `KeyValueStore`
(`effect/persistence`):

```ts
import { NodeServices } from '@effect/platform-node'
import { Layer } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { originalsKeyValueStore, variantsKeyValueStore } from 'foldkit-media/server'

const stores = Layer.mergeAll(originalsKeyValueStore(), variantsKeyValueStore()).pipe(
  Layer.provide(KeyValueStore.layerFileSystem('./media')),
  Layer.provide(NodeServices.layer),
)
```

- `KeyValueStore.layerMemory` for tests, `layerFileSystem` on disk (requiring
  `FileSystem` and `Path`), `layerSql` over SQLite or D1, or `keyValueStoreR2`
  over R2.
- `variantsKeyValueStore({ prefix })` stores variants under
  `variants/<hash>/<spelling>`, deriving media type from the key extension. Read
  or write errors emit a `StoreFailed` diagnostic and fall back to transforming
  from the original.
- `originalsKeyValueStore({ prefix })` reads originals by content hash. Store
  failures return 500 rather than 404 so missing storage fails loudly.

### Rate limits

Only cache misses trigger transforms, so `Admission` runs after a cache miss and
before reading the original. Cached variants serve all clients without counting
against rate limits:

- `admissionRateLimiter({ limit, window, algorithm? })` wraps Effect's
  `RateLimiter` (`effect/persistence`): `limit` misses per client per `window`,
  backed by memory or Redis.
- `admissionRateLimit(binding)` (`foldkit-media/cloudflare`) wraps a Cloudflare
  Workers rate-limit binding (`[[ratelimits]]`).
- Exceeding the limit returns `429` with `Retry-After`. Limiter failures emit
  `AdmissionFailed` and admit the request so a down limiter keeps images online.
- Clients are identified by `CF-Connecting-IP`, then connection address. Pass
  `clientOf` to read another proxy header (`X-Forwarded-For` is ignored by
  default since clients can spoof it).

### On a Node server

`foldkit-media/sharp` provides the `Transformer` (with `sharp` as an optional
peer):

```ts
import { NodeServices } from '@effect/platform-node'
import { Layer } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { layer, originalsKeyValueStore, variantsKeyValueStore } from 'foldkit-media/server'
import { transformerSharp } from 'foldkit-media/sharp'

const media = layer().pipe(
  Layer.provide(
    Layer.mergeAll(
      transformerSharp({ concurrency: 4, maxPixels: 50_000_000 }),
      originalsKeyValueStore(),
      variantsKeyValueStore(),
    ),
  ),
  Layer.provide(KeyValueStore.layerFileSystem('./media')),
  Layer.provide(NodeServices.layer),
)
```

- `transformerSharp` and `inspectorSharp` normalize EXIF orientation so
  portrait phone photos are measured, resized, and placeheld upright.
- `transformerSharp` checks header dimensions before decoding and rejects images
  above `maxPixels` (50 megapixels by default) with `413` before allocating pixel
  buffers. It caps output width at the original's width and encodes at the URL's
  quality.
- `limitTransforms(n)` caps concurrent transforms on any `Transformer` (defaults
  to CPU core count).
- `layer` coalesces concurrent misses for the same variant into one transform
  and store write (`coalesce` defaults to `true` on Node and `false` in
  `serveFetch`, where Worker requests run in separate request contexts).

### Uploads

Uploaded images enter through `POST /_media/upload` as raw `image/*` request
bodies. The route streams up to `maxBytes` (20 MB by default), extracts facts
with `Inspector`, stores the bytes under their SHA-256 hash alongside
`StoredFacts`, and returns a `201` JSON `HashedAsset`. The variant server can
serve that hash immediately.

**Authorization is required.** `UploadPolicy.admit(request, route)` runs before
reading any body bytes, receiving `'Upload'` or `'DescribeUrl'`. It fails with
`UploadForbidden` (`403`) or `UploadUnauthenticated` (`401`) when identity is
missing so clients know to refresh a session.

<!-- docs-check standalone
import { Effect, Option, Schema } from 'effect'
import { Guards } from 'foldkit-guard'
const User = Schema.Struct({ id: Schema.String, role: Schema.Literals(['admin', 'editor']) })
type User = typeof User.Type
const G = Guards.declare(
  'Media',
  User,
  guard => ({ isEditor: guard.principal() }),
  { key: user => user.id, unguarded: 'deny' },
)
const Policy = G.implement({
  isEditor: principal => Option.exists(principal, user => user.role === 'editor'),
})
declare const resolve: (request: Request) => Effect.Effect<Option.Option<User>>
-->
```ts
import { Layer } from 'effect'
import { GuardMedia } from 'foldkit-guard/media'
import {
  uploadLayer,
  uploadPolicyAny,
  uploadPolicyBearer,
  uploadsKeyValueStore,
} from 'foldkit-media/server'
import { inspectorSharp } from 'foldkit-media/sharp'

const uploads = uploadLayer({ maxBytes: 10 * 1024 * 1024 }).pipe(
  Layer.provide(
    Layer.mergeAll(
      uploadsKeyValueStore(),
      inspectorSharp(),
      uploadPolicyAny(
        uploadPolicyBearer(process.env['UPLOAD_TOKEN']),
        GuardMedia.uploadPolicy(Policy, { resolve, Upload: [G.isEditor] }),
      ),
    ),
  ),
)
```

- `uploadPolicyBearer(secret)` accepts `Authorization: Bearer <secret>` using
  constant-time digest comparison and rejects requests while the secret is unset
  or empty.
- `GuardMedia.uploadPolicy` (`foldkit-guard/media`) authorizes each route using
  your guard set's principal guards (`G`, `Policy`) and session `resolve` (such
  as `AuthServer.resolver` from `foldkit-auth/server`). Routes omitted from the
  map reject all requests; here editors can upload while URL fact lookups stay
  closed.
- `uploadPolicyAny(a, b, …)` tries policies in order, admitting on the first
  match or returning the last refusal.
- Custom policies use `Layer.succeed(UploadPolicy, { admit })`.

**Registering an upload.** Mutations receive only the submitted hash and look
up server-recorded facts via `StoredFacts.get(hash)` (backed by
`storedFactsKeyValueStore()` or `storedFactsR2(bucket)`), returning `none` if
no upload recorded that hash. Client-submitted editor metadata such as a focal
point travels alongside the hash.

`uploadsKeyValueStore()` and `uploadsR2(bucket)` share backing stores with
originals, and `serveFetch`'s `uploads` mounts the routes in a Worker. Refusals
return minimal status codes with `no-store` (`401`/`403` from policy, `415` for
unrecognized image bodies, `413` above byte/pixel limits, `400` for truncated
streams). Requiring `image/*` without CORS `OPTIONS` prevents cross-origin form
or cookie uploads from other sites.

In the browser, `upload(file, { url?, headers? })` (`foldkit-media/browser`)
returns a `Stream` emitting `Progressed { loaded, total }` and then
`Uploaded { asset }`. Failures emit `UploadFailed { reason, status }` (`Forbidden`,
`Unauthenticated`, `TooLarge`, `Unsupported`, `Malformed`, `Network`, or
`Unexpected`). It uses `XMLHttpRequest` for upload progress and cancels when the
Effect stream is interrupted:

```ts
import { Effect, Match, Stream } from 'effect'
import { upload } from 'foldkit-media/browser'

const send = (file: File) =>
  upload(file).pipe(
    Stream.runForEach(event =>
      Effect.sync(() =>
        Match.valueTags(event, {
          Progressed: ({ loaded, total }) => console.log(`${loaded} of ${total} bytes`),
          Uploaded: ({ asset }) => console.log('kept as', asset.key),
        }),
      ),
    ),
  )
```

Same-origin browser uploads send the page's session cookie automatically; reserve
bearer tokens for deploy scripts so secrets stay off client pages.

Remote image URLs get their facts from `GET /_media/facts?url=`, protected by
the same `UploadPolicy` with `'DescribeUrl'`. Configure allowed hosts in
`uploadLayer({ facts: { allow } })` (empty by default). Unreachable or invalid
images return `422`.

### Files

Forms often need arbitrary attachments (PDFs, spreadsheets). `fileLayer` adds a
separate route set at `POST /_media/files` and `GET /_media/files/:key`, storing
bytes in `FileStore` under random 32-hex keys distinct from the 64-hex hashes
used by `/_image/`.

**Ownership.** The upload route owns the bytes and recorded metadata (`key`,
`name`, `type`, `size`). Your application owns which database row holds a
`FileAsset` and who may download it:

1. The browser runs `uploadFile(file)` to `POST /_media/files`, receiving a
   minted `FileAsset`.
2. Your form submits the `FileAsset`; your server mutation authorizes the write
   and calls `keepOrClaim` to bind the file to the row.
3. `GET /_media/files/:key` checks `FileReadPolicy` for the requester and
   streams the file as a download attachment.

Each upload receives a fresh 128-bit random key and stores its own copy so
duplicate uploads reveal nothing about existing files.

```ts
import { Effect, Layer, Option } from 'effect'
import { SecureRandom } from 'effect/crypto'
import { KeyValueStore } from 'effect/persistence'
import type { FileAsset } from 'foldkit-media'
import {
  FileUploadPolicy,
  UploadForbidden,
  fileLayer,
  fileReadPolicy,
  filesKeyValueStore,
  keepOrClaim,
} from 'foldkit-media/server'

// Your own: who a request is, and which rows hold which file.
declare const userOf: (headers: Headers) => Option.Option<string>
declare const rowHolding: (key: string) => Effect.Effect<Option.Option<{ readonly owner: string }>>

const files = fileLayer({ accept: ['application/pdf', 'image/*'] }).pipe(
  Layer.provide(
    Layer.mergeAll(
      filesKeyValueStore(),
      Layer.succeed(FileUploadPolicy, {
        admit: request =>
          Option.match(userOf(new Headers(request.headers)), {
            onNone: () => Effect.fail(new UploadForbidden({})),
            onSome: Effect.succeed,
          }),
      }),
      fileReadPolicy({
        resolve: request => Effect.succeed(userOf(new Headers(request.headers))),
        read: (user, key) =>
          rowHolding(key).pipe(
            Effect.map(row =>
              Option.exists(row, ({ owner }) => Option.contains(user, owner)),
            ),
          ),
      }),
    ),
  ),
  Layer.provide(Layer.merge(KeyValueStore.layerMemory, SecureRandom.layerWebCrypto)),
)

// In the mutation that saves a row, once the write is authorized:
const attached = (held: Option.Option<FileAsset>, submitted: FileAsset, user: string) =>
  keepOrClaim(held, submitted, user)
```

- **`FileUploadPolicy.admit(request)`** resolves the uploader's stable owner ID
  before reading bytes. Blank IDs fail with `403` and emit `OwnerMissing`.
- **`fileReadPolicy({ resolve, read })`** authenticates the reader first (returning
  `401` `FileUnauthenticated` when unknown), then checks `read(user, key)`.
  Refused reads return `404` identically to missing keys so key existence stays
  hidden.
- **`keepOrClaim(held, submitted, owner)`** keeps an unchanged key in place when
  re-saving a row, or claims a newly uploaded key from `FileStore` within
  `claimWithin` (24 hours by default, failing `FileUnclaimed` for expired,
  claimed, or foreign keys). Call it after authorizing the mutation so refused
  writes leave keys unclaimed.

**Downloads execute safely.** Responses use `application/octet-stream`,
`X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`,
`Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: private, no-store`,
and an attachment `Content-Disposition` filename from the stored record.

**Upload validation.** Bodies arrive as `application/octet-stream` with headers
`x-foldkit-file-name` (percent-encoded UTF-8, up to 255 bytes, free of control
chars or slashes) and `x-foldkit-file-type` (parsed media type matched against
required `accept`, or `'*'`). Because clients declare the type, inspect file
contents directly with `inspect: (bytes, declared) => Effect<void, FileRefused>`
when you need magic-number checks.

| Answer | Why |
| --- | --- |
| `201` | Kept; body is the `FileAsset` |
| `400` | Invalid/missing name or truncated body |
| `401` / `403` | Unauthenticated or policy rejected |
| `408` | Slower than `minBytesPerSecond` (32 KB/s over 10s) |
| `413` | Exceeded `maxBytes` (20 MB) |
| `415` | Wrong content type, outside `accept`, or `inspect` failed |
| `429` | `Admission` rate limit reached (`Retry-After`) |
| `503` | Concurrency slots full (`maxConcurrent`: 2) |

**Memory.** Uploads hold roughly twice their size in memory while streaming (80 MB
peak at defaults, fitting inside a 128 MB Worker). Downloads also buffer in
memory, so serve high-traffic large files via signed R2 URLs instead.

In the browser, `uploadFile(file, { url?, headers? })` (`foldkit-media/browser`)
emits `Progressed` and `FileUploaded { asset }`, adding `TooSlow`, `RateLimited`,
and `Busy` failure reasons. Mount in a Worker via `serveFetch`'s `files` option.

### Written out at build

Static sites without an image server can emit every referenced variant during
build using `materialize` inside `foldkit-ssr`'s `staticSite` `emit`:

```ts
import { NodeServices } from '@effect/platform-node'
import { readFileSync } from 'node:fs'
import { Layer } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import {
  materialize,
  originalsKeyValueStore,
  serveFetch,
  variantsKeyValueStore,
} from 'foldkit-media/server'
import { transformerSharp } from 'foldkit-media/sharp'
import type { BuiltPage } from 'foldkit-ssr/vite'

const staticMedia = serveFetch<object>({
  images: {
    layer: () =>
      Layer.mergeAll(transformerSharp(), originalsKeyValueStore(), variantsKeyValueStore()).pipe(
        Layer.provide(KeyValueStore.layerFileSystem('.media')),
        // The disk itself: Node's file system and paths.
        Layer.provide(NodeServices.layer),
      ),
  },
})
const env = {}

export const site = {
  // …
  emit: (pages: ReadonlyArray<BuiltPage>) =>
    materialize({
      pages,
      fetch: request => staticMedia(request, env),
      headersFile: readFileSync('public/_headers', 'utf8'),
    }),
}
```

- Missing or broken variants fail the build by name.
- Exceeding `maxFiles` (20,000 by default) fails the build.
- Include `headersRule()` in `public/_headers` so static hosts serve variants
  with immutable caching; `materialize` verifies `headersFile` contains it.
- Keeping `Variants` on disk lets repeat builds skip re-encoding.

### On Cloudflare

`foldkit-media/cloudflare` wires R2, Cloudflare Images, and Workers rate
limiting into `serveFetch`:

```ts standalone
import type { ImagesBinding, R2Bucket, RateLimit } from '@cloudflare/workers-types'
import { Layer } from 'effect'
import {
  admissionRateLimit,
  inspectorImages,
  originalsR2,
  transformerImages,
  uploadsR2,
  variantsR2,
} from 'foldkit-media/cloudflare'
import { serveFetch, uploadPolicyBearer } from 'foldkit-media/server'

interface WorkerEnv {
  readonly MEDIA: R2Bucket
  readonly IMAGES: ImagesBinding
  readonly LIMITER: RateLimit
  readonly UPLOAD_TOKEN: string
}

export default {
  fetch: serveFetch<WorkerEnv>({
    images: {
      layer: env =>
        Layer.mergeAll(
          originalsR2(env.MEDIA),
          transformerImages(env.IMAGES),
          variantsR2(env.MEDIA, { cache: true }),
          admissionRateLimit(env.LIMITER),
        ),
    },
    uploads: {
      layer: env =>
        Layer.mergeAll(
          uploadsR2(env.MEDIA),
          inspectorImages(env.IMAGES),
          uploadPolicyBearer(env.UPLOAD_TOKEN),
        ),
    },
    // The application's own routes.
    otherwise: async () => new Response('Not found', { status: 404 }),
  }),
}
```

- `transformerImages(images)` scales down without enlarging and returns `503` on
  quota exhaustion (code `9422`) or `502` with an `ImageFailed` diagnostic.
- `keyValueStoreR2(bucket)` exposes an R2 bucket as an Effect `KeyValueStore`.
- `variantsR2(bucket, { prefix?, cache? })` stores variants in R2 so each size
  is generated once, optionally checking the Worker Cache API (`cache: true` or
  a custom `Cache` instance) first.
- `originalsR2(bucket)` streams originals directly to avoid buffering full files
  in Worker memory.

Cloudflare bills each unique width per original once per month, so a smaller
width ladder caps monthly transformation cost. See
[`examples/cloudflare`](../../examples/cloudflare) for a complete Worker setup.

### Diagnostics

When the server recovers from a recoverable failure, it emits a typed
`MediaDiagnostic` through `foldkit-surface`'s `Diagnostics.Reporter` (which
defaults to Effect logging and `wrangler tail`):

| `_tag` | `level` | When |
| --- | --- | --- |
| `StoreFailed` | `error` | A variant, edge, or facts cache read/write failed and fell back |
| `AdmissionFailed` | `error` | Rate limiter failed; request admitted without limiting |
| `ImageFailed` | `error` / `warning` | Transform failed (`error`), or upload inspection rejected a body (`warning`) |
| `FactsUnanswered` | `warning` | Facts route returned `Unavailable` for `url` with `reason` |
| `RequestDefect` | `error` | Unhandled defect answered 500 by `serveFetch` |

Provide a custom reporter as an Effect Layer alongside your media layers:

```ts
import { Effect, Layer } from 'effect'
import { Diagnostics } from 'foldkit-surface'

serveFetch<WorkerEnv>({
  images: {
    layer: env =>
      Layer.mergeAll(
        originalsR2(env.MEDIA),
        transformerImages(env.IMAGES),
        variantsR2(env.MEDIA, { cache: true }),
        Layer.succeed(Diagnostics.Reporter, diagnostic =>
          Effect.logError(`media: ${diagnostic._tag}: ${diagnostic.message}`),
        ),
      ),
  },
})
```

In tests, `Diagnostics.collect()` gives a reporter and the array it records.

## Icons

Icons are stored as `IconData` (`viewBox`, root paint attributes, and sanitized
node descriptors) instead of raw HTML strings. Your Vite build reads them from
Iconify packages or your own SVG directory:

```ts standalone
// vite.config.ts
import { icons } from 'foldkit-media/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [icons({ iconify: ['lucide'], folders: { app: './src/icons' } })],
})
```

```ts sketch
import { arrowLeft } from 'virtual:foldkit-icons/lucide'
import { logo } from 'virtual:foldkit-icons/app'
```

`iconify` reads `@iconify-json/<prefix>` packages, and `folders` converts SVG
files like `star-filled.svg` to `starFilled`. Bundlers tree-shake unused icons,
and the plugin emits `foldkit-icons.d.ts` (configurable via `dts`) so unknown
icon names fail typechecking.

Draw icons inline with `Icon.draw(icon, h)` (`1em` square by default, with
`aria-hidden`) or through `foldkit-mixins-ui`'s `Icon.view({ icon, label? })`.
Use `Icon.maskUrl(icon)` for CSS mask URLs.

Because icons render inline, the parser enforces a presentational allowlist and
rejects scripts, styles, `<foreignObject>`, animations, event handlers, classes,
external `href`/`url()` references, non-color/transform CSS functions, and CSS
escapes. It also strips metadata, comments, root dimensions, and `<title>`/`<desc>`.
Bad SVGs in `folders` fail the build; rejected Iconify icons are omitted with
type-level diagnostics.

Libraries that ship without an app Vite plugin parse SVGs ahead of time with
`foldkit-media/icons`:

```ts
import { Icon } from 'foldkit-media'
import { parse } from 'foldkit-media/icons'

const check = parse(
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5"/></svg>',
  'check',
)
Icon.maskUrl(check) // url("data:image/svg+xml,…") for a mask
```

`fromIconify(set, name)` reads one icon from an Iconify JSON set. `Icon.key(icon)`
computes a stable content key, and `Icon.prefixIds(icon, prefix)` scopes
internal SVG IDs so multiple icons on a page avoid gradient/clip-path collisions
(`Icon.draw` handles both automatically; pass `key` to distinguish duplicates).

## Validation

Facts decoded from `ImageAsset` are treated as untrusted input: zero or
negative pixel dimensions are rejected, and `Placeholder.Color` accepts only a
single CSS color value (rejecting `;` and `url(`) before writing inline styles.

## Next

- Style and render images and icons in views: [`foldkit-mixins-ui`](../mixins-ui/README.md)
- Authorize image and file uploads with your user roles: [`foldkit-guard` uploads](../guard/README.md#uploads)
- See a full Cloudflare Worker serving media alongside Remote and Sync: [`examples/cloudflare`](../../examples/cloudflare)

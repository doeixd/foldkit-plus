# foldkit-media

Responsive images for Foldkit Plus. An image is a URL to write: given an
image's facts, a provider that knows a host's URL scheme, and how wide the image
is drawn, `foldkit-media` derives every attribute of its markup (`srcset`,
`sizes`, a `source` per format, the box it reserves, how eagerly it loads). It
performs no I/O. Icons are its second half: an icon is data (`IconData`), read
from an SVG file or an Iconify set at build time and checked there, then drawn
inline or as a mask ([Icons](#icons)). Its subpaths add the I/O around both:
a resizing server, its Cloudflare and Node layers, uploads, and Vite plugins.

## What it owns, and what it does not

- **It owns** the derivation: which widths are worth offering, what `sizes`
  says, which URL each variant has.
- **The original image** belongs to its source: a file in your repository, an
  upload your CMS stores, a third-party host.
- **An image's facts** (width, height, alpha, placeholder) are derived from the
  original once and stored beside it. This package reads them as an
  `ImageAsset`; `describe` computes them where an original enters, while the
  view only reads them.
- **Variants** belong to whoever makes them, a CDN or a resizing server, and
  are a cache: they can be made again from the original.
- **An uploaded file** (any file, not an image to resize) belongs to the
  `FileStore`, with the facts the route recorded; which row holds it, and who
  may read it, is the application's ([Files](#files)).
- **Which variant a page shows** is the browser's choice, from `srcset` and
  `sizes`. Nothing in your Model decides it.
- **An icon's drawing** belongs to its set (Lucide, an application's SVG
  folder); this package reads and checks it once, at build, and the theme's
  `icon` tokens (`foldkit-mixins`) choose which drawing a component shows.

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

- **`Provider.hosted({ baseUrl?, space?, sources?, fallback?, quality? })`** —
  this package's own server, for originals no CDN can fetch. A variant's URL is
  `/_image/<sha-256>/w640.avif`: the original is named by its content hash, so
  it is a `Provider<HashedAsset>`, and facts without `hash` are a type error
  where the picture is derived. Decode stored facts with the `HashedAsset`
  Schema (an upload answers one), or narrow with `isHashed`. The format is in the URL, so every
  cache can key on it.

- **`detect(url, { widths?, sources?, fallback?, quality? })`** from
  `foldkit-media/unpic` — an image on a host that resizes it (Shopify,
  Cloudinary, imgix, Contentful, and the rest [unpic](https://unpic.pics)
  knows), through unpic, an optional peer. It answers `Option<Provider>`: none
  for a host unpic does not know. By default the `img` asks for `auto` and the
  host picks the format from `Accept`; a format asked as a `source` is left out
  on a host that ignores it (Shopify's), and an asset on another host gets no
  URL. The asset's `key` is the image's URL, and its size comes from
  `factsOf(url)` (see Facts, below).

  ```ts
  import { Option } from 'effect'
  import { detect } from 'foldkit-media/unpic'

  const shopify = detect('https://cdn.shopify.com/s/files/1/0/products/shirt.jpg')
  Option.isSome(shopify) // true
  ```

A provider is a plain value (`Provider.Provider`): `widths`, the `sources`
formats offered before the `img`, the `img`'s own `fallback` encoding, and a
`url` function answering `Option<string>`.

## Images in the repository

An image the application ships with needs no server and no CDN: the build
reads it and writes its variants beside the bundle. Add the plugin, and the
type of a `?image` import (`"types": ["foldkit-media/client"]` in the
`tsconfig`):

```ts
// vite.config.ts
import { images } from 'foldkit-media/vite'
import { defineConfig } from 'vite'

export default defineConfig({ plugins: [images({ sources: ['avif'], fallback: 'webp' })] })
```

```ts
import hero from './hero.jpg?image'
import { Layout } from 'foldkit-media'
import { Image } from 'foldkit-mixins-ui'

Image.view({ ...hero, layout: Layout.Constrained({ width: 800 }), alt: 'The finals' }, h)
```

The import is `{ asset, provider }`. The build measures the file once
(`describe`, through sharp, so the application needs `sharp`): its size, its
alpha, its SHA-256 and a ThumbHash. It writes one file for each ladder width
below the original's own, and one at its own width, in each format, named by
content so the host's long cache is honest; `provider` is
`Provider.fromFiles` over them. Facts and variants are kept in Vite's cache
directory by the original's hash, so an unchanged image, AVIF included, is
not encoded again. The development server makes the same variants when a page
asks for one, under `/@foldkit-media/image/`, and answers any width or format
it did not offer with a 404.

Every image costs `widths × formats` files: with the standard ladder and two
formats, a large photograph is eighteen. A static host counts files
(Cloudflare Pages allows 20,000 on its free plan), so a site with many images
offers fewer formats or widths (`images({ widths: Widths.make([…]) })`), or
keeps its originals on the media server (`Provider.hosted`) instead.

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

## Facts

An `ImageAsset`'s facts are derived from its original once, where it enters,
and stored beside it. `describe` is in the core; each inspector is the
subpath of where it runs (`/sharp`, `/browser`, `/cloudflare`), and `factsOf`
is `foldkit-media/server`'s:

- `describe(key, bytes)` reads them through the `Inspector`: size, alpha, the
  SHA-256, and a ThumbHash where the inspector makes a thumbnail.
- `inspectorSharp({ maxPixels? })` (Node) reads all of them; alpha is whether
  any pixel is transparent, so an opaque PNG still gets a placeholder.
- `inspectorBrowser({ maxPixels? })` (`foldkit-media/browser`) reads them in
  the browser or a web worker, with its own decoder: an editor describes a
  file a reader dropped, ThumbHash and hash included, before anything is
  uploaded, and stores its facts beside the image (a rich-text `Image`'s
  `asset`). What the browser cannot decode is refused.
- `inspectorImages(binding)` (Cloudflare) reads the size from `info`, which
  costs no transformation. It makes no thumbnail, since the binding's raw
  pixels are not offered offline, and takes every format but JPEG to be
  transparent; both cost a placeholder, never show a wrong one.
- `factsOf(url, { allow, maxBytes?, cache?, fetch? })` describes an image a
  page names only by URL (a rich-text image), so it gets its box like any
  other. Only `https` on a host in `allow` (matched exactly), at its default
  port, is read, each redirect is checked again, and the body is limited as
  it streams. Given a
  `KeyValueStore` as `cache`, the facts are kept by URL and the original is
  asked for again with its `ETag`, so an unchanged one is not read twice.

## The variant space

A server makes only what its `Variant.space({ widths?, formats?, qualities?, revision? })`
allows: the width ladder, a set of formats (AVIF and WebP by default) and a set
of qualities (none by default: no URL names one, and the encoder uses its own).
A request outside it is refused before any work, so an original has at most
`space.size` variants, whoever asks: 16 for `Variant.standard`. The server
reads its space from the provider the pages use, so the two cannot differ:
define `const media = Provider.hosted({ space })` once and give the same value
to `serveFetch`'s `images.provider` (or `layer({ provider })`). The provider
refuses, when defined, a format or quality its space does not make.

A variant's URL names the variant (the original's hash, a width, a format, a
quality), and what it answers is kept for a year under it. Nothing checks that
two makings of one variant give the same bytes, and an upgraded encoder may
not: the server cannot tell. So a change to what a variant is (the encoder's
settings, how it resizes) is a new `revision` of the space, which the
application bumps, never new bytes behind an old URL. `Variant.space({ revision: 1 })`
writes `w640.r1.avif`; revision 0, the default, writes no revision, so every
URL written before revisions keeps its spelling. A server of revision 2 still
answers what earlier ones wrote: an earlier revision's variant while its store
keeps it, and else a `302` to the current revision's URL, kept briefly, since
a rollback, or a server of the earlier revision still in the rollout, answers
the old URL again. A later revision it answers as it would a width it does not
make, briefly, since the next release in a rollout may.

## The server

`foldkit-media/server` answers the route `Provider.hosted` writes, for
originals no CDN can fetch. `MediaApi` is its Effect `HttpApi`, one route;
the handler decodes the path with the space's Schema, the one the provider
encodes with. A URL outside the grammar (a leading zero, a malformed hash) is
a 400; one well formed but outside this space (a width off the ladder) is a
404. Only a variant is kept long: every refusal is kept a minute at the edge
and not at all by a browser, since another release, the next one in a
rollout, or the same one configured otherwise, may answer it.

The route checks no permission: anyone holding a variant's URL can read it. A content
hash cannot be guessed, but every page that shows the image hands it out, so
an original that must stay private does not belong on this server.

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

Every answer the route gives has its headers from one function, `headersFor`.
A defect is not an answer: a store that fails, or a Worker's layer that
cannot be built, is the framework's own `500`, with none of them.

| Answer | Status | `Cache-Control` |
| --- | --- | --- |
| A variant (`ETag: "<hash>/<spelling>"`) | 200 | `public, max-age=31536000, immutable`: the path names the variant, and a new way of making it is a new revision |
| A request already holding it (`If-None-Match`) | 304 | the same; the store is not read |
| A URL outside this release's grammar | 400 | `no-store`, and `CDN-Cache-Control: public, max-age=60`: a later release may read it (a new format) |
| A well-formed URL outside this space | 404 | the same: a later release may offer it |
| An earlier revision's variant, no longer kept | 302 to the current revision's URL | the same: a rollback answers the old URL again |
| No original under the hash | 404 | the same: an upload may yet put it there |
| The original above `maxBytes` (20 MB by default) | 413 | the same: a server configured to read more may answer it |
| The transformer failed | 502 | `no-store` |
| The client past its rate limit | 429 | `no-store`, `Retry-After` |
| The allowance spent | 503 | `no-store`, `Retry-After: 3600` |

Every image response also says `X-Content-Type-Options: nosniff`,
`Access-Control-Allow-Origin: *` (a canvas may read it), `Cross-Origin-Resource-Policy:
cross-origin` and `Timing-Allow-Origin: *`, and a variant says where it came
from in `Server-Timing` (`edge`, `store` or `made`). Nothing sends `Vary`: the
format is in the URL.

- `serveFetch({ images?, uploads?, otherwise? })` is a Worker's fetch handler.
  It owns `/_image/` and `/_media/`: `images` (`{ provider?, maxBytes?, layer }`)
  serves the variants, `uploads` (below) the upload route, each with its
  services built from the request's bindings once per environment. Anything
  else under those two prefixes, a route it was not given or a preflight, is a
  404, and every other path goes to `otherwise` (a 404 without one), so the
  application's own routes need not know the media paths.
- `layer({ provider?, maxBytes?, coalesce? })` is the route as an Effect
  `HttpRouter` layer, for a Node server beside other routes.
- `variantsNone` keeps nothing, for a host with a cache of its own in front.

### Stores

`Originals` and `Variants` are kept in any Effect `KeyValueStore`
(`effect/persistence`), the store the application already has:

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

- `KeyValueStore.layerMemory` for tests, `layerFileSystem` on a disk (it
  needs the platform's `FileSystem` and `Path`, Node's on a server),
  `layerSql` over SQLite or D1, `keyValueStoreR2` (below) over R2.
- `variantsKeyValueStore({ prefix })` keeps a variant's bytes under
  `variants/<hash>/<spelling>`; its media type is the key's extension, so
  nothing else is stored. A store that fails a read or a write is reported
  (`StoreFailed`) and the request is answered by making the variant: variants
  are a cache.
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
  the request, reported (`AdmissionFailed`): a limiter that is down should not
  take the images down.
- The client is `CF-Connecting-IP`, else the connection's address. Pass
  `clientOf` to read your own proxy's header; `X-Forwarded-For` is the
  client's to write, so it is not read by default.

### On a Node server

`foldkit-media/sharp` gives the `Transformer` (sharp is an optional peer):

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

- `transformerSharp` and `inspectorSharp` read an original as its EXIF
  orientation shows it: a phone's portrait photograph, stored landscape, is
  measured, resized and placeheld upright, as a browser draws it.
- `transformerSharp` reads an original's size from its header before decoding
  it, and refuses one above `maxPixels` (50 megapixels by default) with a 413,
  so a small file that inflates to a huge picture never reaches the heap. It
  never enlarges, and encodes at the URL's quality.
- At most `concurrency` transforms run at once (the machine's cores by
  default), through `limitTransforms(n)`, which wraps any `Transformer`.
- `layer` coalesces: concurrent misses for one variant share one transform
  and one write (`coalesce`, on by default here and off for `serveFetch`,
  since a Worker request cannot wait on another's).

### Uploads

An original that no CDN or build holds, such as an editor's upload, enters
through `POST /_media/upload`: the bytes are the body, with an `image/*`
`Content-Type`. The route reads at most `maxBytes` (20 MB by default) as the
body streams, reads its facts through the `Inspector`, keeps the bytes under
their SHA-256 in `Uploads` (where `Originals` reads them) with the facts
beside them, and answers the facts as a `HashedAsset`, keyed by that hash,
with a `201`. The variant server serves it at once.

**Who may upload** is the application's to say, and the route has no
default. `UploadPolicy.admit(request, route)` is asked before a byte is read,
with the route it is for (`'Upload'`, or `'DescribeUrl'` for the facts route
below). It refuses with `UploadForbidden` (`403`), or with
`UploadUnauthenticated` (`401`) when it cannot tell who is asking, so a client
whose session ended knows to sign in again.

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

- `uploadPolicyBearer(secret)` is for a deployment's secret, a script's: it
  admits `Authorization: Bearer <secret>`, compared by digest so the time
  taken says nothing of the secret, and admits nobody while the secret is
  unset or empty.
- `GuardMedia.uploadPolicy` from `foldkit-guard/media` decides each route by
  the principal guards of your guard set (`G`, `Policy`), for who `resolve`
  says is asking: the resolver your Remote server is given, such as
  `AuthServer.resolver` from `foldkit-auth/server`. It reads the request's
  headers alone. A route given no guards admits nobody; here an editor may
  upload and nobody may have a URL described.
- `uploadPolicyAny(a, b, …)` tries policies in turn, the first to admit
  winning; when every one refuses, the last refusal is the answer.
- A policy of your own is `Layer.succeed(UploadPolicy, { admit })`.

**Registering an upload.** The bytes never travel through RPC; only facts go
on to the application's data (a CMS's asset row). But the facts the route
answered are the client's word once they pass through it: a client can change
a width, or name another original's hash, and decoding with `HashedAsset`
checks their shape, not that they are true. So the mutation that registers
an upload takes the hash, and reads the facts the server kept:
`StoredFacts.get(hash)` answers them, or none for a hash nobody uploaded (or
one kept before facts were), over the same store as `Uploads`
(`storedFactsKeyValueStore()`, `storedFactsR2(bucket)`). What only an editor
knows, such as a focal point, comes with the hash.

`uploadsKeyValueStore()` keeps uploads where `originalsKeyValueStore()`
reads, over the same `KeyValueStore`; on Cloudflare, `uploadsR2(bucket)`
beside `originalsR2(bucket)`, and `serveFetch`'s `uploads` hosts the route in
a Worker. A refusal answers its kind and nothing more, and no browser keeps
it: `403` or `401` from the policy, `415` for a body that is not `image/*` or
not an image the inspector reads, `413` past `maxBytes` or the inspector's
pixel limit, and `400` for a body that broke off. Because the body must be
`image/*`, which is not a type a browser sends to another origin without a
preflight, and the route answers no preflight, a cookie alone cannot upload
from another site.

From a browser, `upload(file, { url?, headers? })` (`foldkit-media/browser`)
sends one file to the route and is a `Stream`: `Progressed { loaded, total }`
as the bytes go, then one `Uploaded { asset }` with the route's facts, and it
ends. A refusal fails it with `UploadFailed { reason, status }`, whose
`reason` names the route's answer (`Forbidden`, `Unauthenticated`,
`TooLarge`, `Unsupported`, `Malformed`), `Network` when nothing answered,
or `Unexpected` for an answer that is not the route's. It is an
`XMLHttpRequest`, since `fetch` reports no upload progress, and interrupting
the stream aborts it: a Command or Subscription that runs it cancels by
ending.

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

A browser authenticates as the page does: a same-origin request carries the
session cookie, which the application's own `UploadPolicy` reads (as
`GuardMedia.uploadPolicy` does). `uploadPolicyBearer`'s secret is a deployment's,
for a script; a page that sends it in `headers` gives it to every visitor. No
timeout is set: a stalled server shows the send on its way until it is
interrupted.

An image a page names only by URL gets its facts from the same route set:
`GET /_media/facts?url=` reads it with `factsOf`, behind the same
`UploadPolicy`, asked for `'DescribeUrl'`, and answers them keyed by the URL (`200`). Only `https` on a
host in `uploadLayer({ facts: { allow } })` is read, and `allow` is empty
unless given, so a server names every host it fetches. An editor asks it when
a URL is set, and stores the facts beside the URL. Neither route limits how
often it is asked: each admitted call reads up to `maxBytes` and decodes it,
so the `UploadPolicy` is where an application limits who calls, and how often. What cannot be read (a host
not allowed, a missing file, no image) is a `422`, saying only that.

### Files

Images are not the only uploads: a form may take a PDF, a spreadsheet, any
file. `POST /_media/files` keeps any file, and `GET /_media/files/:key` serves
it back as a download. They are a route set of their own (`fileLayer`), apart
from the image routes, and a server that mounts only the image routes serves
no file. Files are kept in a `FileStore` under 32-hex keys, and the variant
server reads only a 64-hex content hash, so no request to it names a file.

**Who owns what.** The route owns the bytes and the facts it recorded about
them: a key it minted, and the name, type and size the uploader declared. The
application owns which row holds a file and who may read it. A form only ever
holds a `FileAsset` (`{ key, name, type, size }`, from `foldkit-media`), which
is the client's word once it has passed through the client.

```text
browser: uploadFile(file)  ->  POST /_media/files  ->  key minted, bytes + record kept  ->  FileAsset
form submits the FileAsset ->  your mutation: authorize, then keepOrClaim  ->  the server's FileAsset on the row
GET /_media/files/:key     ->  FileReadPolicy (who asks, may they read this key)  ->  the bytes, as an attachment
```

A key is 128 random bits, so it cannot be guessed, and each upload's bytes
are kept on their own, even when equal to another's: sharing them would make
a second upload of the same bytes answer faster, telling the uploader that
someone already holds them.

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

- **`FileUploadPolicy.admit(request)`** says who is uploading, before a byte
  is read, and answers their id. Only that id may claim the file later, so it
  must be stable and never given to another person. An empty id is refused
  (`403`) and reported (`OwnerMissing`): one id for every visitor would let
  anyone claim anyone's upload.
- **`fileReadPolicy({ resolve, read })`** asks in two steps, before the store
  is read. `resolve` says who is asking from the request alone, never the key,
  or fails `FileUnauthenticated` (`401`) when it cannot tell, so a client can
  ask the reader to sign in again. `read` says whether they may read a key,
  typically by finding the row that holds it. A no is a `404`, the same answer
  as a key nobody uploaded, so a refusal never says whether a file exists.
- **`keepOrClaim(held, submitted, owner)`** is what a save stores. When the
  submitted key is the file the row already holds, it keeps that file and
  claims nothing, so a teammate re-saving a row is fine. Otherwise it claims
  the key: `FileStore.claim` answers the facts the route recorded, once, to
  the uploader, within `claimWithin` (a day by default, an option of
  `filesKeyValueStore`), and fails `FileUnclaimed` for anything else (an
  unknown key, an expired one, someone else's, one claimed already), each
  alike. Call it after authorizing the write, so a refused write claims
  nothing. A key moves to another row only by being uploaded again.

**A download cannot run here.** Every answer the download route writes,
refusals included, is `application/octet-stream` with `nosniff`, a
`Content-Security-Policy` of `sandbox; default-src 'none'`,
`Cross-Origin-Resource-Policy: same-origin` and `Cache-Control: private,
no-store`. A file comes as an attachment named by its record, never by the
request, both as RFC 6266's `filename*` and as an ASCII fallback. The
declared type is never served, so an HTML file uploaded as a PDF downloads
and runs nothing. None of the image routes' cross-origin headers are sent.
What the router answers before the route runs (another method, a path it
cannot decode) and a `500` carry no body, so nothing in them can run.

**What an upload must be.** The body is `application/octet-stream`, and the
file's name and type travel in `x-foldkit-file-name` (percent-encoded UTF-8)
and `x-foldkit-file-type`. A page on another site cannot send either without a
preflight, which the route never answers, so a cookie alone cannot upload from
elsewhere. An application that adds CORS middleware answering `OPTIONS` for
these paths undoes that. The name must be non-empty, at most 255 bytes, with
no control or format character (bidi overrides, zero-width characters), line
separator or slash. The type is parsed, its parameters dropped, and compared
with `accept` without regard to case: `text/html;x=image/png` is `text/html`.
`accept` is required, `'*'` for any type. The client writes the type, so
`accept` shapes the product and secures nothing; to check the content itself
(magic numbers, a scan), give `inspect: (bytes, declared) => Effect<void,
FileRefused>`, run before anything is kept.

| Answer | Why |
| --- | --- |
| `201` | Kept; the body is the `FileAsset`. |
| `400` | No name, or one that breaks a rule above; or a body that broke off. |
| `401` / `403` | The policy could not tell who is asking, or refused them. |
| `408` | The body came slower than `minBytesPerSecond` (32 KB/s by default) over 10 seconds. |
| `413` | Past `maxBytes` (20 MB by default), counted as the body streams. |
| `415` | Not `application/octet-stream`, a type outside `accept`, or refused by `inspect`. |
| `429` | `Admission`, when one is given, refused this uploader (`Retry-After` says when to try). |
| `503` | Every slot is taken (`maxConcurrent`, 2 by default), or this uploader already has one. It does not queue: try again soon. |

**Memory.** An upload holds about twice its size while it is read, so the
defaults hold at most `2 × 20 MB × 2 = 80 MB`, within a 128 MB Worker. Lower
`maxBytes` or `maxConcurrent` where an `inspect` copies the bytes. The slots
belong to the server (a Worker isolate), built once with the layer. A
download holds its file in memory too, and downloads take no slot, so a
Worker serving many large files to many readers at once should keep them
elsewhere (R2 behind a signed URL). One slot per uploader stops one account
taking every slot, not several: at the minimum rate a 20 MB body takes about
eleven minutes, so `maxConcurrent` accounts can hold every slot that long.
Where that matters, ask `Admission` to limit uploads per owner.

From a browser, `uploadFile(file, { url?, headers? })` (`foldkit-media/browser`)
sends the file as the route expects, and is a `Stream` like `upload`:
`Progressed` as the bytes go, then `FileUploaded { asset }`. Its
`UploadFailed` reasons add `TooSlow`, `RateLimited` and `Busy` to `upload`'s.
In a Worker, `serveFetch`'s `files` hosts the route set. Not done here:
resumable uploads, range requests, quotas beyond `Admission`, and removing the
bytes of files nobody claimed (`claimWithin` stops their use; reclaiming the
space is a sweep left to the application).

### Written out at build

A static site needs no server for its hosted images: `materialize` makes every
variant the built pages name, through the server's own handler, and returns
them as files at their own paths, for `foldkit-ssr`'s `staticSite` `emit`:

```ts
const media = serveFetch<object>({
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
  emit: pages =>
    materialize({
      pages,
      fetch: request => media(request, env),
      headersFile: readFileSync('public/_headers', 'utf8'),
    }),
}
```

- A variant that cannot be made fails the build, naming each one: a page that
  names it would show a broken image.
- More than `maxFiles` (20,000 by default, Cloudflare Pages' free limit) fails
  the build.
- A static host sends what its `_headers` says. Add `headersRule()` (what the
  server sends a variant) to `public/_headers`; given that file's text as
  `headersFile`, the build fails without it, since Pages would otherwise serve
  every variant with `max-age=0`.
- With `Variants` on disk, a second build writes without encoding again.

### On Cloudflare

`foldkit-media/cloudflare` gives the services from a Worker's bindings, and
`serveFetch` is the Worker:

```ts
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

- `transformerImages(images)` is the Images binding: it scales down, never up,
  and names the format. Cloudflare's code for a spent allowance (9422) is the
  503; any other refusal is the 502, its reason reported (`ImageFailed`).
- `keyValueStoreR2(bucket)` is an R2 bucket as a `KeyValueStore`, for the
  store adapters above or the application's own (`clear` and `size` list the
  bucket).
- `variantsR2(bucket, { prefix?, cache? })` is `variantsKeyValueStore` over
  it, so a variant made last month is not made, and billed, again. Two misses
  for one variant at the same moment both make it, since a Worker request
  cannot wait on another's; with
  `cache`, the Cache API is read first and filled from R2: `true` for the
  Worker's `caches.default`, or a cache of your own (`await caches.open(…)`).
  `true` outside a Worker throws where the layer is made.
- `originalsR2(bucket)` streams an original rather than reading it into
  memory, unlike the general adapter.

Cloudflare bills each new width of each original once a month (format and
quality do not count), so the ladder is the cost: eight widths are at most
eight transformations an original. `examples/cloudflare` is such a Worker,
with Remote and Sync as its `otherwise`.

### Diagnostics

Where the server answers past a failure without telling the caller why, it
reports a typed diagnostic through `Diagnostics.Reporter` (`foldkit-surface`'s
channel), which by default is Effect's log, a Worker's `wrangler tail`.
Reporting changes no answer. Each is exported as a type from
`foldkit-media/server` (`MediaDiagnostic` is the union):

| `_tag` | `level` | When |
| --- | --- | --- |
| `StoreFailed` | `error` | A store failed and was worked around: a read taken as a miss, a write dropped. `store` is `variants`, `edge` (the Cache API in front of R2) or `facts` (`factsOf`'s `cache`), with the `operation`, `key` and `cause`. |
| `AdmissionFailed` | `error` | A rate limiter failed (`limiter`: `RateLimiter` or `binding`), so `client` was admitted with no limit. |
| `ImageFailed` | `error` for a `transform`, `warning` for an `inspect` | The transformer or inspector failed, answered `TransformFailed` with its `cause` left out. An inspection that fails is most often an upload that is no image. |
| `FactsUnanswered` | `warning` | The facts route answered `Unavailable`; the diagnostic carries the `url` and the `reason`. |
| `RequestDefect` | `error` | A defect `serveFetch` answered 500, with its `cause`. Behind `layer`, a defect is the application's router's to log. |

Provide another reporter as any service, in the layer the services come from
(`Diagnostics` is `foldkit-surface`'s):

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

In a test, `Diagnostics.collect()` gives a reporter and the array it fills.

## Icons

An icon is data too: `IconData` holds its `viewBox`, what its root paints
(`fill`, `stroke`), and its drawing as nodes, never markup to set as HTML. An
application imports icons by name, and the build reads them:

```ts
// vite.config.ts
import { icons } from 'foldkit-media/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [icons({ iconify: ['lucide'], folders: { app: './src/icons' } })],
})
```

```ts
import { arrowLeft } from 'virtual:foldkit-icons/lucide'
import { logo } from 'virtual:foldkit-icons/app'
```

`iconify` names Iconify sets by prefix, each read from the application's
`@iconify-json/<prefix>` (any set: `lucide`, `uil`, `mdi`); `folders` names
the application's own sets, a folder of SVG files each named by its file
(`star-filled.svg` is `starFilled`). The import is the selection: the bundler
drops every icon nothing imports. The plugin writes `foldkit-icons.d.ts` at
the root (`dts` moves it, `false` writes none), declaring every icon of every
set, so a misspelt name is a type error; include it in the `tsconfig`.

A view draws an icon with `Icon.draw(icon, h)`: inline SVG through the view's
builder (Foldkit's `h`, or anything of its shape, `SvgBuilder`), every
attribute in the server's markup, `1em` square unless `size` is given, and
`aria-hidden`, since the control it sits in carries the name.
`foldkit-mixins-ui`'s `Icon.view({ icon, label? })` draws it into its glyph,
sized by the recipe, and names it when given a `label`. A style masks with `Icon.maskUrl(icon)`, a CSS `url()`.

Every icon is parsed against a presentational allowlist, because it is drawn
inline. The parse refuses, naming the icon, an element or attribute outside
it (`script`, `style`, `foreignObject`, an animation, an event, a `class`),
an `href` or `url()` that leaves the icon or names an id it does not define,
a CSS function other than a colour, a transform or `url()` (a mask's
`image-set()` would fetch an image), and a CSS escape. It drops the root's
size and namespaces, comments and declarations, and the words of `title`,
`desc` and `metadata`, which a label replaces. A
refused SVG in a folder fails the build. A refused icon of an Iconify set is
left out, the declaration says why, and only importing it fails.

A package cannot rely on an application's plugin, so it commits its icons as
constants, read by `foldkit-media/icons` in a script (in this repository,
`pnpm icons` writes them from a package's `icons.json`):

```ts
import { Icon } from 'foldkit-media'
import { parse } from 'foldkit-media/icons'

const check = parse(
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5"/></svg>',
  'check',
)
Icon.maskUrl(check) // url("data:image/svg+xml,…") for a mask
```

`fromIconify(set, name)` reads one icon of an Iconify set's JSON (decoded
with the `IconifySet` Schema), through its aliases. `Icon.key(icon)` is a
short name from the icon's content, the same on a server and in a browser;
`Icon.prefixIds(icon, prefix)` renames the ids the icon defines and every
`href` and `url()` naming one, so two icons drawn on one page keep their own.
`Icon.draw` does both; its `key` option sets two copies of one icon apart,
because a gradient defined in a hidden copy paints nothing for a shown one.

## Validation

Facts are untrusted input. `ImageAsset` refuses an image with no pixels, and a
`Placeholder.Color` that is anything but one CSS color (no `;`, no `url(`),
since it lands in a style the page writes.

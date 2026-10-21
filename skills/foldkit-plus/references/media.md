# foldkit-media

Responsive images as URLs to write. Given an image's facts, a provider that
knows a host's URL scheme, and how wide the image is drawn, it derives every
attribute of the markup. It performs no I/O: the browser picks the candidate,
and the host (a CDN, a build, or this package's own server) makes the variant.

## Ownership

| Fact | Owner |
| --- | --- |
| The original image | its source: a repository file, a CMS upload, a third-party host |
| Width, height, alpha, placeholder, content hash (`ImageAsset`) | stored beside the original, derived from it once |
| A variant at one width and format | the provider's cache; disposable |
| Which variant a page shows | the browser, from `srcset` and `sizes` |
| Which widths exist | one `Widths` ladder, carried by the provider |

## Mental model

```text
ImageAsset + Provider + Layout -> Picture.derive -> picture/source/img attributes
```

`Layout` is `Fixed({ width })`, `Constrained({ width })` or `FullWidth()`;
it picks the ladder widths worth offering and writes `sizes`. A width above the
original is described with the original's width, once.

## Example

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { ImageAsset, Layout, Provider } from 'foldkit-media'
import { Style } from 'foldkit-mixins'
import { Image, ImageSlots, Recipes } from 'foldkit-mixins-ui'

const hero = Schema.decodeUnknownSync(ImageAsset)({
  key: 'photos/hero.jpg',
  width: 2400,
  height: 1600,
  alpha: false,
  hash: null,
  placeholder: { _tag: 'Color', value: '#20304a' },
})

const imageStyle = Style.forSlots(ImageSlots)(Recipes.Image({ edge: 'line' }))

export const heroView = (h: HtmlBuilder<never>) =>
  Image.view(
    {
      asset: hero,
      provider: Provider.cdnCgi(),
      layout: Layout.Constrained({ width: 720 }),
      alt: Image.described('The finals, from the press box'),
      priority: true,
      style: imageStyle,
    },
    h,
  )
```

- `alt` is required: `Image.described(text)` or `Image.decorative`.
- `priority: true` only for the page's largest image; every other is lazy.
  `Image.preloadsIn` is a `foldkit-ssr` `Head` that preloads it, read from the
  rendered page. `Picture.ogImage(asset, provider, origin)` gives `og:image`.
- The `img` keeps its box before the file arrives (`width`/`height` from the
  asset), and paints the placeholder meanwhile, except behind a transparent
  image.

## Providers

- `Provider.cdnCgi({ zone?, widths?, quality? })`: Cloudflare's
  `/cdn-cgi/image/`; the zone resizes and picks the format.
- `Provider.fromFiles(files, { sources, fallback })`: a build's variants.
- `detect(url, { widths?, sources?, fallback?, quality? })` from
  `foldkit-media/unpic` (unpic, an optional peer): `Option<Provider>` for an
  image on a host that resizes it (Shopify, Cloudinary, imgix, …); `img` asks
  `auto`, a format the host ignores is never a `source`, another host's asset
  gets no URL.
- `Provider.hosted({ baseUrl?, space?, sources?, fallback?, quality? })`: this
  package's own server, `/_image/<sha-256>/w640.avif`; a `Provider<HashedAsset>`,
  so facts without a `hash` are a type error in `Picture.derive` and `Image.view` (decode
  stored facts with `HashedAsset`, or narrow with `isHashed`). `Variant.space({ widths, formats, qualities, revision })` bounds what it makes
  (a changed output is a new `revision`: `w640.r1.avif`, an earlier one answered while kept,
  else a brief `302` to the current URL);
  `foldkit-media/server` serves the route, its space read from the same provider
  (`serveFetch({ images: { provider } })`), decoding with the same Schema, and
  decides every response's headers in `headersFor` (immutable variants, ETag
  and 304, a lifetime per error, CORS).

## The server's stores

`foldkit-media/server` needs `Originals`, `Transformer` and `Variants`.
Originals and variants are kept in any Effect `KeyValueStore`
(`originalsKeyValueStore()`, `variantsKeyValueStore()` over
`KeyValueStore.layerMemory`, `layerFileSystem` or `layerSql`); on Cloudflare,
`foldkit-media/cloudflare` gives `keyValueStoreR2`, `originalsR2`,
`variantsR2` (`cache: true` puts the Worker's `caches.default` in front) and
`transformerImages`; on Node,
`foldkit-media/sharp` gives `transformerSharp` (a pixel limit and a
concurrency limit), and `layer` coalesces concurrent misses. Rate limits apply to misses only:
`admissionRateLimiter` (Effect's `RateLimiter`) or `admissionRateLimit` (a
Workers binding), a 429 with `Retry-After`. A static site writes its hosted variants out at
build with `materialize`, as `foldkit-ssr`'s `staticSite` `emit`, and adds
`headersRule()` to its `_headers`. Facts are derived once where an original
enters: `describe(key, bytes)` (from `foldkit-media`) through an `Inspector` (`inspectorBrowser` from `foldkit-media/browser`, in an editor; `inspectorSharp`,
`inspectorImages`), and `factsOf(url, { allow })` for an image named only by
URL, kept by URL and revalidated with its `ETag`. Variants
are a cache: a store that fails is answered by making the variant.

A Worker is one `serveFetch({ images?, uploads?, otherwise? })`: it owns `/_image/` and
`/_media/` (anything else under them, a preflight included, is a 404) and hands every other path
to `otherwise`. Uploads: `uploadLayer({ maxBytes? })` (or `serveFetch`'s `uploads` in a
Worker) serves `POST /_media/upload`: an `image/*` body, read under the byte
cap, described, kept under its SHA-256 by `Uploads` (`uploadsKeyValueStore()`,
`uploadsR2(bucket)`, where `Originals` reads) and answered as a `HashedAsset`
(201), and `GET /_media/facts?url=` answers the facts of an image named by URL through
`factsOf`, from the hosts `uploadLayer({ facts: { allow } })` names (none by default; 422 for
one it cannot read). `UploadPolicy` is required and asked first by both (`UploadForbidden`, 403):
`uploadPolicyBearer(secret)` for a deployment's secret (constant-time, nobody while unset), or the
application's own;
the application registers the facts in its own data.

See also: [packages/media/README.md](https://github.com/doeixd/foldkit-plus/blob/main/packages/media/README.md),
[docs/design/media-DESIGN.md](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/media-DESIGN.md).

## Images in the repository

`images({ sources: ['avif'], fallback: 'webp' })` from `foldkit-media/vite` makes
`import hero from './hero.jpg?image'` give `{ asset, provider }` (types:
`"types": ["foldkit-media/client"]`), so `Image.view({ ...hero, layout, alt }, h)` draws it. The
build reads its facts through sharp (an application dependency) and writes a file per ladder width
up to the original's own, per format, kept in Vite's cache by content; the dev server makes the
same variants on request. Each image is `widths × formats` files, which a static host counts.

## Icons

`IconData` (`{ viewBox, attributes, nodes }`) is an icon as data. An
application adds `icons({ iconify: ['lucide'], folders: { app: './src/icons' } })`
from `foldkit-media/vite` to its Vite plugins and imports by name:
`import { arrowLeft } from 'virtual:foldkit-icons/lucide'` (an `@iconify-json/<prefix>`
package per set; a folder's `star-filled.svg` is `starFilled`). Unimported icons are
dropped; the plugin writes `foldkit-icons.d.ts` (include it in the tsconfig) so a
misspelt name is a type error. Draw with `Icon.draw(icon, h, { key?, size? })` (inline SVG,
`aria-hidden`, `1em` unless sized, ids prefixed by the icon's content; `key` parts two copies),
in `foldkit-mixins-ui`'s `Icon.view` to size it by the recipe; mask with `Icon.maskUrl(icon)` (`Icons.byAttribute`/`Icons.glyph`).
Every icon passes a presentational allowlist (elements, attributes, CSS functions, references
only to its own ids): a refused folder SVG fails the build,
a refused Iconify icon is left out and its import fails. A package commits constants
made with `foldkit-media/icons`' `parse(svg, name)` or `fromIconify(set, name)`.
Never set an icon's markup through `innerHTML`.

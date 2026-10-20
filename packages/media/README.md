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
  `/_image/w640.avif/<sha-256>`: the original is named by its content hash, so
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
use.

## Placeholders

An `ImageAsset`'s `placeholder` is painted behind the image until it loads;
`Picture.derive` gives it as a CSS `background` value (`picture.placeholder`):

- `Placeholder.cases.Color.make({ value })` paints one CSS color.
- `ThumbHash` paints a blurred likeness decoded to a PNG data URL, a few
  kilobytes of HTML per image, so the page paints it with no request.
- `LowRes` paints the provider's smallest width of the image: no stored data,
  one small request.

An image with `alpha: true` gets no placeholder, since it would show through the
transparent pixels once the image loads.

## Loading

`priority: true` marks the page's largest image: `loading="eager"` and
`fetchpriority="high"`. Every other image is `loading="lazy"` and
`decoding="async"`, and its `sizes` begins with `auto, `, which lets a browser
that supports it use the laid-out width.

## The server's API

`foldkit-media/server` exports `makeApi(widths)`, an Effect `HttpApi` with the
one route `Provider.hosted` writes. Its params decode with `Variant.schema`, the
Schema the provider encodes with, so a width off the ladder, a leading zero or
a malformed hash is a 400 before any work. Handlers and hosting come with the
resizing services.

## Validation

Facts are untrusted input. `ImageAsset` refuses an image with no pixels, and a
`Placeholder.Color` that is anything but one CSS color (no `;`, no `url(`),
since it lands in a style the page writes.

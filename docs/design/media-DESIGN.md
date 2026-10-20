# Media design: images and icons

Status: design, nothing built. Written 2026-10-20. Code in this document is a
sketch against today's APIs and has not been compiled; names marked *probe*
rest on library behaviour that must be checked against the installed version
before anything is built on it.

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
`mixins-ui`. It covers responsive images, placeholders, a resizing server and
build step, and icon data. It does not cover uploading (that is
`foldkit-cms-media`, [cms-DESIGN.md](./cms-DESIGN.md) §14, which would store the
originals this design reads), video, or signed URLs for private images.

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
- **One codec is the wire.** For our own server, the provider is a Schema
  between a URL and a typed request. The view encodes with it, and the server
  decodes the incoming request with the same Schema at its validation boundary,
  the way Remote's payloads are one schema on both sides.
- **Variants are a cache.** Whoever produces them, CDN or our server, can
  discard them; the original and the request are enough to produce them again.

## 3. Ownership

| Fact | Owner | Kind |
| --- | --- | --- |
| The original image | Its source: a CMS `Asset` row, a file in the repository, a third-party host | Authoritative |
| Its facts: width, height, alpha, placeholder, content hash | Whoever owns the original, stored beside it | Derived once from the original; recomputed, never edited |
| A variant (a width and format of it) | The provider's cache: a CDN, or our `VariantStore` | Disposable; refetch is recovery |
| Which variant a page shows | The browser, from `srcset` and `sizes` | Not in the Model |
| Which widths exist | One `Widths` ladder, declared once (§5) | Configuration |
| An icon's drawing | The icon set it was imported from, at build time | Static data |

The view owns none of these. `Image` reads an asset's facts and a provider and
writes markup; it holds no Model and sends no Message unless an opt-in mixin
asks for one (§7.4).

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
taught that encoding does not fit in a Worker, so the transform is a swappable
service. Its defects are a checklist for §9: an allowlist matched with
`hostname.endsWith`, so `evilexample.com` passes `example.com`; actions that
fetch further URLs (`watermark`, `blend`) with no allowlist at all; WebP always
encoded lossless, so `quality` is ignored; an unknown format silently becomes
PNG; a cache key of the raw query string, so reordered parameters miss; the
container's response stored without checking its status; the original proxied
on any error; no pixel limit before decoding.

## 5. The core: assets, widths, providers

Pure values in `foldkit-media`, with no I/O.

```ts
// sketch
const ImageAsset = Schema.Struct({
  src: Schema.String, // where the original lives, as its provider reads it
  width: Schema.Int, // intrinsic, in pixels
  height: Schema.Int,
  alpha: Schema.Boolean, // has transparent pixels (§7.3)
  hash: Schema.OptionFromNullOr(Schema.String), // content hash of the original
  placeholder: Schema.OptionFromNullOr(Placeholder),
})
```

The asset is stored or sent, so its optional fields are `OptionFromNullOr`.
`hash` is absent for a third-party original we have never read.

**Widths.** `Widths.make([320, 480, 640, 828, 1080, 1280, 1920, 2560])` is the
one ladder. The view takes candidates from it; our provider's request Schema
refuses any other width; the build step emits only these. corps-place's warm-up script repeats its
components' widths (400, 800, 720, 96) by hand, and nothing checks they agree.

**Provider.** A provider writes a URL:

```ts
// sketch
interface Provider {
  readonly url: (asset: ImageAsset, request: { width: number; format: Format }) => string
  readonly formats: ReadonlyArray<Format> // what it can write a URL for
  readonly negotiates: boolean // picks the format itself from Accept (Cloudflare's f=auto)
}
```

- `Provider.hosted({ base, widths })` is our server's. Its URL is the encoding
  of a request Schema (§9.1), and the same Schema is what `serveImages`
  decodes.
- `foldkit-media/unpic` wraps unpic's `transformUrl` for third-party hosts.
  unpic is an optional peer, as an adapter's library is here. *Probe*: its
  operation types per provider, and whether `transform` of an already-resized
  URL is stable.
- `Provider.static(variants)` is what a build-time import carries (§10): a table
  of emitted files, no URL scheme at all.
- A provider that cannot write a URL for a width (a static table without it)
  makes that candidate absent from `srcset`, never a broken URL.

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

An application may pass its own `sizes` when its layout knows better (a grid
column is a third of the page); the candidates still come from the layout.

## 7. The `Image` view

In `mixins-ui`, built like `Avatar`: `Slots.define`, `SlotView.buildersFor`, a
recipe placed in `components` and `variants`. `mixins-ui` takes `foldkit-media`
as a peer; its root export is pure, and sharp lives behind a subpath that the
view never imports.

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
  WebP, then the original's), so the URL alone decides the bytes and every CDN
  can cache it without `Vary: Accept`. This replaces the `Accept` negotiation
  proposed in conversation: a cache keyed by URL is right on every host.
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
  LowRes: {}, // ask the provider for a 24px version
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
mixin with a Mount that listens for `load` and `error` and sets `data-state`
on the `img`. The recipe then clears the placeholder and fades on `loaded`, and
on `failed` hides the image so a `fallback` drawn beneath it shows, as `Avatar`
stacks its initials.

- It sends no Message, so by the rule for such Mounts it is never on by
  default; it ships beside the style, like `Tabs.fluid`.
- An image already complete when the Mount runs (from the cache) must be read
  at insert, not waited for.
- A Mount reads its args once, so an `img` whose `src` changes is keyed by its
  `src`.
- The fade's duration multiplies by `motion`, not `travel`: it does not move.

Without it, a server-rendered image that fails shows its alt text, which is the
browser's own fallback.

### 7.5 Priority and the head

A high-priority image is usually the page's largest paint, and the browser finds
it sooner from a preload in the head. Foldkit fills head tags; it adds none, and
`foldkit-ssr`'s `Head` is a function from the rendered application to a string.
So `Image.preload(asset, provider, layout)` returns a
`<link rel="preload" as="image" imagesrcset imagesizes fetchpriority="high">`
for the application's `head` to include. It is not added for it.

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

For originals no CDN holds: CMS uploads, a repository's images outside the
build, an allowlisted host. A Fetch-style handler like `serveFetch`, usable from
Node and from a Worker.

### 9.1 The request is a Schema

```ts
// sketch
const ImageRequest = Schema.Struct({
  source: SourceKey, // an asset key, or an allowlisted URL
  hash: Schema.OptionFromNullOr(Schema.String),
  width: widths.Schema, // only the ladder's widths
  format: Schema.Literals(['avif', 'webp', 'jpeg', 'png']),
  quality: Schema.optional(Quality), // bounded, and honoured for every format
})
```

`Provider.hosted` encodes it into a path (`/_image/w640.avif/<hash>/<key>`);
`serveImages` decodes the path with the same Schema before anything else. An
unknown format is a 400, never a quiet PNG. The cache key is the encoded
request, so two spellings of one request cannot exist.

### 9.2 Services

| Service | Job | Layers |
| --- | --- | --- |
| `SourceFetcher` | Bytes of an original | Asset store (CMS media, disk, R2); remote fetch with the allowlist |
| `ImageTransformer` | Resize and encode | `foldkit-media/sharp` (Node); `foldkit-media/cloudflare` (the Images binding); a container |
| `VariantStore` | Keep what was made | Memory (tests), disk, R2, none (a CDN in front is enough) |

The layers are wired with `Layer.provide`, so a store's connection lives as long
as the handler that needs it.

### 9.3 What it guarantees, and what it refuses

- **Allowlist by exact host.** `https` only. A redirect is followed by hand and
  re-checked, and every URL the server fetches passes the same check; there is
  no second fetch path for an operation to open.
- **Limits before decoding.** A byte limit on the fetch, a pixel limit before
  decode (*probe*: sharp's `limitInputPixels`), a timeout on each step.
- **One transform per request at a time.** Concurrent misses for one encoded
  request share one fetch and one encode. *Probe*: whether Effect's `Cache`
  lookup shares a pending lookup between concurrent `get`s, or whether this
  needs an `RcMap`.
- **Immutable only when the URL holds the hash.** A request with the original's
  hash is `public, max-age=31536000, immutable`. One without (a remote original
  we have not hashed) gets a short `max-age` and an `ETag`.
- **Failure is a response.** Tagged errors map to statuses (unknown source 404,
  refused host 403, too large 413, transform failure 502), carry no internals,
  and are never cached. The original is never sent in a variant's place.
- **Variants are disposable.** Clearing the `VariantStore` costs time, not data.

On Cloudflare, prefer `Provider` for `/cdn-cgi/image/` over this server where
the originals are reachable by URL: it is a URL to write, not a service to run.

## 10. The build: `foldkit-media/vite`

`import hero from './hero.jpg?image'` gives `{ asset, provider }`:

- The plugin reads the file, takes its size, alpha and hash, and computes a
  ThumbHash from a downscale (sharp, at build time only).
- It emits a file for each ladder width up to the intrinsic width, in each
  configured format, through `emitFile`, so names carry content hashes and the
  static host's `immutable` header is true.
- `provider` is `Provider.static` over those files.
- Results are cached by the original's hash, since AVIF encoding is slow.
- In development the plugin serves the same variants from a middleware through
  the same `ImageTransformer`, so development and the build share one code path.

The same plugin serves the icon virtual modules (§8.2): both turn a file into a
typed value at build time.

## 11. Package layout

| Path | Contents | Peers |
| --- | --- | --- |
| `foldkit-media` | `ImageAsset`, `Placeholder`, `Layout`, `Widths`, `Provider`, candidates and `sizes`, ThumbHash decoding, `IconData` | `effect` |
| `foldkit-media/unpic` | Third-party providers | `unpic` (optional) |
| `foldkit-media/server` | `serveImages`, the three services, errors | |
| `foldkit-media/sharp` | `ImageTransformer` on sharp | `sharp` (optional) |
| `foldkit-media/cloudflare` | `ImageTransformer` on the Images binding | |
| `foldkit-media/vite` | `?image` imports, icon virtual modules | `vite`, `sharp` |
| `mixins-ui` `Image`, `Icon.draw` | The views | `foldkit-media` |

## 12. Testing

- **Candidates and `sizes`**: a table per layout, with a ladder and asset sizes
  chosen so that dropping the intrinsic-width cap, the `2w` bound, or the
  sort changes the answer. Mutation specs beside them.
- **The request Schema**: round trip of every encoding, refusal of a width off
  the ladder, an unknown format, and a host that only ends with an allowed one.
- **The server**: concurrent misses run one transform (a counting fake
  transformer); a failing store never sends the original; an error response is
  not cached. The fake transformer refuses what sharp refuses, or it tests
  nothing.
- **Server markup**: render `Image` to a string and parse it back, since
  `srcset`, `sizes` and `fetchpriority` must reach server output and a parser
  must build the same `picture`.
- **Browser**: the box has its final size before the image loads (geometry, not
  visibility); `Image.reveal` reads an image already complete at insert; a
  transparent image shows no placeholder through it.
- **Icons**: an unknown element fails the build; ids are equal across two
  renders; a misspelled import is a `@ts-expect-error`.
- **An example with a server** gets an e2e test that loads a page and checks the
  network for one request per image at the expected width.

## 13. Build order

1. **The core.** `ImageAsset`, `Placeholder`, `Layout`, `Widths`,
   `Provider.hosted` with its request Schema, candidates and `sizes`, ThumbHash
   decoding. Pure, unit-tested, mutation-tested.
2. **The view.** `Image` with alt, priority, placeholder, `picture`, and
   `Image.preload`; then `Image.reveal`.
3. **The server.** `serveImages`, the services, the sharp layer, then the
   Cloudflare layer and the unpic providers.
4. **The build.** `?image`, then icon data, the virtual modules, and replacing
   the two Lucide copies.
5. **Adoption.** The CMS example's `Image` block and the site's images move onto
   it, and `foldkit-cms-media`, when built, produces `ImageAsset` facts on upload.

## 14. Open questions

- **Dark variants.** corps-place inverts dark logos on its server. Here, a theme
  is chosen by the Model, not by `prefers-color-scheme`, so a `source` with a
  media query is wrong. Probably an `Option` of a second asset, chosen by the
  view from the theme it is given; whether inversion is a provider operation is
  undecided.
- **Art direction.** A different crop per breakpoint is a `picture` with
  `media` sources. It fits §7.1's markup but has no input yet.
- **Where the CMS stores the facts.** On the `Asset` row, computed on upload, is
  the obvious place; it waits on `foldkit-cms-media`.
- **unpic's fit.** If probing shows its types or its re-transform are not what
  §5 needs, the third-party providers are written here, starting with Cloudflare
  and Shopify.

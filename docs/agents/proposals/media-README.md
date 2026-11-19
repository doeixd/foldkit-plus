<!--
Proposal for packages/media/README.md, written to docs/agents/writing-docs.md.
Links are written as they would resolve from packages/media/. The pages under
docs/media/ do not exist yet: each is cut from a section of the current
README, named beside the link in the "Next" list. Snippets compiled on
2026-11-19 against foldkit-media 0.10.0 and foldkit-mixins-ui 0.28.0.
-->

# Media

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

## Show an image from your repository

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
wide. (`h` is the HTML builder Foldkit hands every view.)

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

## What the example did

- **`import hero from './hero.jpg?image'`** asks the plugin for the photo. At
  build time it measures the file once, writes a copy at each standard width up
  to the photo's own in each format, and hands your code the photo's size and
  the list of copies. Unchanged photos are not encoded again.
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

## Images that are not in your repository

A photo a user uploads, or one on another site, cannot be resized by your
build. The same `Image.view` call draws it: instead of `...hero`, you pass the
photo's size, stored when it was uploaded, and a *provider*, which writes the
URL of each copy. Which provider depends on where the copies come from:

- **On Cloudflare**, `Provider.cdnCgi()` writes the URLs of Cloudflare's own
  image resizing, so no code of yours runs.
- **On a host that resizes images** (Shopify, Cloudinary, imgix and others),
  `detect(url)` from `foldkit-media/unpic` writes that host's URLs.
- **Anywhere else**, `foldkit-media/server` is a small resizing server you run,
  on Cloudflare or Node, with a route that accepts uploads safely.

## When you have thousands of photos

Each copy is a file, so a site with thousands of photos on a static host can
run into its file limit (Cloudflare Pages allows 20,000 files on its free plan;
the standard widths and two formats make up to eighteen per photo). Write fewer
widths, or keep the photos on a resizing server or CDN instead.

## Icons

`foldkit-media` also turns SVG icons, from a folder of yours or an icon set
such as Lucide, into data your views draw inline, checked at build time. That
is a separate job with its own page: [Icons](../../docs/media/icons.md).

## Next

- Serve uploaded photos, or photos from another site:
  [Images from elsewhere](../../docs/media/sources.md) (the current
  "Providers", "Facts" and "The server" sections).
- Make the largest image load first, set a crop's focal point, or choose the
  preview painted while loading:
  [Loading and placeholders](../../docs/media/loading.md) (the current
  "Preloading", "Placeholders", "Focal point" and "Loading" sections).
- Accept uploads safely: [Uploads and files](../../docs/media/uploads.md)
  (the current "Uploads" and "Files" sections).
- Every option of the plugin and of `Image.view`: the API pages of
  [the Media section of the site](https://foldkit-plus.pages.dev/media).

import { Schema } from 'effect'
import { ImageAsset, Layout, Provider } from 'foldkit-media'
import { Image, ImageSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// What the page knows of a file: its size and what stands in for it while it
// loads. An application gets these from `foldkit-media`'s build step.
const dunes = Schema.decodeUnknownSync(ImageAsset)({
  key: 'dunes.svg',
  width: 800,
  height: 500,
  alpha: false,
  hash: null,
  placeholder: { _tag: 'Color', value: '#d9c7a3' },
})

const url = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><rect width="800" height="500" fill="#e9d8b4"/><path d="M0 360 C200 260 330 420 520 330 S760 300 800 340 V500 H0Z" fill="#c9a870"/><circle cx="610" cy="130" r="52" fill="#f6efe0"/></svg>',
)}`

// Where its variants live: here one file per width, in a real build the
// provider that wrote them (`Provider.hosted`, `Provider.cloudflare`).
const provider = Provider.fromFiles(
  [400, 800].map(width => ({ width, format: 'webp' as const, url })),
  { sources: [], fallback: 'webp' },
)

// `alt` is required: words for what the picture shows, or `Image.decorative`
// for ornament. The frame holds the box (the asset's ratio, or the recipe's
// crop) before the file arrives, so the page does not move when it does.
export default example({
  title: 'Described and decorative',
  slots: ImageSlots,
  recipe: Recipes.Image,
  view: ({ style, h }) =>
    h.div(
      [h.Style({ display: 'grid', gap: '0.75rem', inlineSize: 'min(100%, 24rem)' })],
      [
        Image.view(
          {
            asset: dunes,
            provider,
            layout: Layout.Constrained({ width: 400 }),
            alt: 'Dunes under a pale sun',
            style,
          },
          h,
        ),
        Image.view(
          {
            asset: dunes,
            provider,
            layout: Layout.Constrained({ width: 200 }),
            alt: Image.decorative,
            style,
          },
          h,
        ),
      ],
    ),
})

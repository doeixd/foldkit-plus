/**
 * Image: a `picture` whose markup is what `foldkit-media` derives (a source
 * per format, the img's candidates, its box and its loading), alt text the
 * page must choose, and the placeholder and ratio as properties a style reads.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { ImageAsset, Layout, Provider } from 'foldkit-media'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import {
  ImageSlots,
  decorative,
  described,
  preloadsIn,
  view,
  type ImageView,
} from '../src/image.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()
const style = Style.forSlots(ImageSlots)(Recipes.Image({}))

const assetOf = (facts: { alpha?: boolean; placeholder?: unknown } = {}) =>
  Schema.decodeUnknownSync(ImageAsset)({
    key: 'hero.jpg',
    width: 1000,
    height: 500,
    alpha: facts.alpha ?? false,
    hash: null,
    placeholder: facts.placeholder ?? null,
  })

const file = (width: number, format: 'avif' | 'webp') => ({
  width,
  format,
  url: `/hero-${width}.${format}`,
})
const provider = Provider.fromFiles(
  [file(200, 'webp'), file(400, 'webp'), file(800, 'webp'), file(400, 'avif'), file(800, 'avif')],
  { sources: ['avif'], fallback: 'webp' },
)

const draw = (options: Partial<ImageView> = {}) =>
  view(
    {
      asset: assetOf(),
      provider,
      layout: Layout.Constrained({ width: 400 }),
      alt: described('The finals, from the press box'),
      style,
      ...options,
    },
    h,
  )
const imgOf = (drawn: ReturnType<typeof view>) => Inert.byTag(drawn, 'img')[0]

describe('ImageSlots', () => {
  it('publishes a frame, its sources and an image, and nothing stateful', () => {
    expect(Object.keys(ImageSlots)).toEqual(['frame', 'source', 'image'])
    for (const slot of Object.values(ImageSlots)) expect(slot.capability).toBe(Capability.Container)
  })
})

describe('Image view', () => {
  it('draws a source per format before the img, each with the img’s sizes', () => {
    const drawn = draw()
    const [source] = Inert.byTag(drawn, 'source')
    expect(Inert.value(source, 'type')).toBe('image/avif')
    expect(Inert.value(source, 'srcset')).toBe('/hero-400.avif 400w, /hero-800.avif 800w')
    expect(Inert.value(source, 'sizes')).toBe(Inert.value(imgOf(drawn), 'sizes'))
  })

  it('gives the img its candidates, its box and a lazy load', () => {
    const img = imgOf(draw())
    expect(
      ['src', 'srcset', 'sizes', 'width', 'height', 'loading', 'decoding', 'fetchpriority'].map(
        name => Inert.value(img, name),
      ),
    ).toEqual([
      '/hero-400.webp',
      '/hero-200.webp 200w, /hero-400.webp 400w, /hero-800.webp 800w',
      'auto, (min-width: 400px) 400px, 100vw',
      '400',
      '200',
      'lazy',
      'async',
      undefined,
    ])
  })

  it('fetches a priority image first', () => {
    const img = imgOf(draw({ priority: true }))
    expect(['loading', 'decoding', 'fetchpriority'].map(name => Inert.value(img, name))).toEqual([
      'eager',
      undefined,
      'high',
    ])
  })

  it.each([
    ['described', described('A drum line'), 'A drum line', undefined],
    ['described in plain words', 'A drum line', 'A drum line', undefined],
    ['decorative', decorative, '', 'presentation'],
  ])('says what a %s image is', (_, alt, text, role) => {
    const img = imgOf(draw({ alt }))
    expect([Inert.value(img, 'alt'), Inert.value(img, 'role')]).toEqual([text, role])
  })

  it.each([
    [Layout.Fixed({ width: 200 }), 'fixed'],
    [Layout.Constrained({ width: 200 }), 'constrained'],
    [Layout.FullWidth(), 'full'],
  ])('marks its layout: %o', (layout, name) => {
    expect(Inert.value(imgOf(draw({ layout })), 'data-layout')).toBe(name)
  })

  it('carries its ratio and its placeholder for a style to read', () => {
    const img = imgOf(
      draw({ asset: assetOf({ placeholder: { _tag: 'Color', value: '#123456' } }) }),
    )
    expect(Inert.style(img)).toMatchObject({
      '--fk-image-ratio': '1000 / 500',
      '--fk-image-placeholder': '#123456',
    })
  })

  it('paints no placeholder behind a transparent image', () => {
    const img = imgOf(
      draw({ asset: assetOf({ alpha: true, placeholder: { _tag: 'Color', value: '#123456' } }) }),
    )
    expect(Inert.style(img)['--fk-image-placeholder']).toBeUndefined()
  })

  it('draws an empty frame, marked, when the provider has no URL for the image', () => {
    const avifOnly = Provider.fromFiles([file(400, 'avif')], { sources: [], fallback: 'webp' })
    const drawn = draw({ provider: avifOnly })
    expect(Inert.byTag(drawn, 'img')).toHaveLength(0)
    expect(Inert.value(drawn, 'data-unavailable')).toBe('')
  })
})

describe('Image view, corrected', () => {
  it('holds an unavailable image’s box and says what it shows', () => {
    const avifOnly = Provider.fromFiles([file(400, 'avif')], { sources: [], fallback: 'webp' })
    const frame = draw({ provider: avifOnly, layout: Layout.Fixed({ width: 300 }) })
    expect(Inert.style(frame)).toMatchObject({
      '--fk-image-ratio': '1000 / 500',
      '--fk-image-width': '300px',
    })
    expect([Inert.value(frame, 'role'), Inert.value(frame, 'aria-label')]).toEqual([
      'img',
      'The finals, from the press box',
    ])
  })

  it('hides an unavailable decorative image from a screen reader', () => {
    const avifOnly = Provider.fromFiles([file(400, 'avif')], { sources: [], fallback: 'webp' })
    const frame = draw({ provider: avifOnly, alt: decorative })
    expect([Inert.value(frame, 'role'), Inert.value(frame, 'aria-hidden')]).toEqual([
      undefined,
      'true',
    ])
  })

  it('carries its focal point for a crop to keep', () => {
    const asset = Schema.decodeUnknownSync(ImageAsset)({
      key: 'hero.jpg',
      width: 1000,
      height: 500,
      alpha: false,
      hash: null,
      placeholder: null,
      focus: { x: 0.25, y: 0.8 },
    })
    expect(Inert.style(imgOf(draw({ asset })))['--fk-image-focus']).toBe('25% 80%')
  })
})

describe('Image.preloadsIn', () => {
  it('names a priority img’s own candidates, not an earlier picture’s source', () => {
    const html =
      '<picture><source type="image/avif" srcset="/other.avif 400w"><img src="/other.webp"></picture>' +
      '<img fetchpriority="high" srcset="/bare-400.webp 400w" sizes="400px" src="/bare-400.webp">'
    expect(preloadsIn({ html })).toBe(
      '<link rel="preload" as="image" imagesrcset="/bare-400.webp 400w" imagesizes="400px" fetchpriority="high">',
    )
  })
})

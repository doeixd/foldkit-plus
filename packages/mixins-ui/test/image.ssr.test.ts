// @vitest-environment jsdom
/**
 * The image rendered on a server, as a browser parses it: the candidates,
 * `sizes` and fetch priority reach the markup, the `picture` parses as drawn,
 * and `loading` comes before `src`, so no browser starts an eager fetch of a
 * lazy image while it reads the tag. Foldkit keeps that order, not the view:
 * `src` is a property, written after every attribute on the server and set
 * after them in the browser (its attributes module runs before its props).
 */
import { Effect, Schema } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { ImageAsset, Layout, Provider } from 'foldkit-media'
import { expect, test } from 'vitest'
import { described, view } from '../src/image.js'

test('the image is served with its candidates, ready before the page hydrates', async () => {
  const asset = Schema.decodeUnknownSync(ImageAsset)({
    key: 'hero.jpg',
    width: 1000,
    height: 500,
    alpha: false,
    hash: null,
    placeholder: { _tag: 'Color', value: '#123456' },
  })
  const provider = Provider.fromFiles(
    [
      { width: 400, format: 'webp', url: '/hero-400.webp' },
      { width: 400, format: 'avif', url: '/hero-400.avif' },
    ],
    { sources: ['avif'], fallback: 'webp' },
  )
  const served = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: {} }),
        view: (_: unknown, h: HtmlBuilder<never>) => ({
          title: 'Image',
          body: view(
            {
              asset,
              provider,
              layout: Layout.Fixed({ width: 400 }),
              alt: described('The finals'),
              priority: true,
            },
            h,
          ),
        }),
      },
      { buildId: 'b' },
    ),
  )
  const page = new DOMParser().parseFromString(
    injectIntoTemplate(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      served,
    ),
    'text/html',
  )
  const source = page.querySelector('picture > source')
  const img = page.querySelector('picture > img')
  expect(source?.getAttribute('srcset')).toBe('/hero-400.avif 400w')
  expect(
    ['srcset', 'sizes', 'fetchpriority', 'loading', 'width', 'height', 'alt'].map(name =>
      img?.getAttribute(name),
    ),
  ).toEqual(['/hero-400.webp 400w', '400px', 'high', 'eager', '400', '200', 'The finals'])
  expect(img?.getAttribute('style')).toContain('--fk-image-placeholder')
  const tag = /<img[^>]*>/.exec(served.html)?.[0] ?? ''
  expect(tag.indexOf('loading=')).toBeGreaterThan(-1)
  expect(tag.indexOf('loading=')).toBeLessThan(tag.indexOf(' src='))
})

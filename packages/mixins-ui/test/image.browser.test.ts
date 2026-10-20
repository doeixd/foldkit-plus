/**
 * Images in a real browser, whose files never arrive (every URL is a 404): the
 * box is still the drawn size in the original's ratio, so nothing moves when a
 * picture lands; a constrained image narrows with its container; a full-width
 * one fills it; and the placeholder paints the box meanwhile.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { ImageAsset, Layout, Provider } from 'foldkit-media'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Image, ImageSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({}))
const L = Layers.standard
const Model = Schema.Struct({})
const style = Style.forSlots(ImageSlots)(Recipes.Image({}))

const asset = Schema.decodeUnknownSync(ImageAsset)({
  key: 'hero.jpg',
  width: 1000,
  height: 500,
  alpha: false,
  hash: null,
  placeholder: { _tag: 'Color', value: '#123456' },
})
const provider = Provider.fromFiles(
  [400, 800].map(width => ({ width, format: 'webp' as const, url: `/never-${width}.webp` })),
  { sources: [], fallback: 'webp' },
)

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const column = (width: string, label: string, layout: Layout.Layout, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ inlineSize: width })],
    [Image.view({ asset, provider, layout, alt: Image.described(label), style }, h)],
  )

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'images'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style({ display: 'grid', gap: '16px', padding: '16px', justifyItems: 'start' })],
          [
            column('1000px', 'wide', Layout.Constrained({ width: 400 }), h),
            column('300px', 'narrow', Layout.Constrained({ width: 400 }), h),
            column('1200px', 'full', Layout.FullWidth(), h),
          ],
        ),
    }),
  )
}

const box = (label: string) => {
  const rect = document.querySelector(`img[alt="${label}"]`)!.getBoundingClientRect()
  return [Math.round(rect.width), Math.round(rect.height)]
}

test('an image that has not arrived already holds its box, painted with its placeholder', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(3))
    expect(box('wide')).toEqual([400, 200])
    expect(box('narrow')).toEqual([300, 150])
    expect(box('full')).toEqual([1200, 600])
    expect(getComputedStyle(document.querySelector('img[alt="wide"]')!).backgroundColor).toBe(
      'rgb(18, 52, 86)',
    )
  } finally {
    handle.dispose()
  }
})

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

const pixel = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"><rect width="4" height="2" fill="teal"/></svg>')}`
const arriving = Provider.fromFiles([{ width: 400, format: 'webp', url: pixel }], {
  sources: [],
  fallback: 'webp',
})

const mountWatched = (
  id: string,
  images: ReadonlyArray<{ readonly label: string; readonly provider: Provider.Provider }>,
) => {
  const container = document.createElement('div')
  container.id = id
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
          images.map(({ label, provider }) =>
            Image.view(
              {
                asset,
                provider,
                layout: Layout.Fixed({ width: 400 }),
                alt: Image.described(label),
                style,
                mixins: Image.watchLoad,
              },
              h,
            ),
          ),
        ),
    }),
  )
}

const imageNamed = (label: string) =>
  document.querySelector<HTMLImageElement>(`img[alt="${label}"]`)!

test('watchLoad marks an image that arrived, and hides one that failed but keeps its box', async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) + style.css
  document.head.append(sheet)
  const handle = mountWatched('watched', [
    { label: 'arrived', provider: arriving },
    { label: 'failed', provider },
  ])
  try {
    await vi.waitFor(() => {
      expect(imageNamed('arrived').getAttribute('data-state')).toBe('loaded')
      expect(imageNamed('failed').getAttribute('data-state')).toBe('failed')
    })
    expect(getComputedStyle(imageNamed('failed')).visibility).toBe('hidden')
    expect(box('failed')).toEqual([400, 200])
    expect(getComputedStyle(imageNamed('arrived')).visibility).toBe('visible')
  } finally {
    handle.dispose()
  }
})

test('watchLoad marks an image already complete when it mounts as loaded, never loading', async () => {
  const first = mountWatched('first', [{ label: 'cached', provider: arriving }])
  await vi.waitFor(() => expect(imageNamed('cached').getAttribute('data-state')).toBe('loaded'))
  first.dispose()
  document.body.replaceChildren()
  const states: Array<string | null> = []
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.target instanceof HTMLImageElement)
        states.push(record.target.getAttribute('data-state'))
    }
  })
  observer.observe(document.body, { subtree: true, attributeFilter: ['data-state'] })
  const second = mountWatched('second', [{ label: 'cached', provider: arriving }])
  try {
    await vi.waitFor(() => expect(imageNamed('cached').getAttribute('data-state')).toBe('loaded'))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(states).not.toContain('loading')
  } finally {
    observer.disconnect()
    second.dispose()
  }
})

test('an image with no variant holds the box it would have had', async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) + style.css
  document.head.append(sheet)
  const none = Provider.fromFiles([{ width: 400, format: 'avif', url: '/never.avif' }], {
    sources: [],
    fallback: 'webp',
  })
  const focused = Schema.decodeUnknownSync(ImageAsset)({
    key: 'hero.jpg',
    width: 1000,
    height: 500,
    alpha: false,
    hash: null,
    placeholder: null,
    focus: { x: 0.25, y: 0.8 },
  })
  const container = document.createElement('div')
  container.id = 'unavailable'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style({ display: 'grid', gap: '16px', padding: '16px', justifyItems: 'start' })],
          [
            ...(
              [
                ['1000px', 'wide', Layout.Constrained({ width: 400 })],
                ['300px', 'narrow', Layout.Constrained({ width: 400 })],
                ['1200px', 'full', Layout.FullWidth()],
              ] as const
            ).map(([width, label, layout]) =>
              h.div(
                [h.Style({ inlineSize: width })],
                [
                  Image.view(
                    { asset, provider: none, layout, alt: Image.described(label), style },
                    h,
                  ),
                ],
              ),
            ),
            Image.view(
              {
                asset: focused,
                provider,
                layout: Layout.Fixed({ width: 400 }),
                alt: Image.described('focused'),
                style,
              },
              h,
            ),
          ],
        ),
    }),
  )
  const frameBox = (label: string) => {
    const rect = document.querySelector(`[aria-label="${label}"]`)!.getBoundingClientRect()
    return [Math.round(rect.width), Math.round(rect.height)]
  }
  try {
    await vi.waitFor(() => expect(document.querySelectorAll('[data-unavailable]')).toHaveLength(3))
    expect(frameBox('wide')).toEqual([400, 200])
    expect(frameBox('narrow')).toEqual([300, 150])
    expect(frameBox('full')).toEqual([1200, 600])
    expect(getComputedStyle(document.querySelector('img[alt="focused"]')!).objectPosition).toBe(
      '25% 80%',
    )
  } finally {
    handle.dispose()
  }
})

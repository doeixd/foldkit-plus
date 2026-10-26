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
import { cdp } from 'vitest/browser'
import { Image, ImageSlots, Recipes } from '../src/index.js'
import { valueAfter } from './observe.js'

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
  const observer = new MutationObserver(records =>
    records.forEach((record, at) => {
      if (record.target instanceof HTMLImageElement) states.push(valueAfter(records, at))
    }),
  )
  observer.observe(document.body, {
    subtree: true,
    attributeFilter: ['data-state'],
    attributeOldValue: true,
  })
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

test('a ratio crops an image, and the box an unavailable one holds, to it; a radius rounds it', async () => {
  const squared = Style.forSlots(ImageSlots)(Recipes.Image({ ratio: 'square', radius: 'md' }))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) + squared.css
  document.head.append(sheet)
  const none = Provider.fromFiles([{ width: 400, format: 'avif', url: '/never.avif' }], {
    sources: [],
    fallback: 'webp',
  })
  const container = document.createElement('div')
  container.id = 'ratios'
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
            Image.view(
              {
                asset,
                provider,
                layout: Layout.Constrained({ width: 400 }),
                alt: Image.described('square'),
                style: squared,
              },
              h,
            ),
            Image.view(
              {
                asset,
                provider: none,
                layout: Layout.Constrained({ width: 400 }),
                alt: Image.described('missing'),
                style: squared,
              },
              h,
            ),
          ],
        ),
    }),
  )
  try {
    await vi.waitFor(() => expect(document.querySelector('img[alt="square"]')).not.toBeNull())
    const square = document.querySelector<HTMLElement>('img[alt="square"]')!
    const missing = document.querySelector<HTMLElement>('[aria-label="missing"]')!
    const sizeOf = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      return [Math.round(rect.width), Math.round(rect.height)]
    }
    expect(sizeOf(square)).toEqual([400, 400])
    expect(sizeOf(missing)).toEqual([400, 400])
    expect(parseFloat(getComputedStyle(square).borderTopLeftRadius)).toBeGreaterThan(0)
  } finally {
    handle.dispose()
  }
})

test('nothing moves as images arrive: the layout shift a page reports is none', async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) + style.css
  document.head.append(sheet)
  // The files are held in the browser until the page has been laid out, then
  // answered: only so do they arrive after the first layout, as a network's do.
  const held: Array<{ readonly requestId: string }> = []
  const hold = (event: { readonly requestId: string }) => void held.push(event)
  cdp().on('Fetch.requestPaused', hold)
  await cdp().send('Fetch.enable', { patterns: [{ urlPattern: '*held-image*' }] })
  const arriving = (name: string) =>
    Provider.fromFiles([{ width: 400, format: 'webp', url: `/held-image/${name}.svg` }], {
      sources: [],
      fallback: 'webp',
    })
  const shifts: Array<number> = []
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries())
      shifts.push((entry as PerformanceEntry & { value: number }).value)
  })
  observer.observe({ type: 'layout-shift' })
  const container = document.createElement('div')
  container.id = 'shifts'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style({ display: 'grid', gap: '16px', padding: '16px', inlineSize: '800px' })],
          [
            h.p([], ['Above']),
            Image.view(
              {
                asset,
                provider: arriving('constrained'),
                layout: Layout.Constrained({ width: 400 }),
                alt: Image.described('constrained'),
                priority: true,
                style,
              },
              h,
            ),
            Image.view(
              {
                asset,
                provider: arriving('full'),
                layout: Layout.FullWidth(),
                alt: Image.described('full'),
                priority: true,
                style,
              },
              h,
            ),
            h.p([], ['Below']),
          ],
        ),
    }),
  )
  const frames = () =>
    new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const svg = btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><rect width="1000" height="500" fill="teal"/></svg>',
  )
  try {
    await vi.waitFor(() => expect(held).toHaveLength(2))
    await frames()
    for (const { requestId } of held) {
      await cdp().send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'content-type', value: 'image/svg+xml' }],
        body: svg,
      })
    }
    await vi.waitFor(() => {
      const images = [
        ...document.querySelectorAll<HTMLImageElement>('img[alt="constrained"], img[alt="full"]'),
      ]
      expect(images.map(image => image.naturalWidth > 0)).toEqual([true, true])
    })
    await frames()
    expect(shifts.reduce((total, value) => total + value, 0)).toBe(0)
  } finally {
    observer.disconnect()
    cdp().off('Fetch.requestPaused', hold)
    await cdp().send('Fetch.disable')
    handle.dispose()
  }
})

test('audit warns of a blurry image, a wasteful one, and two drawn with priority', async () => {
  const warnings: Array<string> = []
  const spy = vi
    .spyOn(console, 'warn')
    .mockImplementation(message => void warnings.push(String(message)))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) + style.css
  document.head.append(sheet)
  const file = (width: number) =>
    Provider.fromFiles(
      [
        {
          width: 400,
          format: 'webp',
          url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width / 2}"><rect width="${width}" height="${width / 2}" fill="teal"/></svg>`)}`,
        },
      ],
      { sources: [], fallback: 'webp' },
    )
  const container = document.createElement('div')
  container.id = 'audit'
  document.body.appendChild(container)
  const ratio = devicePixelRatio
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style({ display: 'grid', gap: '16px', padding: '16px', inlineSize: '800px' })],
          (
            [
              ['blurry', 100 * ratio, true],
              ['wasteful', 4000 * ratio, true],
              ['right', 400 * ratio, false],
            ] as const
          ).map(([label, width, priority]) =>
            Image.view(
              {
                asset,
                provider: file(width),
                layout: Layout.Fixed({ width: 400 }),
                alt: Image.described(label),
                priority,
                style,
                mixins: Image.audit,
              },
              h,
            ),
          ),
        ),
    }),
  )
  try {
    await vi.waitFor(() => {
      expect(warnings.some(warning => warning.includes('blurry'))).toBe(true)
      expect(warnings.some(warning => warning.includes('wasted bytes'))).toBe(true)
    })
    // A `load` still queued when the Mount found the image complete: the same file again.
    document
      .querySelectorAll('img[alt="blurry"], img[alt="wasteful"]')
      .forEach(image => image.dispatchEvent(new Event('load')))
    expect(warnings.filter(warning => warning.includes('blurry'))).toHaveLength(1)
    expect(warnings.filter(warning => warning.includes('wasted bytes'))).toHaveLength(1)
    expect(warnings.some(warning => warning.includes('2 images are drawn with priority'))).toBe(
      true,
    )
  } finally {
    spy.mockRestore()
    handle.dispose()
  }
})

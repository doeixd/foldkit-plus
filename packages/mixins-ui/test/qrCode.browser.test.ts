/**
 * The QR code in a real browser: dark on light on a dark page unless it
 * follows the page, square at its size, its overlay centred; and the files
 * `Download` saves read back as the value through a decoder (jsQR), in the
 * colors drawn, never a token a file cannot read.
 */
import { Effect, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import jsQR from 'jsqr'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
// From the modules, not the index: the test reads nothing else.
import * as QrCode from '../src/qrCode.js'
import { QrCodeSlots } from '../src/qrCode.js'
import { QrCode as Recipe } from '../src/recipes/qrCode.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const Model = Schema.Struct({})
const value = 'https://example.com/menu?table=12'

afterEach(() => {
  vi.restoreAllMocks()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = async (
  selection: Parameters<typeof Recipe>[0],
  scheme: 'light' | 'dark',
  overlay?: (h: HtmlBuilder<never>) => Html,
) => {
  const style = Style.forSlots(QrCodeSlots)(Recipe(selection))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme, { colorScheme: scheme })),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'qr'
  document.body.appendChild(container)
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        QrCode.view(
          { id: 'menu', value, style, ...(overlay === undefined ? {} : { overlay: overlay(h) }) },
          h,
        ),
    }),
  )
  await vi.waitFor(() => expect(document.getElementById('menu-frame')).not.toBeNull())
  const part = (selector: string) => {
    const found = document.querySelector(selector)
    if (found === null) throw new Error(`nothing drawn at ${selector}`)
    return found
  }
  return { root: part('[role="img"]'), frame: part('#menu-frame'), part }
}

/** OKLCH's lightness of a computed color, 0 to 1. */
const lightness = (color: string): number => {
  const found = /^oklch\(\s*([\d.]+)/.exec(color)
  if (found === null) throw new Error(`not an OKLCH color: ${color}`)
  return Number(found[1])
}
const fills = (part: (selector: string) => Element) => ({
  dark: lightness(getComputedStyle(part('#menu-frame path')).fill),
  light: lightness(getComputedStyle(part('#menu-frame rect')).fill),
})

test('on a dark page the code stays dark on light, unless it follows the page', async () => {
  const fixed = await mount({}, 'dark')
  const light = fills(fixed.part)
  expect(light.dark).toBeLessThan(0.3)
  expect(light.light).toBeGreaterThan(0.9)
  document.body.replaceChildren()
  const followed = await mount({ scheme: 'page' }, 'dark')
  const page = fills(followed.part)
  expect(page.dark).toBeGreaterThan(0.9)
  expect(page.light).toBeLessThan(0.3)
})

test('the code is a square of its size, and the overlay sits at its centre', async () => {
  const { frame, part } = await mount({ size: 'lg' }, 'light', h =>
    h.span([h.Style({ display: 'block', width: '100%', height: '100%' })], []),
  )
  const box = frame.getBoundingClientRect()
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
  expect(box.width).toBeCloseTo(16 * rem, 0)
  expect(box.height).toBeCloseTo(box.width, 0)
  const tile = part('[role="img"] > div').getBoundingClientRect()
  expect(tile.left + tile.width / 2).toBeCloseTo(box.left + box.width / 2, 0)
  expect(tile.top + tile.height / 2).toBeCloseTo(box.top + box.height / 2, 0)
  expect(tile.width / box.width).toBeCloseTo(0.22, 2)
})

/** Each file `Download` hands the browser, and the name it is saved under. */
const saved = () => {
  const blobs: Array<Blob> = []
  const names: Array<string> = []
  const make = URL.createObjectURL.bind(URL)
  vi.spyOn(URL, 'createObjectURL').mockImplementation(object => {
    if (object instanceof Blob) blobs.push(object)
    return make(object)
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download)
  })
  return { blobs, names }
}

const read = async (image: CanvasImageSource, side: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const context = canvas.getContext('2d')!
  context.drawImage(image, 0, 0, side, side)
  const { data } = context.getImageData(0, 0, side, side)
  return jsQR(data, side, side)?.data
}

test('downloads a PNG of the code that reads back as its value', async () => {
  await mount({}, 'dark')
  const files = saved()
  const message = await Effect.runPromise(
    QrCode.Download({ id: 'menu', format: 'png', filename: 'menu', pixels: 400 }).effect,
  )
  expect(message).toEqual(QrCode.Message.Downloaded({ format: 'png' }))
  expect(files.names).toEqual(['menu.png'])
  const [png] = files.blobs
  expect(png?.type).toBe('image/png')
  const bitmap = await createImageBitmap(png!)
  expect([bitmap.width, bitmap.height]).toEqual([400, 400])
  expect(await read(bitmap, 400)).toBe(value)
})

test('downloads an SVG in the colors drawn, which reads back as its value', async () => {
  await mount({}, 'light')
  const files = saved()
  await Effect.runPromise(
    QrCode.Download({ id: 'menu', format: 'svg', filename: 'menu', pixels: 300 }).effect,
  )
  expect(files.names).toEqual(['menu.svg'])
  const svg = await files.blobs[0]!.text()
  expect(svg).not.toContain('var(')
  expect(svg).not.toContain('class=')
  expect(svg.match(/fill="[^"]+"/g)).toHaveLength(2)
  const image = new Image()
  image.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  await image.decode()
  expect(await read(image, 300)).toBe(value)
})

test('a download of a code not drawn fails as a Message', async () => {
  await mount({}, 'light')
  const message = await Effect.runPromise(
    QrCode.Download({ id: 'nowhere', format: 'svg', filename: 'x', pixels: 100 }).effect,
  )
  expect(message).toEqual(
    QrCode.Message.DownloadFailed({ message: 'no QR code is drawn with the id nowhere' }),
  )
})

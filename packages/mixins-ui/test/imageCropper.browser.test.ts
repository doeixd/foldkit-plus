/**
 * The image cropper in a real browser: the selection is drawn over the part
 * of the image its crop names, a handle sits on its corner and a drag on it
 * resizes, a drag on the selection moves it, the keys step from the crop
 * before them however fast they come and scroll nothing, the wheel zooms
 * and scrolls nothing, and `Export` draws the crop, turned, and clipped
 * round with its corners clear.
 */
import { Option, Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
// From the modules, not the index: the test reads nothing else.
import * as ImageCropper from '../src/imageCropper.js'
import { ImageCropperSlots } from '../src/imageCropper.js'
import { ImageCropper as Recipe } from '../src/recipes/imageCropper.js'
import { Slider as SliderRecipe } from '../src/recipes/slider.js'
import { SliderSlots } from '../src/slider.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(ImageCropperSlots)(Recipe({}))
const slider = Style.forSlots(SliderSlots)(SliderRecipe({}))

const Model = Schema.Struct({
  cropper: ImageCropper.Model,
  exported: Schema.OptionFromNullOr(Schema.String),
})
type Model = typeof Model.Type

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/**
 * An 800 by 600 picture whose quarters tell its orientation: green top
 * left, red bottom left, and its right half blue.
 */
const picture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 600
  const context = canvas.getContext('2d')!
  context.fillStyle = '#0000ff'
  context.fillRect(0, 0, 800, 600)
  context.fillStyle = '#ff0000'
  context.fillRect(0, 300, 400, 300)
  context.fillStyle = '#00ff00'
  context.fillRect(0, 0, 400, 300)
  return canvas.toDataURL('image/png')
})()

const mount = (
  options: Parameters<typeof ImageCropper.init>[0] = { id: 'photo' },
  src = picture,
) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    style.css +
    slider.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'image-cropper-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { cropper: ImageCropper.init(options), exported: Option.none() } }),
      update: (model: Model, message: ImageCropper.Message) => {
        const next = ImageCropper.update(model.cropper, message)
        const exported = message._tag === 'Exported' ? Option.some(message.url) : model.exported
        return {
          model: modifyFields(model, { cropper: () => next.model, exported: () => exported }),
          commands: mapMessages(next.commands ?? [], message => message),
        }
      },
      view: (model: Model, h: HtmlBuilder<ImageCropper.Message>) =>
        h.div(
          // Border box, as the reset has it: 400 pixels inside the padding.
          [h.Style({ padding: '2rem', inlineSize: 'calc(400px + 4rem)' })],
          [
            ImageCropper.view(
              {
                model: model.cropper,
                label: 'Profile photo',
                src,
                onMessage: message => message,
                style,
                slider,
              },
              h,
            ),
            h.button(
              [
                h.Id('export'),
                h.OnClick(ImageCropper.Message.RequestedExport({ type: 'image/png', quality: 1 })),
              ],
              ['Export'],
            ),
            ...Option.match(model.exported, {
              onNone: () => [],
              onSome: url => [h.output([h.Id('exported'), h.DataAttribute('url', url)], [])],
            }),
          ],
        ),
    }),
  )
}

const selection = () => document.getElementById('photo-selection')
const viewport = () => selection()!.parentElement!.parentElement!
const handle = (name: string) => document.querySelector<HTMLElement>(`[data-handle="${name}"]`)!
const said = () => selection()?.getAttribute('aria-valuetext')
const zoomed = () => document.querySelector<HTMLInputElement>('input[id^="photo-zoom"]')?.value
const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

/** The selection drawn and its transitions done, so a box reads where it rests. */
const settled = async () => {
  await vi.waitFor(() => expect(selection()).not.toBeNull())
  await frame()
  await vi.waitFor(() => expect(viewport().getAnimations({ subtree: true })).toEqual([]))
}

const drag = (element: HTMLElement, dx: number, dy: number) => {
  const box = element.getBoundingClientRect()
  const [x, y] = [box.left + box.width / 2, box.top + box.height / 2]
  const at = (type: string, by: number) =>
    element.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 3,
        button: 0,
        clientX: x + dx * by,
        clientY: y + dy * by,
      }),
    )
  at('pointerdown', 0)
  at('pointermove', 0.5)
  at('pointermove', 1)
  at('pointerup', 1)
}

/** The pixels of a data URL, read back through a canvas. */
const pixels = async (url: string) => {
  const image = new Image()
  image.src = url
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')!
  context.drawImage(image, 0, 0)
  return {
    width: canvas.width,
    height: canvas.height,
    at: (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data),
  }
}

const urlOf = () => document.getElementById('exported')?.dataset['url']

/** Asks for an export, and reads the picture once it differs from what was shown before. */
const exported = async () => {
  const before = urlOf()
  document.getElementById('export')!.click()
  const url = await vi.waitFor(() => {
    const found = urlOf()
    expect(found).not.toBe(before)
    return found!
  })
  return pixels(url)
}

test('the selection covers the part of the image its crop names, a handle on its corner', async () => {
  const handleMount = mount()
  try {
    await settled()
    const area = viewport().getBoundingClientRect()
    expect([area.width, area.height]).toEqual([400, 300])
    const box = selection()!.getBoundingClientRect()
    // 640 by 480 at 80, 60 of an 800 by 600 image drawn at half size.
    expect([box.left - area.left, box.top - area.top, box.width, box.height]).toEqual([
      40, 30, 320, 240,
    ])
    const corner = handle('se').getBoundingClientRect()
    expect(corner.left + corner.width / 2).toBeCloseTo(box.right, 0)
    expect(corner.top + corner.height / 2).toBeCloseTo(box.bottom, 0)
    // The image fills the viewport it fits.
    const image = document.getElementById('photo-image')!.getBoundingClientRect()
    expect([image.left - area.left, image.width, image.height]).toEqual([0, 400, 300])
  } finally {
    handleMount.dispose()
  }
})

test('measures an image that loads after it is drawn', async () => {
  // A blob is read asynchronously, so the image is drawn before it has loaded.
  const blob = await (await fetch(picture)).blob()
  const url = URL.createObjectURL(blob)
  const handleMount = mount({ id: 'photo' }, url)
  try {
    await settled()
    expect(said()).toBe('Left 80, top 60, 640 by 480 pixels')
  } finally {
    handleMount.dispose()
    URL.revokeObjectURL(url)
  }
})

test('a drag on a handle resizes, and on the selection moves it', async () => {
  const handleMount = mount()
  try {
    await settled()
    drag(handle('se'), 40, 40)
    await vi.waitFor(() => expect(said()).toBe('Left 80, top 60, 720 by 540 pixels'))
    await settled()
    expect(selection()!.getBoundingClientRect().width).toBe(360)
    drag(selection()!, -20, -10)
    await vi.waitFor(() => expect(said()).toBe('Left 40, top 40, 720 by 540 pixels'))
    // The drag ended: a move after the release moves nothing.
    selection()!.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 3, clientX: 0, clientY: 0 }),
    )
    await frame()
    await frame()
    expect(said()).toBe('Left 40, top 40, 720 by 540 pixels')
  } finally {
    handleMount.dispose()
  }
})

test('keys faster than a frame each step from the crop before them, scrolling nothing', async () => {
  const handleMount = mount()
  try {
    await settled()
    selection()!.focus()
    const scrolled = window.scrollY
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowDown}')
    await vi.waitFor(() => expect(said()).toBe('Left 86, top 62, 640 by 480 pixels'))
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await vi.waitFor(() => expect(said()).toBe('Left 86, top 62, 640 by 482 pixels'))
    expect(window.scrollY).toBe(scrolled)
    const before = selection()!.getBoundingClientRect().width
    await userEvent.keyboard('+')
    await vi.waitFor(() => expect(zoomed()).toBe('110'))
    await settled()
    // Zooming magnifies the image under a selection that stays as drawn.
    expect(selection()!.getBoundingClientRect().width).toBeCloseTo(before, 0)
  } finally {
    handleMount.dispose()
  }
})

test('the wheel zooms, and does not scroll the page', async () => {
  const handleMount = mount()
  try {
    await settled()
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -200 })
    selection()!.dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(Number(zoomed())).toBeGreaterThan(100))
  } finally {
    handleMount.dispose()
  }
})

test('exports the crop of the image as turned', async () => {
  const handleMount = mount({ id: 'photo', crop: { x: 0, y: 0, width: 800, height: 300 } })
  try {
    await settled()
    const flat = await exported()
    expect([flat.width, flat.height]).toEqual([800, 300])
    expect(flat.at(100, 100)).toEqual([0, 255, 0, 255])
    expect(flat.at(700, 100)).toEqual([0, 0, 255, 255])
    await userEvent.click(document.querySelector<HTMLElement>('[data-turn="right"]')!)
    await vi.waitFor(() => expect(said()).toBe('Left 300, top 0, 300 by 800 pixels'))
    // Turned clockwise, the top of the picture is its right: green above blue.
    const turned = await exported()
    expect([turned.width, turned.height]).toEqual([300, 800])
    expect(turned.at(150, 100)).toEqual([0, 255, 0, 255])
    expect(turned.at(150, 700)).toEqual([0, 0, 255, 255])
  } finally {
    handleMount.dispose()
  }
})

test('a round crop is drawn round, and exports with its corners clear', async () => {
  const handleMount = mount({ id: 'photo', shape: 'round', aspect: 1 })
  try {
    await settled()
    const drawn = getComputedStyle(selection()!)
    expect(parseFloat(drawn.borderTopLeftRadius)).toBeGreaterThanOrEqual(
      selection()!.getBoundingClientRect().width / 2,
    )
    const round = await exported()
    expect([round.width, round.height]).toEqual([480, 480])
    expect(round.at(2, 2)[3]).toBe(0)
    expect(round.at(240, 240)[3]).toBe(255)
  } finally {
    handleMount.dispose()
  }
})

/**
 * The image cropper as markup and as a Model. The markup: a group named by
 * its label, busy until the image and the viewport are measured, then a
 * selection that is a slider saying its crop, eight hidden handles, and the
 * geometry in pixels for the recipe. The Model: a drag applied to the crop
 * it began with, kept inside the image and what the viewport shows, at
 * least its least size, at its aspect when locked; keys decided from the
 * crop `update` holds; zoom keeping the selection where it is on screen;
 * quarter turns carrying the crop along; the export a Command.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { A11y, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { ImageCropper, ImageCropperSlots, Patterns } from '../src/index.js'
import { ImageCropper as Recipe } from '../src/recipes/imageCropper.js'
import { message, type TestMessage } from './fixture.js'

const style = Style.forSlots(ImageCropperSlots)(Recipe({}))
const { Message } = ImageCropper

const step = (from: ImageCropper.Model, sent: ImageCropper.Message) =>
  ImageCropper.update(from, sent).model
const steps = (from: ImageCropper.Model, ...sent: ReadonlyArray<ImageCropper.Message>) =>
  sent.reduce(step, from)

/** A 800 by 600 image in a 400 by 300 viewport: half a CSS pixel per image pixel. */
const placed = (options: Parameters<typeof ImageCropper.init>[0] = { id: 'photo' }) =>
  steps(
    ImageCropper.init(options),
    Message.MeasuredViewport({ width: 400, height: 300 }),
    Message.LoadedImage({ width: 800, height: 600 }),
  )

const cropOf = (model: ImageCropper.Model) =>
  Option.getOrThrow(Option.map(model.image, image => image.crop))

const ready = placed()

interface More {
  readonly model?: ImageCropper.Model
  readonly disabled?: boolean
}

const Cropper = SlotView.forMessages<TestMessage>().define(ImageCropperSlots, (more: More, _, h) =>
  ImageCropper.view(
    {
      model: ready,
      label: 'Profile photo',
      src: 'photo.jpg',
      onMessage: () => message('Clicked'),
      style,
      ...more,
    },
    h,
  ),
)
const drawn = (more: More = {}) => Inert.draw(Cropper, more)

describe('ImageCropper.view', () => {
  it('meets the cropper pattern', () => {
    expect(A11y.validate(Patterns.ImageCropper, ImageCropperSlots)).toEqual([])
  })

  it('is a group named by its label, its selection a slider saying the crop', () => {
    const cropper = drawn()
    const [group] = Inert.byRole(cropper, 'group')
    const [label] = Inert.bySlot(cropper, 'label')
    expect(Inert.value(group, 'aria-labelledby')).toBe(Inert.value(label, 'id'))
    expect(Inert.value(group, 'aria-busy')).toBeUndefined()
    const [selection] = Inert.bySlot(cropper, 'selection')
    expect(Inert.value(selection, 'role')).toBe('slider')
    expect(Inert.value(selection, 'aria-label')).toBe('Crop area')
    expect(Inert.value(selection, 'aria-valuetext')).toBe('Left 80, top 60, 640 by 480 pixels')
    expect(Inert.value(selection, 'tabindex')).toBe(0)
    const handles = Inert.bySlot(cropper, 'handle')
    expect(handles.map(handle => Inert.value(handle, 'data-handle'))).toEqual([
      'n',
      'ne',
      'e',
      'se',
      's',
      'sw',
      'w',
      'nw',
    ])
    expect(new Set(handles.map(handle => Inert.value(handle, 'aria-hidden')))).toEqual(
      new Set(['true']),
    )
  })

  it('draws nothing outside a Slot', () => {
    expect(Inert.unslotted(drawn())).toEqual([])
  })

  it('writes the selection and the image in viewport pixels', () => {
    const [viewport] = Inert.bySlot(drawn(), 'viewport')
    const geometry = Inert.style(viewport)
    expect(['x', 'y', 'w', 'h'].map(name => geometry[`--fk-cropper-${name}`])).toEqual([
      '40px',
      '30px',
      '320px',
      '240px',
    ])
    expect(['x', 'y', 'w', 'h'].map(name => geometry[`--fk-cropper-image-${name}`])).toEqual([
      '0px',
      '0px',
      '400px',
      '300px',
    ])
    expect(geometry['--fk-cropper-rotation']).toBe('0deg')
  })

  it('is busy, with no selection, until the image and the viewport are measured', () => {
    const loading = ImageCropper.init({ id: 'photo' })
    const cropper = drawn({ model: loading })
    expect(Inert.value(Inert.byRole(cropper, 'group')[0], 'aria-busy')).toBe('true')
    expect(Inert.bySlot(cropper, 'selection')).toEqual([])
    // The image is drawn all the same, so it can load.
    expect(Inert.bySlot(cropper, 'image')).toHaveLength(1)
    const buttons = Inert.byTag(cropper, 'button')
    expect(buttons.every(button => Inert.value(button, 'disabled') === true)).toBe(true)
  })

  it('takes no keys and no presses when disabled', () => {
    const cropper = drawn({ disabled: true })
    const [selection] = Inert.bySlot(cropper, 'selection')
    expect(Inert.value(selection, 'tabindex')).toBeUndefined()
    expect(Inert.value(selection, 'aria-disabled')).toBe('true')
    expect(selection?.data?.on?.['keydown']).toBeUndefined()
    const buttons = Inert.byTag(cropper, 'button')
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.every(button => Inert.value(button, 'disabled') === true)).toBe(true)
  })

  it('marks a round crop for the recipe', () => {
    const round = placed({ id: 'photo', shape: 'round', aspect: 1 })
    expect(Inert.value(Inert.byRole(drawn({ model: round }), 'group')[0], 'data-shape')).toBe(
      'round',
    )
  })
})

describe('ImageCropper.update', () => {
  it('starts with four fifths of the image, centered, or at the locked aspect', () => {
    expect(cropOf(ready)).toEqual({ x: 80, y: 60, width: 640, height: 480 })
    expect(cropOf(placed({ id: 'a', aspect: 1 }))).toEqual({
      x: 160,
      y: 60,
      width: 480,
      height: 480,
    })
  })

  it('starts with the crop it is given, brought inside the image', () => {
    const given = placed({ id: 'a', crop: { x: 700, y: 0, width: 300, height: 100 } })
    expect(cropOf(given)).toEqual({ x: 500, y: 0, width: 300, height: 100 })
  })

  it('moves the selection from where the drag began, in image pixels', () => {
    const started = step(ready, Message.StartedDrag({ part: 'selection' }))
    // 20 CSS pixels are 40 of the image; the second move is from the start, not from the first.
    const moved = steps(
      started,
      Message.Dragged({ part: 'selection', deltaX: 20, deltaY: 0 }),
      Message.Dragged({ part: 'selection', deltaX: 10, deltaY: 5 }),
    )
    expect(cropOf(moved)).toEqual({ x: 100, y: 70, width: 640, height: 480 })
    const far = step(started, Message.Dragged({ part: 'selection', deltaX: 900, deltaY: -900 }))
    expect(cropOf(far)).toEqual({ x: 160, y: 0, width: 640, height: 480 })
  })

  it('resizes from a handle, its opposite corner held, inside the image', () => {
    const started = step(ready, Message.StartedDrag({ part: 'se' }))
    const grown = step(started, Message.Dragged({ part: 'se', deltaX: 100, deltaY: 40 }))
    expect(cropOf(grown)).toEqual({ x: 80, y: 60, width: 720, height: 540 })
    const nw = step(ready, Message.StartedDrag({ part: 'nw' }))
    const least = step(nw, Message.Dragged({ part: 'nw', deltaX: 2000, deltaY: 2000 }))
    // 24 CSS pixels at half a pixel each, the bottom right corner where it was.
    expect(cropOf(least)).toEqual({ x: 672, y: 492, width: 48, height: 48 })
  })

  it('keeps a locked aspect: an edge resizes about its middle, a corner follows the farther edge', () => {
    const square = placed({ id: 'a', aspect: 1 })
    const east = steps(
      square,
      Message.StartedDrag({ part: 'e' }),
      Message.Dragged({ part: 'e', deltaX: 20, deltaY: 0 }),
    )
    expect(cropOf(east)).toEqual({ x: 160, y: 40, width: 520, height: 520 })
    const corner = steps(
      square,
      Message.StartedDrag({ part: 'se' }),
      Message.Dragged({ part: 'se', deltaX: 5, deltaY: 30 }),
    )
    expect(cropOf(corner)).toEqual({ x: 160, y: 60, width: 540, height: 540 })
  })

  it('lets no second pointer on another part steer the drag, and ends it once', () => {
    const started = step(ready, Message.StartedDrag({ part: 'selection' }))
    expect(step(started, Message.Dragged({ part: 'se', deltaX: 10, deltaY: 10 }))).toBe(started)
    expect(step(ready, Message.Dragged({ part: 'selection', deltaX: 10, deltaY: 0 }))).toBe(ready)
    const ended = step(started, Message.EndedDrag())
    expect(ended.drag).toEqual(Option.none())
    expect(step(ended, Message.EndedDrag())).toBe(ended)
  })

  it.each([
    ['ArrowRight', false, false, { x: 82, y: 60, width: 640, height: 480 }],
    ['ArrowLeft', true, false, { x: 60, y: 60, width: 640, height: 480 }],
    ['ArrowDown', false, false, { x: 80, y: 62, width: 640, height: 480 }],
    ['ArrowRight', false, true, { x: 80, y: 60, width: 642, height: 480 }],
    ['ArrowUp', true, true, { x: 80, y: 60, width: 640, height: 460 }],
  ] as const)('%s (shift %s, alt %s) moves or resizes by screen pixels', (key, shift, alt, to) => {
    expect(cropOf(step(ready, Message.PressedKey({ key, shift, alt })))).toEqual(to)
  })

  it('steps each key from the crop before it, as keys faster than a frame arrive', () => {
    const right = Message.PressedKey({ key: 'ArrowRight', shift: false, alt: false })
    expect(cropOf(steps(ready, right, right, right)).x).toBe(86)
  })

  it('keeps its Model for a key it does not take, a prototype name among them', () => {
    for (const key of ['Tab', 'constructor', 'toString'])
      expect(step(ready, Message.PressedKey({ key, shift: false, alt: false }))).toBe(ready)
  })

  it('zooms with the selection where it was on screen, inside its bounds', () => {
    const zoomed = step(ready, Message.ChangedZoom({ zoom: 2 }))
    expect(zoomed.zoom).toBe(2)
    expect(cropOf(zoomed)).toEqual({ x: 240, y: 180, width: 320, height: 240 })
    const [viewport] = Inert.bySlot(drawn({ model: zoomed }), 'viewport')
    const geometry = Inert.style(viewport)
    expect(['x', 'w'].map(name => geometry[`--fk-cropper-${name}`])).toEqual(['40px', '320px'])
    expect(geometry['--fk-cropper-image-w']).toBe('800px')
    expect(step(ready, Message.ChangedZoom({ zoom: 9 })).zoom).toBe(3)
    expect(step(ready, Message.ChangedZoom({ zoom: 0.5 }))).toBe(ready)
    const plus = step(ready, Message.PressedKey({ key: '+', shift: false, alt: false }))
    expect(plus.zoom).toBe(1.1)
    expect(step(plus, Message.PressedKey({ key: '-', shift: false, alt: false })).zoom).toBe(1)
    expect(step(ready, Message.Wheeled({ deltaY: -100 })).zoom).toBeGreaterThan(1)
    // Two fingers spread to twice their distance: twice the zoom, as far as it goes.
    expect(step(ready, Message.Pinched({ ratio: 2 })).zoom).toBe(2)
    expect(step(ready, Message.Pinched({ ratio: 9 })).zoom).toBe(3)
  })

  it('does not zoom before the image is placed', () => {
    const loading = ImageCropper.init({ id: 'a' })
    expect(step(loading, Message.ChangedZoom({ zoom: 2 }))).toBe(loading)
  })

  it('pans a zoomed image with the crop, and not one that fits', () => {
    const zoomed = step(ready, Message.ChangedZoom({ zoom: 2 }))
    const panned = steps(
      zoomed,
      Message.StartedDrag({ part: 'image' }),
      Message.Dragged({ part: 'image', deltaX: 100, deltaY: 0 }),
    )
    expect(cropOf(panned)).toEqual({ x: 140, y: 180, width: 320, height: 240 })
    // As far as the image goes: the view's left edge at the image's.
    const edge = steps(
      zoomed,
      Message.StartedDrag({ part: 'image' }),
      Message.Dragged({ part: 'image', deltaX: 900, deltaY: 0 }),
    )
    expect(cropOf(edge).x).toBe(40)
    const fit = step(ready, Message.StartedDrag({ part: 'image' }))
    expect(step(fit, Message.Dragged({ part: 'image', deltaX: 50, deltaY: 50 }))).toBe(fit)
  })

  it('carries the crop through a quarter turn, and four turns back to where it was', () => {
    const turn = Message.Turned({ clockwise: true })
    const once = step(ready, turn)
    expect(once.rotation).toBe(90)
    expect(cropOf(once)).toEqual({ x: 60, y: 80, width: 480, height: 640 })
    expect(cropOf(step(once, Message.Turned({ clockwise: false })))).toEqual(cropOf(ready))
    const back = steps(ready, turn, turn, turn, turn)
    expect([back.rotation, cropOf(back)]).toEqual([0, cropOf(ready)])
  })

  it('keeps a locked aspect through a turn', () => {
    const wide = step(placed({ id: 'a', aspect: 16 / 9 }), Message.Turned({ clockwise: true }))
    const { width, height } = cropOf(wide)
    expect(width / height).toBeCloseTo(16 / 9, 6)
  })

  it('locks a new aspect, frees it, and refuses one that is no ratio', () => {
    const square = step(ready, Message.ChangedAspect({ aspect: Option.some(1) }))
    const { width, height } = cropOf(square)
    expect(width).toBeCloseTo(height, 6)
    expect(step(square, Message.ChangedAspect({ aspect: Option.some(1) }))).toBe(square)
    expect(step(ready, Message.ChangedAspect({ aspect: Option.none() }))).toBe(ready)
    for (const ratio of [0, -1, Number.NaN])
      expect(step(ready, Message.ChangedAspect({ aspect: Option.some(ratio) }))).toBe(ready)
    expect(() => ImageCropper.init({ id: 'a', aspect: 0 })).toThrow('positive ratio')
  })

  it('resets the crop, the zoom and the turn', () => {
    const changed = steps(
      ready,
      Message.ChangedZoom({ zoom: 2 }),
      Message.Turned({ clockwise: true }),
      Message.PressedKey({ key: 'ArrowRight', shift: true, alt: false }),
    )
    const reset = step(changed, Message.Reset())
    expect([reset.zoom, reset.rotation, cropOf(reset)]).toEqual([1, 0, cropOf(ready)])
    expect(step(reset, Message.Reset())).toBe(reset)
  })

  it('keeps its Model for a measure that changes nothing', () => {
    expect(step(ready, Message.MeasuredViewport({ width: 400, height: 300 }))).toBe(ready)
    expect(step(ready, Message.MeasuredViewport({ width: 0, height: 0 }))).toBe(ready)
    expect(step(ready, Message.LoadedImage({ width: 800, height: 600 }))).toBe(ready)
  })

  it('places the image the same whichever is measured first', () => {
    const imageFirst = steps(
      ImageCropper.init({ id: 'photo' }),
      Message.LoadedImage({ width: 800, height: 600 }),
      Message.MeasuredViewport({ width: 400, height: 300 }),
    )
    expect(cropOf(imageFirst)).toEqual(cropOf(ready))
  })

  it('exports as a Command with the crop, or says there is nothing to export yet', () => {
    const asked = ImageCropper.update(
      ready,
      Message.RequestedExport({ type: 'image/png', quality: 1 }),
    )
    expect(asked.model).toBe(ready)
    expect(asked.commands?.map(command => command.name)).toEqual(['ImageCropper.Export'])
    expect(asked.commands?.[0]?.args).toMatchObject({
      image: 'photo-image',
      crop: { x: 80, y: 60, width: 640, height: 480 },
      rotation: 0,
      round: false,
    })
    const early = ImageCropper.update(
      ImageCropper.init({ id: 'a' }),
      Message.RequestedExport({ type: 'image/png', quality: 1 }),
    )
    expect(early.commands?.map(command => command.name)).toEqual(['ImageCropper.NothingToExport'])
  })

  it('reads the crop in whole pixels', () => {
    const thirds = step(ready, Message.ChangedZoom({ zoom: 3 }))
    expect(ImageCropper.crop(thirds)).toEqual(
      Option.some({ x: 293, y: 220, width: 213, height: 160 }),
    )
    expect(ImageCropper.crop(ImageCropper.init({ id: 'a' }))).toEqual(Option.none())
  })
})

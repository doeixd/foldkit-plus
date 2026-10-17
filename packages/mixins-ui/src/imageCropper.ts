import { Effect, Equal, Match, Option, Queue, Schema, Stream } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import { Move } from 'foldkit-primitives/dom'
import { Resize } from 'foldkit-primitives/observers'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import type { MixinList } from './resolve.js'
import * as Slider from './slider.js'
import type { SliderSlots } from './slider.js'

/**
 * An image cropper after Zag's: the image fitted in a `viewport`, a crop
 * `selection` over it that a drag moves and eight `handle`s resize, the rest
 * of the image veiled, zoom (a Slider, the wheel, `+` and `-`), quarter
 * turns, an aspect-ratio lock and a round crop. `Export` draws the crop on a
 * canvas and answers with it as a data URL.
 *
 * The crop is a small Model of this module's in the image's own pixels, of
 * the image as turned: a 4000 by 3000 photo turned a quarter is 3000 wide,
 * and a crop of its left half is `{ x: 0, y: 0, width: 1500, height: 4000 }`.
 * The view measures the viewport (`Resize`) and reads the image's natural
 * size when it loads, and every drag reaches `update` as the `Move` Mount's
 * distance from where the pointer went down, which `update` applies to the
 * crop the drag began with, so a drag never drifts.
 *
 * Zoom keeps the selection where it is on screen and magnifies the image
 * under it, so zooming in crops less of the image. While zoomed in, a drag
 * on the image outside the selection pans: the view and the crop move
 * together over the image. The selection stays inside the image and inside
 * what the viewport shows.
 *
 * The selection is one focusable `role="slider"` (Zag's "2D slider"; the APG
 * has no cropper) whose `aria-valuetext` says the crop: the arrows move it by
 * a pixel of the screen (Shift by ten), Alt with the arrows resizes it from
 * its far edges, and `+` and `-` zoom. The keys are physical, as the plane
 * is, in either direction. The handles are for the pointer and hidden from
 * assistive technology.
 *
 * The `viewport` carries the geometry for the recipe as custom properties in
 * pixels: `--fk-cropper-x`, `-y`, `-w`, `-h` (the selection),
 * `--fk-cropper-image-x`, `-y`, `-w`, `-h` (the turned image's box),
 * `--fk-cropper-natural-w`, `-h` (the image element before it is turned) and
 * `--fk-cropper-rotation`.
 */
export const ImageCropperSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  label: Slot.make({ capability: Capability.Container }),
  viewport: Slot.make({ capability: Capability.Container }),
  /** What the wheel zooms: the whole viewport, the selection included. */
  stage: Slot.make({ capability: Capability.Container }),
  /** The turned image's box, which a drag outside the selection pans. */
  pan: Slot.make({ capability: Capability.Draggable }),
  image: Slot.make({ capability: Capability.Base }),
  selection: Slot.make({
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  /** Lines at the thirds, inside the selection. */
  guides: Slot.make({ capability: Capability.Base }),
  handle: Slot.make({ capability: Capability.Draggable }),
  controls: Slot.make({ capability: Capability.Container }),
  zoom: Slot.make({ capability: Capability.Container }),
  rotate: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
  reset: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
})

// ---------------------------------------------------------------- geometry

export const Size = Schema.Struct({ width: Schema.Number, height: Schema.Number })
export type Size = typeof Size.Type

const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number })
type Point = typeof Point.Type

/** A rectangle in the turned image's pixels. */
export const Rect = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
})
export type Rect = typeof Rect.Type

/** Quarter turns clockwise, in degrees. */
export const Rotation = Schema.Literals([0, 90, 180, 270])
export type Rotation = typeof Rotation.Type

/** `round` crops the ellipse inside the rectangle, a circle at an aspect of 1. */
export const Shape = Schema.Literals(['rectangle', 'round'])
export type Shape = typeof Shape.Type

const Handle = Schema.Literals(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'])
type Handle = typeof Handle.Type

const handles: ReadonlyArray<Handle> = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

/** What a drag holds: a handle, the selection, or the image to pan. */
const Part = Schema.Literals([...handles, 'selection', 'image'])
type Part = typeof Part.Type

/** The smallest the selection is drawn, in CSS pixels, so its handles stay apart. */
const LEAST_ON_SCREEN = 24

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const round = (value: number, places = 2) => Number(value.toFixed(places))

const turned = (natural: Size, rotation: Rotation): Size =>
  rotation % 180 === 0 ? natural : { width: natural.height, height: natural.width }

const same = (left: Rect, right: Rect) =>
  left.x === right.x &&
  left.y === right.y &&
  left.width === right.width &&
  left.height === right.height

/** Where the turned image sits in the viewport, at a scale of CSS pixels per image pixel. */
interface Frame {
  readonly size: Size
  readonly scale: number
  readonly focus: Point
  /** What the viewport shows, in image pixels: `focus` at its center. */
  readonly window: Rect
}

const fitOf = (viewport: Size, size: Size) =>
  Math.min(viewport.width / size.width, viewport.height / size.height)

/**
 * `focus` kept so the viewport shows only the image: on an axis the image
 * does not fill, it stays at the image's middle.
 */
const heldFocus = (focus: Point, size: Size, viewport: Size, scale: number): Point => {
  const axis = (at: number, length: number, shown: number) =>
    shown >= length ? length / 2 : clamp(at, shown / 2, length - shown / 2)
  return {
    x: axis(focus.x, size.width, viewport.width / scale),
    y: axis(focus.y, size.height, viewport.height / scale),
  }
}

const frameOf = (viewport: Size, size: Size, zoom: number, focus: Point): Frame => {
  const scale = fitOf(viewport, size) * zoom
  const held = heldFocus(focus, size, viewport, scale)
  const [width, height] = [viewport.width / scale, viewport.height / scale]
  return {
    size,
    scale,
    focus: held,
    window: { x: held.x - width / 2, y: held.y - height / 2, width, height },
  }
}

/** Where the selection may be: the image, and of it what the viewport shows. */
const boundsOf = (frame: Frame): Rect => {
  const x = Math.max(0, frame.window.x)
  const y = Math.max(0, frame.window.y)
  return {
    x,
    y,
    width: Math.min(frame.size.width, frame.window.x + frame.window.width) - x,
    height: Math.min(frame.size.height, frame.window.y + frame.window.height) - y,
  }
}

/** The least size a crop takes: the Model's, and never under `LEAST_ON_SCREEN` drawn. */
const leastOf = (min: Size, scale: number): Size => ({
  width: Math.max(min.width, LEAST_ON_SCREEN / scale),
  height: Math.max(min.height, LEAST_ON_SCREEN / scale),
})

/**
 * `crop` brought inside `bounds`: no larger than they are (at `aspect`, if
 * locked), no smaller than `least` where they have room, and moved inside.
 */
const fitted = (crop: Rect, bounds: Rect, least: Size, aspect: Option.Option<number>): Rect => {
  const [width, height] = Option.match(aspect, {
    onNone: () => [
      clamp(crop.width, Math.min(least.width, bounds.width), bounds.width),
      clamp(crop.height, Math.min(least.height, bounds.height), bounds.height),
    ],
    onSome: ratio => {
      const most = Math.min(bounds.width, bounds.height * ratio)
      const fewest = Math.min(Math.max(least.width, least.height * ratio), most)
      // The ratio's width nearest the crop's own area.
      const width = clamp(Math.sqrt(crop.width * crop.height * ratio), fewest, most)
      return [width, width / ratio]
    },
  })
  return {
    x: clamp(crop.x, bounds.x, bounds.x + bounds.width - width),
    y: clamp(crop.y, bounds.y, bounds.y + bounds.height - height),
    width,
    height,
  }
}

/** The crop a new image starts with: four fifths of it, centered, at `aspect`. */
const startingCrop = (size: Size, aspect: Option.Option<number>): Rect => {
  const [width, height] = Option.match(aspect, {
    onNone: () => [size.width * 0.8, size.height * 0.8],
    onSome: ratio => {
      const width = Math.min(size.width, size.height * ratio) * 0.8
      return [width, width / ratio]
    },
  })
  return { x: (size.width - width) / 2, y: (size.height - height) / 2, width, height }
}

/**
 * `from` resized by `handle` moved `dx`, `dy` image pixels: the edges it
 * holds move, the opposite ones stay, and an axis it does not hold stays
 * centered. Kept inside `bounds` and at least `least`; with `aspect`, the
 * edge moved farther leads and the other follows.
 */
const resized = (
  from: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  bounds: Rect,
  least: Size,
  aspect: Option.Option<number>,
): Rect => {
  // Which way each axis grows: 1 toward the end, -1 toward the start, 0 held.
  const sign = (start: string, end: string) =>
    (handle.includes(end) ? 1 : 0) - (handle.includes(start) ? 1 : 0)
  const [sx, sy] = [sign('w', 'e'), sign('n', 's')]
  // What stays put: the edge opposite the one moved, or the middle of an axis not held.
  const ax = from.x + (from.width * (1 - sx)) / 2
  const ay = from.y + (from.height * (1 - sy)) / 2
  const room = (s: number, anchor: number, low: number, high: number) => {
    const edge = s > 0 ? high : low
    return s === 0 ? 2 * Math.min(anchor - low, high - anchor) : Math.abs(edge - anchor)
  }
  const roomX = room(sx, ax, bounds.x, bounds.x + bounds.width)
  const roomY = room(sy, ay, bounds.y, bounds.y + bounds.height)
  const wanted = { width: from.width + sx * dx, height: from.height + sy * dy }
  const [width, height] = Option.match(aspect, {
    onNone: () => [
      clamp(wanted.width, Math.min(least.width, roomX), roomX),
      clamp(wanted.height, Math.min(least.height, roomY), roomY),
    ],
    onSome: ratio => {
      // An edge handle moves one axis; a corner follows whichever it moved farther.
      const led = Math.max(sx === 0 ? 0 : wanted.width, sy === 0 ? 0 : wanted.height * ratio)
      const most = Math.min(roomX, roomY * ratio)
      const width = clamp(led, Math.min(Math.max(least.width, least.height * ratio), most), most)
      return [width, width / ratio]
    },
  })
  return {
    x: ax - (width * (1 - sx)) / 2,
    y: ay - (height * (1 - sy)) / 2,
    width,
    height,
  }
}

/** A point of the image as turned a quarter more, clockwise or not, in an image `size` before the turn. */
const turnPoint = (point: Point, size: Size, clockwise: boolean): Point =>
  clockwise ? { x: size.height - point.y, y: point.x } : { x: point.y, y: size.width - point.x }

const turnRect = (rect: Rect, size: Size, clockwise: boolean): Rect => {
  const corner = turnPoint(
    clockwise ? { x: rect.x, y: rect.y + rect.height } : { x: rect.x + rect.width, y: rect.y },
    size,
    clockwise,
  )
  return { ...corner, width: rect.height, height: rect.width }
}

// ---------------------------------------------------------------- the Model

const Placed = Schema.Struct({
  /** The image's natural size, before it is turned. */
  natural: Size,
  crop: Rect,
  /** The point of the turned image at the viewport's center. */
  focus: Point,
})

const Drag = Schema.Struct({ part: Part, crop: Rect, focus: Point })

export const Model = Schema.Struct({
  /** Prefixes every id the cropper draws; unique on the page. */
  id: Schema.String,
  shape: Shape,
  /** Width over height while locked. */
  aspect: Schema.OptionFromNullOr(Schema.Number),
  /** The least crop, in image pixels. */
  min: Size,
  /** 1 fits the whole image in the viewport. */
  zoom: Schema.Number,
  maxZoom: Schema.Number,
  rotation: Rotation,
  /** The crop to start with once the image loads, as `init` was given it. */
  initial: Schema.OptionFromNullOr(Rect),
  viewport: Schema.OptionFromNullOr(Size),
  /** None until the image has loaded. */
  image: Schema.OptionFromNullOr(Placed),
  /** While a pointer drags: what it holds, and the crop and focus it began with. */
  drag: Schema.OptionFromNullOr(Drag),
})
export type Model = typeof Model.Type

const isRatio = (value: number) => Number.isFinite(value) && value > 0

export const init = (options: {
  readonly id: string
  /** Width over height, locked; default free. */
  readonly aspect?: number | undefined
  readonly shape?: Shape | undefined
  /** The crop to start with, in the image's pixels; default four fifths of it, centered. */
  readonly crop?: Rect | undefined
  /** The least crop in image pixels; default 1 by 1. */
  readonly min?: Size | undefined
  /** Default 3. */
  readonly maxZoom?: number | undefined
}): Model => {
  if (options.aspect !== undefined && !isRatio(options.aspect))
    throw new Error(`ImageCropper.init: an aspect is a positive ratio, not ${options.aspect}`)
  return {
    id: options.id,
    shape: options.shape ?? 'rectangle',
    aspect: Option.fromNullishOr(options.aspect),
    min: options.min ?? { width: 1, height: 1 },
    zoom: 1,
    maxZoom: options.maxZoom ?? 3,
    rotation: 0,
    initial: Option.fromNullishOr(options.crop),
    viewport: Option.none(),
    image: Option.none(),
    drag: Option.none(),
  }
}

const ExportType = Schema.Literals(['image/png', 'image/jpeg', 'image/webp'])

export const Message = defineMessageUnion({
  MeasuredViewport: { width: Schema.Number, height: Schema.Number },
  /** The image's natural size, when it has loaded. */
  LoadedImage: { width: Schema.Number, height: Schema.Number },
  StartedDrag: { part: Part },
  /** How far the pointer is from where it went down, in CSS pixels. */
  Dragged: { part: Part, deltaX: Schema.Number, deltaY: Schema.Number },
  EndedDrag: {},
  Wheeled: { deltaY: Schema.Number },
  /** A key on the selection; `update` decides what it does, from the crop it holds. */
  PressedKey: { key: Schema.String, shift: Schema.Boolean, alt: Schema.Boolean },
  ChangedZoom: { zoom: Schema.Number },
  Turned: { clockwise: Schema.Boolean },
  /** A new lock, or none to free the crop. */
  ChangedAspect: { aspect: Schema.OptionFromNullOr(Schema.Number) },
  /** Back to the crop it started with, unturned and unzoomed. */
  Reset: {},
  /** Answer it with `Export`, which `update` returns as its Command. */
  RequestedExport: { type: ExportType, quality: Schema.Number },
  /** The crop, drawn: a data URL of `width` by `height` pixels. */
  Exported: { url: Schema.String, width: Schema.Number, height: Schema.Number },
  /** Nothing to draw yet, or the browser refused (an image of another origin, say). */
  FailedExport: { reason: Schema.String },
})
export type Message = typeof Message.Type

const keys: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  '+',
  '=',
  '-',
  '_',
])

// A Map, so a key named after a prototype member finds nothing.
const arrows: ReadonlyMap<string, Point> = new Map([
  ['ArrowLeft', { x: -1, y: 0 }],
  ['ArrowRight', { x: 1, y: 0 }],
  ['ArrowUp', { x: 0, y: -1 }],
  ['ArrowDown', { x: 0, y: 1 }],
])

const rotations: ReadonlyArray<Rotation> = [0, 90, 180, 270]

const ZOOM_STEP = 0.1

const imageId = (model: Model) => `${model.id}-image`

/** The crop in whole image pixels, as `Export` draws it; none before the image loads. */
export const crop = (model: Model): Option.Option<Rect> =>
  Option.map(model.image, image => whole(image.crop))

const whole = ({ x, y, width, height }: Rect): Rect => ({
  x: Math.round(x),
  y: Math.round(y),
  width: Math.round(width),
  height: Math.round(height),
})

/**
 * Draws the crop of the image the view drew (found by id) on a canvas, turned
 * and, for a round shape, clipped to its ellipse with the corners left clear.
 */
export const Export = Command.define('ImageCropper.Export', {
  args: {
    image: Schema.String,
    natural: Size,
    rotation: Rotation,
    crop: Rect,
    round: Schema.Boolean,
    type: ExportType,
    quality: Schema.Number,
  },
  messages: [Message.Exported, Message.FailedExport],
  execute: args =>
    Effect.try(() => {
      const source = document.getElementById(args.image)
      if (!(source instanceof HTMLImageElement) || !source.complete || source.naturalWidth === 0)
        return Message.FailedExport({ reason: notLoaded })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(args.crop.width))
      canvas.height = Math.max(1, Math.round(args.crop.height))
      const context = canvas.getContext('2d')
      if (context === null) return Message.FailedExport({ reason: 'No 2D canvas.' })
      if (args.round) {
        context.beginPath()
        context.ellipse(
          canvas.width / 2,
          canvas.height / 2,
          canvas.width / 2,
          canvas.height / 2,
          0,
          0,
          2 * Math.PI,
        )
        context.clip()
      }
      context.translate(-Math.round(args.crop.x), -Math.round(args.crop.y))
      const { width, height } = args.natural
      const origin: Record<Rotation, Point> = {
        0: { x: 0, y: 0 },
        90: { x: height, y: 0 },
        180: { x: width, y: height },
        270: { x: 0, y: width },
      }
      context.translate(origin[args.rotation].x, origin[args.rotation].y)
      context.rotate((args.rotation * Math.PI) / 180)
      context.drawImage(source, 0, 0, width, height)
      return Message.Exported({
        url: canvas.toDataURL(args.type, args.quality),
        width: canvas.width,
        height: canvas.height,
      })
    }).pipe(
      // A tainted canvas (an image of another origin without CORS) throws on reading it.
      Effect.catch(error => Effect.succeed(Message.FailedExport({ reason: String(error) }))),
    ),
})

const notLoaded = 'The image has not loaded.'

/** Answers an export asked for before the image loaded, so the asker still hears back. */
const NothingToExport = Command.define('ImageCropper.NothingToExport', {
  messages: [Message.FailedExport],
  execute: Effect.sync(() => Message.FailedExport({ reason: notLoaded })),
})

/** The Model with `next` placed, or the same Model when it reads the same. */
const placed = (model: Model, next: typeof Placed.Type): Model =>
  Option.match(model.image, {
    onNone: () => modifyFields(model, { image: () => Option.some(next) }),
    onSome: image =>
      same(image.crop, next.crop) &&
      image.focus.x === next.focus.x &&
      image.focus.y === next.focus.y
        ? model
        : modifyFields(model, { image: () => Option.some(next) }),
  })

/** What the cropper knows once both the viewport and the image are measured. */
const sceneOf = (model: Model) =>
  Option.flatMap(model.viewport, viewport =>
    Option.map(model.image, image => {
      const size = turned(image.natural, model.rotation)
      const frame = frameOf(viewport, size, model.zoom, image.focus)
      return { viewport, image, size, frame, least: leastOf(model.min, frame.scale) }
    }),
  )

/** The image with its crop and focus brought back inside what the view allows. */
const settled = (model: Model): Model =>
  Option.match(sceneOf(model), {
    onNone: () => model,
    onSome: ({ image, frame, least }) =>
      placed(model, {
        ...image,
        focus: frame.focus,
        crop: fitted(image.crop, boundsOf(frame), least, model.aspect),
      }),
  })

/** The zoom set to `next`, the selection kept where it is on screen. */
const zoomed = (model: Model, next: number): Model => {
  const zoom = round(clamp(next, 1, model.maxZoom), 4)
  if (zoom === model.zoom) return model
  const changed = modifyFields(model, { zoom: () => zoom })
  return Option.match(sceneOf(model), {
    // Nothing to zoom before the image is placed.
    onNone: () => model,
    onSome: ({ image, frame }) => {
      const ratio = model.zoom / zoom
      const { crop: from } = image
      const center = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
      const [width, height] = [from.width * ratio, from.height * ratio]
      return settled(
        modifyFields(changed, {
          image: () =>
            Option.some({
              ...image,
              // The crop's center stays on the same point of the screen.
              focus: {
                x: center.x - (center.x - frame.focus.x) * ratio,
                y: center.y - (center.y - frame.focus.y) * ratio,
              },
              crop: { x: center.x - width / 2, y: center.y - height / 2, width, height },
            }),
        }),
      )
    },
  })
}

/** The crop moved or resized as `part` dragged `screenX`, `screenY` CSS pixels from `from`. */
const dragged = (
  model: Model,
  part: Part,
  screenX: number,
  screenY: number,
  from: { readonly crop: Rect; readonly focus: Point },
): Model =>
  Option.match(sceneOf(model), {
    onNone: () => model,
    onSome: ({ image, viewport, size, frame, least }) => {
      const [dx, dy] = [screenX / frame.scale, screenY / frame.scale]
      const bounds = boundsOf(frame)
      if (part === 'image') {
        const focus = heldFocus(
          { x: from.focus.x - dx, y: from.focus.y - dy },
          size,
          viewport,
          frame.scale,
        )
        const [sx, sy] = [focus.x - from.focus.x, focus.y - from.focus.y]
        return placed(model, {
          ...image,
          focus,
          crop: { ...from.crop, x: from.crop.x + sx, y: from.crop.y + sy },
        })
      }
      if (part === 'selection') {
        return placed(model, {
          ...image,
          crop: {
            ...from.crop,
            x: clamp(from.crop.x + dx, bounds.x, bounds.x + bounds.width - from.crop.width),
            y: clamp(from.crop.y + dy, bounds.y, bounds.y + bounds.height - from.crop.height),
          },
        })
      }
      return placed(model, {
        ...image,
        crop: resized(from.crop, part, dx, dy, bounds, least, model.aspect),
      })
    },
  })

/** The cropper after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return<Model, Message> => {
  const just = (next: Model) => ({ model: next })
  return Message.match(message, {
    MeasuredViewport: ({ width, height }) =>
      width <= 0 ||
      height <= 0 ||
      Option.exists(model.viewport, at => at.width === width && at.height === height)
        ? just(model)
        : just(settled(modifyFields(model, { viewport: () => Option.some({ width, height }) }))),
    LoadedImage: ({ width, height }) => {
      if (width <= 0 || height <= 0) return just(model)
      const natural = { width, height }
      if (
        Option.exists(model.image, at => at.natural.width === width && at.natural.height === height)
      )
        return just(model)
      const size = turned(natural, model.rotation)
      return just(
        settled(
          modifyFields(model, {
            image: () =>
              Option.some({
                natural,
                focus: { x: size.width / 2, y: size.height / 2 },
                crop: Option.getOrElse(model.initial, () => startingCrop(size, model.aspect)),
              }),
          }),
        ),
      )
    },
    StartedDrag: ({ part }) =>
      just(
        Option.match(model.image, {
          onNone: () => model,
          onSome: image =>
            modifyFields(model, {
              drag: () => Option.some({ part, crop: image.crop, focus: image.focus }),
            }),
        }),
      ),
    Dragged: ({ part, deltaX, deltaY }) =>
      just(
        Option.match(model.drag, {
          onNone: () => model,
          onSome: drag => {
            // A second pointer on another part does not steer this drag.
            if (drag.part !== part) return model
            return dragged(model, part, deltaX, deltaY, drag)
          },
        }),
      ),
    EndedDrag: () =>
      just(Option.isNone(model.drag) ? model : modifyFields(model, { drag: () => Option.none() })),
    Wheeled: ({ deltaY }) => just(zoomed(model, model.zoom * Math.exp(-deltaY * 0.002))),
    PressedKey: ({ key, shift, alt }) => {
      if (key === '+' || key === '=') return just(zoomed(model, model.zoom + ZOOM_STEP))
      if (key === '-' || key === '_') return just(zoomed(model, model.zoom - ZOOM_STEP))
      const arrow = arrows.get(key)
      if (arrow === undefined) return just(model)
      return just(
        Option.match(model.image, {
          onNone: () => model,
          onSome: image => {
            const by = shift ? 10 : 1
            // Alt resizes from the far edges: right and down grow it.
            const edge = arrow.x === 0 ? 's' : 'e'
            const part = alt ? edge : 'selection'
            return dragged(model, part, arrow.x * by, arrow.y * by, image)
          },
        }),
      )
    },
    ChangedZoom: ({ zoom }) => just(zoomed(model, zoom)),
    Turned: ({ clockwise }) => {
      const rotation = rotations[(rotations.indexOf(model.rotation) + (clockwise ? 1 : 3)) % 4] ?? 0
      return just(
        settled(
          modifyFields(model, {
            rotation: () => rotation,
            image: () =>
              Option.map(model.image, image => {
                const before = turned(image.natural, model.rotation)
                return {
                  ...image,
                  crop: turnRect(image.crop, before, clockwise),
                  focus: turnPoint(image.focus, before, clockwise),
                }
              }),
          }),
        ),
      )
    },
    ChangedAspect: ({ aspect }) =>
      Equal.equals(aspect, model.aspect) || Option.exists(aspect, ratio => !isRatio(ratio))
        ? just(model)
        : just(settled(modifyFields(model, { aspect: () => aspect }))),
    Reset: () =>
      just(
        Option.match(model.image, {
          onNone: () => model,
          onSome: image => {
            const crop = Option.getOrElse(model.initial, () =>
              startingCrop(image.natural, model.aspect),
            )
            const focus = { x: image.natural.width / 2, y: image.natural.height / 2 }
            return model.zoom === 1 &&
              model.rotation === 0 &&
              same(crop, image.crop) &&
              image.focus.x === focus.x &&
              image.focus.y === focus.y
              ? model
              : settled(
                  modifyFields(model, {
                    zoom: () => 1,
                    rotation: () => 0,
                    image: () => Option.some({ ...image, crop, focus }),
                  }),
                )
          },
        }),
      ),
    RequestedExport: ({ type, quality }) =>
      Option.match(model.image, {
        onNone: () => ({ model, commands: [NothingToExport()] }),
        onSome: image => ({
          model,
          commands: [
            Export({
              image: imageId(model),
              natural: image.natural,
              rotation: model.rotation,
              crop: image.crop,
              round: model.shape === 'round',
              type,
              quality,
            }),
          ],
        }),
      }),
    Exported: () => just(model),
    FailedExport: () => just(model),
  })
}

// ---------------------------------------------------------------- Mounts

const Loaded = Schema.TaggedStruct('Loaded', { width: Schema.Number, height: Schema.Number })

/** An image's natural size, once now if it has loaded and again at every load. */
const ImageLoad = Mount.defineStream('ImageCropperImage', {
  messages: [Loaded],
  execute: ({ element }) =>
    Stream.callback<typeof Loaded.Type>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const report = () => {
            if (!(element instanceof HTMLImageElement) || element.naturalWidth === 0) return
            Queue.offerUnsafe(
              queue,
              Loaded.make({ width: element.naturalWidth, height: element.naturalHeight }),
            )
          }
          element.addEventListener('load', report)
          if (element instanceof HTMLImageElement && element.complete) report()
          return () => element.removeEventListener('load', report)
        }),
        stop => Effect.sync(stop),
      ),
    ),
})

const Wheel = Schema.TaggedStruct('Wheel', { deltaY: Schema.Number })

/** The wheel over the element, in pixels, kept from scrolling the page. */
const WheelZoom = Mount.defineStream('ImageCropperWheel', {
  messages: [Wheel],
  execute: ({ element }) =>
    Stream.callback<typeof Wheel.Type>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const wheeled = (event: Event) => {
            if (!(event instanceof WheelEvent)) return
            event.preventDefault()
            // Lines and pages, as some mice scroll, read as the pixels they roughly are.
            const unit = [1, 16, 400][event.deltaMode] ?? 1
            Queue.offerUnsafe(queue, Wheel.make({ deltaY: event.deltaY * unit }))
          }
          // Not passive, so it may keep the page from scrolling.
          element.addEventListener('wheel', wheeled, { passive: false })
          return () => element.removeEventListener('wheel', wheeled)
        }),
        stop => Effect.sync(stop),
      ),
    ),
})

// ---------------------------------------------------------------- the view

/** The words a cropper says; each has an English default. */
export interface ImageCropperLabels {
  /** The selection; default `Crop area`. */
  readonly selection: string
  readonly zoom: string
  readonly rotateLeft: string
  readonly rotateRight: string
  readonly reset: string
  /** How the selection reads its crop; default `"Left 10, top 20, 300 by 200 pixels"`. */
  readonly crop: (crop: Rect) => string
}

const defaultLabels: ImageCropperLabels = {
  selection: 'Crop area',
  zoom: 'Zoom',
  rotateLeft: 'Rotate left',
  rotateRight: 'Rotate right',
  reset: 'Reset',
  crop: ({ x, y, width, height }) => `Left ${x}, top ${y}, ${width} by ${height} pixels`,
}

export interface ImageCropperView<Message> {
  readonly model: Model
  /** Lifts the cropper's own Messages into the application's. */
  readonly onMessage: (message: typeof Message.Type) => NoInfer<Message>
  /** What is cropped, shown and naming the group. */
  readonly label: string
  /** The image's URL; a canvas exports it only from this origin or with CORS. */
  readonly src: string
  /** `anonymous` to export an image of another origin that allows it. */
  readonly crossOrigin?: 'anonymous' | 'use-credentials' | undefined
  /** Which controls are drawn below the viewport; each default `true`. */
  readonly controls?:
    | { readonly zoom?: boolean; readonly rotate?: boolean; readonly reset?: boolean }
    | undefined
  readonly labels?: Partial<ImageCropperLabels> | undefined
  readonly disabled?: boolean | undefined
  /** A style of `ImageCropperSlots`, for the look. */
  readonly style?: NamedStyle<typeof ImageCropperSlots> | undefined
  /** The zoom Slider's style. */
  readonly slider?: NamedStyle<typeof SliderSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const px = (value: number) => `${round(value)}px`

export const view = <Outer>(options: ImageCropperView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const builders = SlotView.buildersFor(
    ImageCropperSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { model, onMessage: lift } = options
  const disabled = options.disabled === true
  const labels = { ...defaultLabels, ...options.labels }
  const controls = { zoom: true, rotate: true, reset: true, ...options.controls }
  const labelId = `${model.id}-label`
  const scene = sceneOf(model)
  const ready = Option.isSome(scene)

  /** A Move on `part`: where its drag began, how far it has gone, and its end. */
  const moving = (part: Part) =>
    h.OnMount(
      Mount.mapMessage(Move(), fact =>
        lift(
          Match.valueTags(fact, {
            MoveStarted: () => Message.StartedDrag({ part }),
            Moved: ({ deltaX, deltaY }) => Message.Dragged({ part, deltaX, deltaY }),
            MoveEnded: () => Message.EndedDrag(),
          }),
        ),
      ),
    )

  const geometry = Option.match(scene, {
    onNone: () => ({}),
    onSome: ({ image, frame, viewport }) => {
      const at = (x: number, y: number) => ({
        x: viewport.width / 2 + (x - frame.focus.x) * frame.scale,
        y: viewport.height / 2 + (y - frame.focus.y) * frame.scale,
      })
      const corner = at(image.crop.x, image.crop.y)
      const origin = at(0, 0)
      return {
        '--fk-cropper-x': px(corner.x),
        '--fk-cropper-y': px(corner.y),
        '--fk-cropper-w': px(image.crop.width * frame.scale),
        '--fk-cropper-h': px(image.crop.height * frame.scale),
        '--fk-cropper-image-x': px(origin.x),
        '--fk-cropper-image-y': px(origin.y),
        '--fk-cropper-image-w': px(frame.size.width * frame.scale),
        '--fk-cropper-image-h': px(frame.size.height * frame.scale),
        '--fk-cropper-natural-w': px(image.natural.width * frame.scale),
        '--fk-cropper-natural-h': px(image.natural.height * frame.scale),
        '--fk-cropper-rotation': `${model.rotation}deg`,
      }
    },
  })

  const button = (slot: 'rotate' | 'reset', label: string, message: Message, turn?: string) =>
    h.button(
      builders[slot].attrs([
        h.Type('button'),
        h.AriaLabel(label),
        ...(turn === undefined ? [] : [h.DataAttribute('turn', turn), h.Key(turn)]),
        ...(disabled || !ready ? [h.Disabled(true)] : [h.OnClick(lift(message))]),
      ]),
      // The turns are drawn as icons; reset says its word.
      slot === 'reset' ? [label] : [],
    )

  return h.div(
    builders.root.attrs([
      h.Role('group'),
      h.AriaLabelledBy(labelId),
      h.DataAttribute('shape', model.shape),
      ...(ready ? [h.DataAttribute('ready', '')] : [h.AriaBusy(true)]),
      ...(Option.isSome(model.drag) ? [h.DataAttribute('dragging', '')] : []),
      ...(disabled ? [h.DataAttribute('disabled', '')] : []),
    ]),
    [
      h.span(builders.label.attrs([h.Id(labelId)]), [options.label]),
      h.div(
        builders.viewport.attrs([
          // A Mount is attached once, when its element is drawn: disabling draws a new one.
          h.Key(disabled ? 'disabled' : 'enabled'),
          h.Style(geometry),
          ...(disabled
            ? []
            : [
                h.OnMount(
                  Mount.mapMessage(Resize(), ({ width, height }) =>
                    lift(Message.MeasuredViewport({ width, height })),
                  ),
                ),
              ]),
        ]),
        [
          h.div(
            builders.stage.attrs(
              disabled
                ? []
                : [
                    h.OnMount(
                      Mount.mapMessage(WheelZoom(), ({ deltaY }) =>
                        lift(Message.Wheeled({ deltaY })),
                      ),
                    ),
                  ],
            ),
            [
              h.div(builders.pan.attrs(disabled ? [] : [moving('image')]), [
                h.img(
                  builders.image.attrs([
                    // A Mount reads its element once: a new image is a new element.
                    h.Key(options.src),
                    h.Id(imageId(model)),
                    h.Src(options.src),
                    h.Alt(''),
                    h.Draggable(false),
                    ...(options.crossOrigin === undefined
                      ? []
                      : [h.Attribute('crossorigin', options.crossOrigin)]),
                    h.OnMount(
                      Mount.mapMessage(ImageLoad(), ({ width, height }) =>
                        lift(Message.LoadedImage({ width, height })),
                      ),
                    ),
                  ]),
                ),
              ]),
              ...Option.match(scene, {
                onNone: () => [],
                onSome: ({ size, image }) => {
                  const rect = whole(image.crop)
                  return [
                    h.div(
                      builders.selection.attrs([
                        h.Id(`${model.id}-selection`),
                        h.Role('slider'),
                        h.AriaRoleDescription('2D slider'),
                        h.AriaLabel(labels.selection),
                        h.AriaValuemin(0),
                        h.AriaValuemax(Math.round(size.width - rect.width)),
                        h.AriaValuenow(rect.x),
                        h.AriaValuetext(labels.crop(rect)),
                        ...(disabled
                          ? [h.AriaDisabled(true)]
                          : [
                              h.Tabindex(0),
                              h.OnKeyDownPreventDefault((key, modifiers) =>
                                keys.has(key)
                                  ? Option.some(
                                      lift(
                                        Message.PressedKey({
                                          key,
                                          shift: modifiers.shiftKey,
                                          alt: modifiers.altKey,
                                        }),
                                      ),
                                    )
                                  : Option.none(),
                              ),
                              moving('selection'),
                            ]),
                      ]),
                      [h.div(builders.guides.attrs([h.AriaHidden(true)]), [])],
                    ),
                    ...handles.map(handle =>
                      h.div(
                        builders.handle.attrs([
                          h.Key(handle),
                          h.DataAttribute('handle', handle),
                          h.AriaHidden(true),
                          ...(disabled ? [] : [moving(handle)]),
                        ]),
                        [],
                      ),
                    ),
                  ]
                },
              }),
            ],
          ),
        ],
      ),
      ...(controls.zoom || controls.rotate || controls.reset
        ? [
            h.div(builders.controls.attrs(), [
              ...(controls.zoom
                ? [
                    h.div(builders.zoom.attrs(), [
                      Slider.view(
                        {
                          id: `${model.id}-zoom`,
                          label: labels.zoom,
                          value: Math.round(model.zoom * 100),
                          min: 100,
                          max: Math.round(model.maxZoom * 100),
                          format: value => `${value}%`,
                          onChange: zoom => lift(Message.ChangedZoom({ zoom: zoom / 100 })),
                          disabled: disabled || !ready,
                          style: options.slider,
                        },
                        h,
                      ),
                    ]),
                  ]
                : []),
              ...(controls.rotate
                ? [
                    button(
                      'rotate',
                      labels.rotateLeft,
                      Message.Turned({ clockwise: false }),
                      'left',
                    ),
                    button(
                      'rotate',
                      labels.rotateRight,
                      Message.Turned({ clockwise: true }),
                      'right',
                    ),
                  ]
                : []),
              ...(controls.reset ? [button('reset', labels.reset, Message.Reset())] : []),
            ]),
          ]
        : []),
    ],
  )
}

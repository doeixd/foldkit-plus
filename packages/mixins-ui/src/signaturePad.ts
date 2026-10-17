import { Effect, Match, Option, Schema, Stream } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import { measurePaddingBox, PointerPosition, type PointerFact } from 'foldkit-primitives/dom'
import { Resize, Resized } from 'foldkit-primitives/observers'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import type { MixinList } from './resolve.js'

/**
 * A signature pad after Zag's: strokes drawn with a pointer on a `control`
 * above a dashed `guide` and a "Sign here" `placeholder`, undo and clear, and
 * a text field where a name can be typed instead, for whoever cannot draw.
 *
 * The strokes are data in a small Model of this module's: each a list of
 * points with the pen's pressure, in the pad's own coordinates (its size
 * when first measured; a pad drawn larger later scales what it is sent into
 * them). A pen's pressure is used as the browser reports it; a mouse or a
 * finger reports none worth reading, so the stroke thins as it speeds up
 * instead. Each stroke is drawn as the outline of a variable-width line,
 * smoothed, after perfect-freehand's method: `pathOf` gives its SVG path
 * data, `toSvg` the whole drawing as an SVG document, and `ExportPng` draws
 * it on a canvas as a PNG data URL.
 *
 * The signature is the drawing, or, while nothing is drawn, the typed name,
 * which the pad shows on its line in the recipe's script face and both
 * exports write. The control is an image to assistive technology, named by
 * what it holds; the typed field is the way to sign by keyboard.
 */
export const SignaturePadSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  label: Slot.make({ capability: Capability.Container }),
  control: Slot.make({ capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] }),
  /** The SVG holding the strokes. */
  segments: Slot.make({ capability: Capability.Base }),
  stroke: Slot.make({ capability: Capability.Base }),
  /** The line to sign on. */
  guide: Slot.make({ capability: Capability.Base }),
  /** "Sign here", shown while the pad is empty. */
  placeholder: Slot.make({ capability: Capability.Base }),
  /** The typed name, drawn on the line while nothing is drawn. */
  typedName: Slot.make({ capability: Capability.Base }),
  controls: Slot.make({ capability: Capability.Container }),
  undo: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
  clear: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
  fallback: Slot.make({ capability: Capability.Container }),
  fallbackLabel: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input],
    attributes: [Attr.AriaLabel, Attr.Disabled, Attr.Value],
  }),
})

// ---------------------------------------------------------------- the Model

const Size = Schema.Struct({ width: Schema.Number, height: Schema.Number })
type Size = typeof Size.Type

/** A point of a stroke in the pad's coordinates, and the pen's pressure there, 0 to 1. */
export const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number, pressure: Schema.Number })
export type Point = typeof Point.Type

export const Stroke = Schema.Struct({
  points: Schema.Array(Point),
  /** Whether `pressure` is the pen's; otherwise it is simulated from speed. */
  pressure: Schema.Boolean,
})
export type Stroke = typeof Stroke.Type

/** How strokes are drawn: their width, how much pressure thins them, and how much they are smoothed. */
export const Pen = Schema.Struct({
  /** The widest a stroke is, in the pad's pixels. */
  size: Schema.Number,
  /** 0 to 1: how much less pressure narrows a stroke. */
  thinning: Schema.Number,
  /** 0 to 1: how much a stroke trails its points, which steadies a shaky hand. */
  smoothing: Schema.Number,
})
export type Pen = typeof Pen.Type

export const Model = Schema.Struct({
  /** Prefixes every id the pad draws; unique on the page. */
  id: Schema.String,
  pen: Pen,
  /** The pad's coordinates: its size when first measured. */
  space: Schema.OptionFromNullOr(Size),
  strokes: Schema.Array(Stroke),
  /** The stroke under way, while a pointer is down. */
  drawing: Schema.OptionFromNullOr(Stroke),
  /** A name typed instead of drawn. */
  typed: Schema.String,
})
export type Model = typeof Model.Type

export const init = (options: {
  readonly id: string
  readonly pen?: Partial<Pen> | undefined
}): Model => ({
  id: options.id,
  pen: { size: 4, thinning: 0.6, smoothing: 0.5, ...options.pen },
  space: Option.none(),
  strokes: [],
  drawing: Option.none(),
  typed: '',
})

/** Whether there is nothing to sign with: no stroke drawn and no name typed. */
export const isEmpty = (model: Model): boolean =>
  model.strokes.length === 0 && model.typed.trim() === ''

const Box = { width: Schema.Number, height: Schema.Number }
const Raw = Schema.Struct({ x: Schema.Number, y: Schema.Number, pressure: Schema.Number })

export const Message = defineMessageUnion({
  /** The control's size, when it is drawn and when it changes. */
  Measured: Box,
  /** A pointer went down at `x`, `y` of a control `width` by `height`. */
  Began: { ...Box, point: Raw, pen: Schema.Boolean },
  /** It moved through `points`, in the control's pixels. */
  Extended: { ...Box, points: Schema.Array(Raw) },
  Ended: {},
  Undid: {},
  Cleared: {},
  Typed: { text: Schema.String },
  /** Answer it with `ExportPng`, which `update` returns as its Command. */
  RequestedPng: {
    /** Canvas pixels per pad pixel; 2 for a sharp image on most screens. */
    scale: Schema.Number,
    /** A CSS color behind the strokes; none leaves it clear. */
    background: Schema.OptionFromNullOr(Schema.String),
  },
  /** The signature, drawn: a PNG data URL of `width` by `height` pixels. */
  ExportedPng: { url: Schema.String, width: Schema.Number, height: Schema.Number },
  /** Nothing to draw, or the browser could not. */
  FailedExport: { reason: Schema.String },
})
export type Message = typeof Message.Type

/** Points nearer than this to the last, in the pad's pixels, add nothing but noise. */
const MIN_DISTANCE = 1

/** A point the control reported, in the pad's coordinates. */
const into = (space: Size, box: Size, raw: typeof Raw.Type): Point => ({
  x: box.width > 0 ? (raw.x * space.width) / box.width : raw.x,
  y: box.height > 0 ? (raw.y * space.height) / box.height : raw.y,
  pressure: Math.min(1, Math.max(0, raw.pressure)),
})

const spaceOf = (model: Model, box: Size): Size => Option.getOrElse(model.space, () => box)

const segmentsId = (model: Model) => `${model.id}-segments`
const typedNameId = (model: Model) => `${model.id}-typed-name`

// ---------------------------------------------------------------- drawing

interface Xy {
  readonly x: number
  readonly y: number
}

const lerp = (from: Xy, to: Xy, t: number): Xy => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
})
const distance = (a: Xy, b: Xy) => Math.hypot(b.x - a.x, b.y - a.y)

/** How fast simulated pressure follows speed, perfect-freehand's rate. */
const PRESSURE_RATE = 0.275

/** A circle as `steps` points, from `start` radians, for a dot or a cap. */
const arc = (center: Xy, radius: number, start: number, sweep: number, steps: number) =>
  Array.from({ length: steps + 1 }, (_, step) => {
    const angle = start + (sweep * step) / steps
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
  })

/**
 * The outline of a stroke as a polygon: each point streamlined toward the
 * last, given a radius from its pressure, and offset both ways across the
 * stroke's direction, with a round cap at each end.
 */
const outlineOf = (stroke: Stroke, pen: Pen): ReadonlyArray<Xy> => {
  const [first, ...rest] = stroke.points
  if (first === undefined) return []
  const follow = 1 - pen.smoothing * 0.85
  const placed: Array<Xy & { readonly radius: number }> = []
  let previous: Xy = first
  let pressure = stroke.pressure ? first.pressure : 0.5
  const radiusOf = (at: number) => Math.max(0.25, pen.size * (0.5 - pen.thinning * (0.5 - at)))
  placed.push({ ...first, radius: radiusOf(pressure) })
  for (const point of rest) {
    const next = lerp(previous, point, follow)
    const travelled = distance(previous, next)
    if (stroke.pressure) pressure = point.pressure
    else {
      // Faster is thinner: pressure eases toward what the speed allows.
      const speed = Math.min(1, travelled / pen.size)
      pressure = Math.min(1, pressure + (1 - speed - pressure) * speed * PRESSURE_RATE)
    }
    placed.push({ ...next, radius: radiusOf(pressure) })
    previous = next
  }
  const last = placed[placed.length - 1]!
  const spread = placed.length > 1 && distance(placed[0]!, last) > 0
  if (!spread) return arc(placed[0]!, placed[0]!.radius, 0, 2 * Math.PI, 16)
  const left: Array<Xy> = []
  const right: Array<Xy> = []
  placed.forEach((point, step) => {
    const from = placed[Math.max(0, step - 1)]!
    const to = placed[Math.min(placed.length - 1, step + 1)]!
    const length = distance(from, to) || 1
    // The unit normal to the stroke's direction here.
    const [nx, ny] = [-(to.y - from.y) / length, (to.x - from.x) / length]
    left.push({ x: point.x + nx * point.radius, y: point.y + ny * point.radius })
    right.push({ x: point.x - nx * point.radius, y: point.y - ny * point.radius })
  })
  const angle = (center: Xy, point: Xy) => Math.atan2(point.y - center.y, point.x - center.x)
  const start = placed[0]!
  // Each cap turns a half circle round the outside of its end: from the right
  // edge back round to the left one at the start, from left to right at the end.
  return [
    ...arc(start, start.radius, angle(start, right[0]!), -Math.PI, 8),
    ...left,
    ...arc(last, last.radius, angle(last, left[left.length - 1]!), -Math.PI, 8),
    ...right.reverse(),
  ]
}

const fixed = (value: number) => value.toFixed(2)
const middle = (a: Xy, b: Xy) => `${fixed((a.x + b.x) / 2)},${fixed((a.y + b.y) / 2)}`

/** A polygon as a closed path of quadratic curves through its edges' midpoints. */
const smoothPath = (polygon: ReadonlyArray<Xy>): string => {
  if (polygon.length < 3) return ''
  const closed = [...polygon, polygon[0]!, polygon[1]!]
  let path = `M${middle(closed[0]!, closed[1]!)}`
  for (let step = 1; step < closed.length - 1; step += 1) {
    const [corner, next] = [closed[step]!, closed[step + 1]!]
    path += ` Q${fixed(corner.x)},${fixed(corner.y)} ${middle(corner, next)}`
  }
  return `${path} Z`
}

// Strokes are values that never change once drawn, so each one's path is worked out once per pen.
const paths = new WeakMap<Stroke, { readonly pen: Pen; readonly d: string }>()

/** A stroke's outline as SVG path data, to fill. */
export const pathOf = (stroke: Stroke, pen: Pen): string => {
  const known = paths.get(stroke)
  if (known !== undefined && known.pen === pen) return known.d
  const d = smoothPath(outlineOf(stroke, pen))
  paths.set(stroke, { pen, d })
  return d
}

const escapeXml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/** Where the line is, as a share of the pad's height from its top; the recipe draws it there too. */
export const BASELINE = 0.72

/**
 * The signature as an SVG document in the pad's coordinates, its strokes
 * filled with `color` (default black), or the typed name on the line in
 * `font`'s family; none while the pad is empty or unmeasured.
 */
export const toSvg = (
  model: Model,
  options: { readonly color?: string | undefined; readonly font?: string | undefined } = {},
): Option.Option<string> =>
  Option.flatMap(model.space, ({ width, height }) => {
    if (isEmpty(model)) return Option.none()
    const color = escapeXml(options.color ?? '#000')
    const body =
      model.strokes.length > 0
        ? model.strokes.map(stroke => `<path d="${pathOf(stroke, model.pen)}"/>`).join('')
        : `<text x="${fixed(width * 0.06)}" y="${fixed(height * BASELINE)}" font-family="${escapeXml(options.font ?? 'cursive')}" font-size="${fixed(height * 0.4)}">${escapeXml(model.typed.trim())}</text>`
    return Option.some(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" fill="${color}">${body}</svg>`,
    )
  })

/**
 * Draws the signature on a canvas `scale` times the pad's size, in the
 * colour and face the pad shows it in (read from the elements the view drew,
 * found by id), over `background` if given.
 */
export const ExportPng = Command.define('SignaturePad.ExportPng', {
  args: {
    model: Model,
    scale: Schema.Number,
    background: Schema.OptionFromNullOr(Schema.String),
  },
  messages: [Message.ExportedPng, Message.FailedExport],
  execute: ({ model, scale, background }) =>
    Effect.try(() => {
      if (isEmpty(model)) return Message.FailedExport({ reason: 'Nothing is signed.' })
      return Option.match(model.space, {
        onNone: () => Message.FailedExport({ reason: 'The pad has not been measured.' }),
        onSome: ({ width, height }) => {
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(width * scale))
          canvas.height = Math.max(1, Math.round(height * scale))
          const context = canvas.getContext('2d')
          if (context === null) return Message.FailedExport({ reason: 'No 2D canvas.' })
          context.scale(scale, scale)
          Option.match(background, {
            onNone: () => {},
            onSome: fill => {
              context.fillStyle = fill
              context.fillRect(0, 0, width, height)
            },
          })
          const segments = document.getElementById(segmentsId(model))
          context.fillStyle = segments === null ? '#000' : getComputedStyle(segments).color
          if (model.strokes.length > 0) {
            for (const stroke of model.strokes) context.fill(new Path2D(pathOf(stroke, model.pen)))
          } else {
            const shown = document.getElementById(typedNameId(model))
            const family = shown === null ? 'cursive' : getComputedStyle(shown).fontFamily
            context.font = `${height * 0.4}px ${family}`
            context.fillText(model.typed.trim(), width * 0.06, height * BASELINE)
          }
          return Message.ExportedPng({
            url: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height,
          })
        },
      })
    }).pipe(Effect.catch(error => Effect.succeed(Message.FailedExport({ reason: String(error) })))),
})

/** The pad after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return<Model, Message> => {
  const just = (next: Model) => ({ model: next })
  return Message.match(message, {
    Measured: ({ width, height }) =>
      just(
        Option.isSome(model.space) || width <= 0 || height <= 0
          ? model
          : modifyFields(model, { space: () => Option.some({ width, height }) }),
      ),
    Began: ({ width, height, point, pen }) => {
      // A second pointer while one draws starts nothing.
      if (Option.isSome(model.drawing)) return just(model)
      const box = { width, height }
      const space = spaceOf(model, box)
      return just(
        modifyFields(model, {
          space: () => Option.some(space),
          drawing: () => Option.some({ points: [into(space, box, point)], pressure: pen }),
        }),
      )
    },
    Extended: ({ width, height, points }) =>
      just(
        Option.match(model.drawing, {
          onNone: () => model,
          onSome: drawing => {
            const space = spaceOf(model, { width, height })
            const added: Array<Point> = []
            let last = drawing.points[drawing.points.length - 1]
            for (const raw of points) {
              const point = into(space, { width, height }, raw)
              if (last !== undefined && distance(last, point) < MIN_DISTANCE) continue
              added.push(point)
              last = point
            }
            return added.length === 0
              ? model
              : modifyFields(model, {
                  drawing: () => Option.some({ ...drawing, points: [...drawing.points, ...added] }),
                })
          },
        }),
      ),
    Ended: () =>
      just(
        Option.match(model.drawing, {
          onNone: () => model,
          onSome: drawing =>
            modifyFields(model, {
              strokes: () => [...model.strokes, drawing],
              drawing: () => Option.none(),
            }),
        }),
      ),
    Undid: () =>
      just(
        model.strokes.length === 0
          ? model
          : modifyFields(model, { strokes: () => model.strokes.slice(0, -1) }),
      ),
    Cleared: () =>
      just(
        isEmpty(model) && Option.isNone(model.drawing)
          ? model
          : modifyFields(model, {
              strokes: () => [],
              drawing: () => Option.none(),
              typed: () => '',
            }),
      ),
    Typed: ({ text }) =>
      just(text === model.typed ? model : modifyFields(model, { typed: () => text })),
    RequestedPng: ({ scale, background }) => ({
      model,
      commands: [ExportPng({ model, scale, background })],
    }),
    ExportedPng: () => just(model),
    FailedExport: () => just(model),
  })
}

// ---------------------------------------------------------------- the pointer

const inkAt = PointerPosition({})
const inkSize = Resize()

/**
 * Drawing on the control, as one Mount (an element holds one): its padding
 * box's size when drawn and when it changes, and one pointer's press, every
 * place it passes with its pressure, and its release. The size is the box
 * the places are read in and the strokes are laid out against, not the
 * content box `Resize` reports, which padding would make smaller.
 */
const ink: Mount.MountAction<PointerFact | Resized> = {
  name: 'SignaturePadInk',
  f: (element, viewStateChanges) =>
    Stream.merge(
      inkAt.f(element, viewStateChanges),
      inkSize.f(element, viewStateChanges).pipe(
        Stream.map(() => {
          const { width, height } = measurePaddingBox(element)
          return Resized.make({ width, height })
        }),
      ),
    ),
}

// ---------------------------------------------------------------- the view

/** The words a pad says; each has an English default. */
export interface SignaturePadLabels {
  /** On the line while the pad is empty; default `Sign here`. */
  readonly placeholder: string
  readonly undo: string
  readonly clear: string
  /** The typed field's label; default `Or type your name`. */
  readonly fallback: string
  /** What the control is called with nothing on it; default `empty`. */
  readonly empty: string
  /** What it is called with strokes on it; default `"signed, 3 strokes"`. */
  readonly drawn: (strokes: number) => string
  /** What it is called with a name typed; default `"signed as Ada Lovelace"`. */
  readonly typed: (name: string) => string
}

const defaultLabels: SignaturePadLabels = {
  placeholder: 'Sign here',
  undo: 'Undo',
  clear: 'Clear',
  fallback: 'Or type your name',
  empty: 'empty',
  drawn: strokes => `signed, ${strokes === 1 ? '1 stroke' : `${strokes} strokes`}`,
  typed: name => `signed as ${name}`,
}

export interface SignaturePadView<Message> {
  readonly model: Model
  /** Lifts the pad's own Messages into the application's. */
  readonly onMessage: (message: typeof Message.Type) => NoInfer<Message>
  /** What is signed, shown and naming the group. */
  readonly label: string
  /** Leaves out the typed field; the pad is then for a pointer alone. */
  readonly fallback?: boolean | undefined
  readonly labels?: Partial<SignaturePadLabels> | undefined
  readonly disabled?: boolean | undefined
  /** A style of `SignaturePadSlots`, for the look. */
  readonly style?: NamedStyle<typeof SignaturePadSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Outer>(options: SignaturePadView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const builders = SlotView.buildersFor(
    SignaturePadSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { model, onMessage: lift } = options
  const disabled = options.disabled === true
  const labels = { ...defaultLabels, ...options.labels }
  const labelId = `${model.id}-label`
  const inputId = `${model.id}-typed`
  const name = model.typed.trim()
  const drawn = model.strokes.length > 0 || Option.isSome(model.drawing)
  const typedOrEmpty = name === '' ? labels.empty : labels.typed(name)
  const holds = model.strokes.length > 0 ? labels.drawn(model.strokes.length) : typedOrEmpty
  const strokes = [...model.strokes, ...Option.toArray(model.drawing)]
  const button = (slot: 'undo' | 'clear', label: string, message: Message, off: boolean) =>
    h.button(
      builders[slot].attrs([
        h.Type('button'),
        h.AriaLabel(label),
        ...(disabled || off ? [h.Disabled(true)] : [h.OnClick(lift(message))]),
      ]),
      [label],
    )

  return h.div(
    builders.root.attrs([
      h.Role('group'),
      h.AriaLabelledBy(labelId),
      ...(drawn ? [h.DataAttribute('drawn', '')] : []),
      ...(isEmpty(model) && !drawn ? [h.DataAttribute('empty', '')] : []),
      ...(disabled ? [h.DataAttribute('disabled', '')] : []),
    ]),
    [
      h.span(builders.label.attrs([h.Id(labelId)]), [options.label]),
      h.div(
        builders.control.attrs([
          h.Id(`${model.id}-control`),
          // A Mount is attached once, when its element is drawn: disabling draws a new one.
          h.Key(disabled ? 'disabled' : 'enabled'),
          h.Role('img'),
          h.AriaLabel(`${options.label}: ${holds}`),
          ...(disabled
            ? [h.AriaDisabled(true)]
            : [
                h.OnMount(
                  Mount.mapMessage(ink, fact =>
                    lift(
                      Match.valueTags(fact, {
                        Resized: ({ width, height }) => Message.Measured({ width, height }),
                        PointerPressed: ({ width, height, point, pointerType }) =>
                          Message.Began({ width, height, point, pen: pointerType === 'pen' }),
                        PointerMoved: ({ width, height, points }) =>
                          Message.Extended({ width, height, points }),
                        PointerReleased: () => Message.Ended(),
                      }),
                    ),
                  ),
                ),
              ]),
        ]),
        [
          h.div(builders.guide.attrs([h.AriaHidden(true)]), []),
          h.span(builders.placeholder.attrs([h.AriaHidden(true)]), [labels.placeholder]),
          ...(model.strokes.length === 0 && name !== ''
            ? [
                h.span(builders.typedName.attrs([h.Id(typedNameId(model)), h.AriaHidden(true)]), [
                  name,
                ]),
              ]
            : []),
          h.svg(
            builders.segments.attrs([
              h.Id(segmentsId(model)),
              h.AriaHidden(true),
              ...Option.match(model.space, {
                onNone: () => [],
                onSome: ({ width, height }) => [h.ViewBox(`0 0 ${width} ${height}`)],
              }),
            ]),
            strokes.map((stroke, place) =>
              h.path(
                builders.stroke.attrs([h.Key(String(place)), h.D(pathOf(stroke, model.pen))]),
                [],
              ),
            ),
          ),
        ],
      ),
      h.div(builders.controls.attrs(), [
        button('undo', labels.undo, Message.Undid(), model.strokes.length === 0),
        button('clear', labels.clear, Message.Cleared(), isEmpty(model)),
      ]),
      ...(options.fallback === false
        ? []
        : [
            h.div(builders.fallback.attrs(), [
              h.label(builders.fallbackLabel.attrs([h.For(inputId)]), [labels.fallback]),
              h.input(
                builders.input.attrs([
                  h.Id(inputId),
                  h.Type('text'),
                  h.AriaLabel(labels.fallback),
                  h.Value(model.typed),
                  h.Autocomplete('name'),
                  ...(disabled
                    ? [h.Disabled(true)]
                    : [h.OnInput(text => lift(Message.Typed({ text })))]),
                ]),
              ),
            ]),
          ]),
    ],
  )
}

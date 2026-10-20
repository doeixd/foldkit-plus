import type { AnchorConfig } from '@foldkit/ui/anchor'
import * as UiPopover from '@foldkit/ui/popover'
import { Effect, Option, Queue, Schema, Stream } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import { PointerMoved, PointerPosition, PointerPressed } from 'foldkit-primitives/dom'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { idSelector } from './datePickerUtils.js'
import * as Popover from './popover.js'
import type { MixinList } from './resolve.js'
import * as Slider from './slider.js'
import type { SliderSlots } from './slider.js'

/**
 * A color picker after ReUI's: a 2D `area` of saturation (across) and
 * brightness (up) at the color's hue, hue and alpha sliders (two Sliders of
 * this package), an eyedropper where the browser has one, the color as text
 * in a chosen format (hex, rgb, hsl or oklch) that the user can type into,
 * and `presets`, a radio group of swatches. `popover` draws it in the
 * package's Popover, opened by a swatch of the color.
 *
 * The color, the format and the text being typed are a small Model of this
 * module's, which the application keeps and folds with `update`. Every key,
 * press and drag reaches `update` as a Message that says what was done (a
 * key, a point of the area), not the color the last frame drew, so keys
 * faster than a frame each move from the color before them.
 *
 * The area is one focusable thumb, `role="slider"` with both values in its
 * `aria-valuetext`, as the APG has no two-dimensional slider: its value is the
 * saturation and Up and Down move the brightness. Arrows step by 1% (with
 * Shift by 10%), Page Up and Page Down move the brightness by 10% (with Shift
 * the saturation), Home and End take the saturation to its ends. The plane is
 * drawn the same way in either direction, so its keys are physical too. A
 * press or drag on it, a Mount, says where in it the pointer is, from 0 to 1
 * each way.
 *
 * The root carries the color for the recipe as custom properties computed
 * from it: `--fk-color` (with alpha), `--fk-color-opaque`, `--fk-color-hue`
 * (the pure hue the area runs to), `--fk-color-area` (the area's paint),
 * `--fk-color-hues` (the hue track's stops), and `--fk-color-x`,
 * `--fk-color-y` (the thumb's place, 0 to 1). A `preset` carries its own
 * `--fk-color`. The sliders take a style of their own (`slider`), since they
 * are Sliders; `Recipes.Slider({ track: 'paint', label: 'hidden' })` paints
 * them from what each `channel` (`data-channel`) sets.
 */
export const ColorPickerSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  label: Slot.make({ capability: Capability.Container }),
  area: Slot.make({ capability: Capability.Container }),
  areaThumb: Slot.make({
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  controls: Slot.make({ capability: Capability.Container }),
  eyedropper: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
  channels: Slot.make({ capability: Capability.Container }),
  channel: Slot.make({ capability: Capability.Container }),
  swatch: Slot.make({ capability: Capability.Base }),
  fields: Slot.make({ capability: Capability.Container }),
  format: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaLabel, Attr.Disabled, Attr.Value],
  }),
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input, Event.Change, Event.KeyDown],
    attributes: [Attr.AriaLabel, Attr.Disabled, Attr.Value],
  }),
  presets: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  preset: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
  picker: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Container }),
  value: Slot.make({ capability: Capability.Container }),
})

/**
 * A color in sRGB as the area draws it: hue 0–360 degrees, saturation and
 * value (brightness) 0–1, and alpha 0–1. Hue is kept apart from the other
 * channels, so dragging to grey and back does not lose it.
 */
export const Color = Schema.Struct({
  h: Schema.Number,
  s: Schema.Number,
  v: Schema.Number,
  alpha: Schema.Number,
})
export type Color = typeof Color.Type

/** How the color is written in the text field. */
export const Format = Schema.Literals(['hex', 'rgb', 'hsl', 'oklch'])
export type Format = typeof Format.Type

const formats: ReadonlyArray<Format> = ['hex', 'rgb', 'hsl', 'oklch']

// ---------------------------------------------------------------- color math

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const round = (value: number, places = 0) => Number(value.toFixed(places))
const turn = (hue: number) => ((hue % 360) + 360) % 360

interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

const rgbOf = ({ h, s, v }: Color): Rgb => {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * clamp(Math.min(k, 4 - k))
  }
  return { r: channel(5), g: channel(3), b: channel(1) }
}

/** The color with `hue` kept where the rgb has none (a grey), as dragging to grey should. */
const fromRgb = ({ r, g, b }: Rgb, alpha: number, hue: number): Color => {
  const max = Math.max(r, g, b)
  const delta = max - Math.min(r, g, b)
  const h =
    delta === 0
      ? hue
      : max === r
        ? turn(60 * ((g - b) / delta))
        : max === g
          ? 60 * ((b - r) / delta + 2)
          : 60 * ((r - g) / delta + 4)
  return { h, s: max === 0 ? 0 : delta / max, v: max, alpha: clamp(alpha) }
}

const fromHsl = (h: number, s: number, l: number, alpha: number): Color => {
  const v = l + s * Math.min(l, 1 - l)
  return { h: turn(h), s: v === 0 ? 0 : 2 * (1 - l / v), v, alpha: clamp(alpha) }
}

const hslOf = ({ h, s, v }: Color) => {
  const l = v * (1 - s / 2)
  return { h, s: l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l }
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

/** OKLCH (lightness 0–1) from sRGB, by Björn Ottosson's OKLab matrices. */
const oklchOf = (color: Color) => {
  const { r, g, b } = rgbOf(color)
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.hypot(a, bb)
  return { l: L, c: C, h: C < 1e-4 ? color.h : turn((Math.atan2(bb, a) * 180) / Math.PI) }
}

/** sRGB from OKLCH, each channel clipped into the gamut. */
const fromOklch = (L: number, C: number, H: number, alpha: number): Color => {
  const radians = (H * Math.PI) / 180
  const [a, b] = [C * Math.cos(radians), C * Math.sin(radians)]
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb = {
    r: clamp(gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp(gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp(gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  }
  return fromRgb(rgb, alpha, turn(H))
}

const byte = (c: number) => Math.round(clamp(c) * 255)
const hex2 = (n: number) => n.toString(16).padStart(2, '0')
const alphaText = (alpha: number) => (alpha >= 1 ? '' : ` / ${round(alpha, 2)}`)

/** The color as CSS text in `format`; alpha is written only when the color is not opaque. */
export const format = (color: Color, as: Format): string => {
  const { r, g, b } = rgbOf(color)
  switch (as) {
    case 'hex':
      return `#${hex2(byte(r))}${hex2(byte(g))}${hex2(byte(b))}${color.alpha >= 1 ? '' : hex2(byte(color.alpha))}`
    case 'rgb':
      return `rgb(${byte(r)} ${byte(g)} ${byte(b)}${alphaText(color.alpha)})`
    case 'hsl': {
      const hsl = hslOf(color)
      return `hsl(${round(hsl.h)} ${round(hsl.s * 100)}% ${round(hsl.l * 100)}%${alphaText(color.alpha)})`
    }
    case 'oklch': {
      const lch = oklchOf(color)
      return `oklch(${round(lch.l * 100, 1)}% ${round(lch.c, 3)} ${round(lch.h, 1)}${alphaText(color.alpha)})`
    }
  }
}

/**
 * The widest text `format` writes in `as` for a color as opaque as one of
 * `alpha`: its longest shape, any digit standing for every digit, which
 * tabular figures draw at one width. Kept beside `format`, whose shapes it
 * copies, so a trigger can hold every color's text without resizing.
 */
const widestText = (as: Format, alpha: number): string => {
  const translucent = alpha < 1
  switch (as) {
    case 'hex':
      return translucent ? '#88888888' : '#888888'
    case 'rgb':
      return `rgb(888 888 888${translucent ? ' / 0.88' : ''})`
    case 'hsl':
      return `hsl(888 888% 888%${translucent ? ' / 0.88' : ''})`
    case 'oklch':
      return `oklch(88.8% 0.888 888.8${translucent ? ' / 0.88' : ''})`
  }
}

const number = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)`
const part = (unit: string) => String.raw`(${number})(${unit})?`
const separator = String.raw`(?:\s*,\s*|\s+)`
const alphaPart = String.raw`(?:\s*[,/]\s*${part('%')})?`
const functional = (name: string, units: readonly [string, string, string]) =>
  new RegExp(
    String.raw`^\s*${name}a?\(\s*${part(units[0])}${separator}${part(units[1])}${separator}${part(units[2])}${alphaPart}\s*\)\s*$`,
    'i',
  )
const hexPattern = /^\s*#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\s*$/i
const rgbPattern = functional('rgb', ['%', '%', '%'])
const hslPattern = functional('hsl', ['deg', '%', '%'])
const oklchPattern = functional('oklch', ['%', '%', 'deg'])

/** A share of a whole from `text`: a percentage, or a number of `whole`. */
const shareOf = (text: string | undefined, unit: string | undefined, whole: number) =>
  unit === '%' ? Number(text) / 100 : Number(text) / whole

const inRange = (value: number, min = 0, max = 1) => value >= min && value <= max

/**
 * The color CSS text names, or none: hex (`#rgb`, `#rgba`, `#rrggbb`,
 * `#rrggbbaa`, the `#` optional), `rgb()`, `hsl()` and `oklch()`, with commas
 * or spaces and an optional alpha. A channel out of its range is none; an
 * oklch color outside sRGB is clipped into it. `hue` is kept for a grey,
 * which has none of its own.
 */
export const parse = (text: string, hue = 0): Option.Option<Color> => {
  const hex = hexPattern.exec(text)
  if (hex !== null) {
    const digits = hex[1] ?? ''
    const full = digits.length <= 4 ? Array.from(digits, digit => digit + digit).join('') : digits
    const at = (index: number) => parseInt(full.slice(index * 2, index * 2 + 2), 16) / 255
    return Option.some(
      fromRgb({ r: at(0), g: at(1), b: at(2) }, full.length === 8 ? at(3) : 1, hue),
    )
  }
  const alphaOf = (value: string | undefined, unit: string | undefined) =>
    value === undefined ? 1 : shareOf(value, unit, 1)
  const rgb = rgbPattern.exec(text)
  if (rgb !== null) {
    const [r, g, b] = [1, 3, 5].map(index => shareOf(rgb[index], rgb[index + 1], 255))
    const alpha = alphaOf(rgb[7], rgb[8])
    return [r, g, b, alpha].every(value => value !== undefined && inRange(value))
      ? Option.some(fromRgb({ r: r ?? 0, g: g ?? 0, b: b ?? 0 }, alpha, hue))
      : Option.none()
  }
  const hsl = hslPattern.exec(text)
  if (hsl !== null) {
    const h = Number(hsl[1])
    const [s, l] = [shareOf(hsl[3], '%', 1), shareOf(hsl[5], '%', 1)]
    const alpha = alphaOf(hsl[7], hsl[8])
    return [s, l, alpha].every(value => inRange(value))
      ? Option.some(fromHsl(h, s, l, alpha))
      : Option.none()
  }
  const oklch = oklchPattern.exec(text)
  if (oklch !== null) {
    const l = shareOf(oklch[1], oklch[2], 1)
    const c = oklch[4] === '%' ? (Number(oklch[3]) / 100) * 0.4 : Number(oklch[3])
    const alpha = alphaOf(oklch[7], oklch[8])
    return inRange(l) && inRange(c, 0, 0.5) && inRange(alpha)
      ? Option.some(fromOklch(l, c, Number(oklch[5]), alpha))
      : Option.none()
  }
  return Option.none()
}

/**
 * The color a CSS literal names, for presets and initial values written in
 * code: `ColorPicker.color('#3b82f6')`. It throws on text that names none, so
 * a typo fails where it is written rather than drawing black.
 */
export const color = (text: string): Color =>
  Option.getOrThrowWith(parse(text), () => new Error(`ColorPicker.color: not a color: ${text}`))

/** OKLCH, lightness in percent as the theme's knobs take it, for an application feeding a palette. */
export const toOklch = (
  value: Color,
): { readonly l: number; readonly c: number; readonly h: number } => {
  const lch = oklchOf(value)
  return { l: lch.l * 100, c: lch.c, h: lch.h }
}

const same = (left: Color, right: Color) => format(left, 'hex') === format(right, 'hex')

// ---------------------------------------------------------------- the Model

export const Model = Schema.Struct({
  /** Prefixes every id the picker draws, and names the presets as one group; unique on the page. */
  id: Schema.String,
  color: Color,
  format: Format,
  /** The text being typed, until it is committed; none while the field shows the color. */
  draft: Schema.OptionFromNullOr(Schema.String),
})
export type Model = typeof Model.Type

/** A picker of `color` (default an opaque blue), written in `format` (default `hex`). */
export const init = (options: {
  readonly id: string
  readonly color?: Color | undefined
  readonly format?: Format | undefined
}): Model => ({
  id: options.id,
  color: options.color ?? { h: 217, s: 0.76, v: 0.96, alpha: 1 },
  format: options.format ?? 'hex',
  draft: Option.none(),
})

export const Message = defineMessageUnion({
  /** The pointer pressed or dragged on the area, `x` across and `y` down, each 0 to 1. */
  PointedArea: { x: Schema.Number, y: Schema.Number },
  /** A key on the area's thumb; `update` decides what it moves, from the color it has. */
  PressedAreaKey: { key: Schema.String, shift: Schema.Boolean },
  ChangedHue: { hue: Schema.Number },
  /** Alpha in percent, as its slider says it. */
  ChangedAlpha: { alpha: Schema.Number },
  PickedPreset: { color: Color },
  ChangedFormat: { format: Format },
  TypedText: { text: Schema.String },
  /** The text field's change or Enter: the draft becomes the color if it names one, and is dropped. */
  CommittedText: {},
  /** Escape in the text field: the draft is dropped. */
  RevertedText: {},
  /** Answer it with `Eyedrop`, which `update` returns as its Command. */
  PressedEyedropper: {},
  /** What the eyedropper read, as `#rrggbb`. */
  GotEyedropperColor: { hex: Schema.String },
  /** The eyedropper was closed, refused, or is not there. */
  CancelledEyedropper: {},
})
export type Message = typeof Message.Type

const areaKeys: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
])

/** What a key on the area moves: a share of saturation and of brightness. */
const areaStep = (key: string, shift: boolean): { readonly s: number; readonly v: number } => {
  const step = shift ? 0.1 : 0.01
  switch (key) {
    case 'ArrowLeft':
      return { s: -step, v: 0 }
    case 'ArrowRight':
      return { s: step, v: 0 }
    case 'ArrowUp':
      return { s: 0, v: step }
    case 'ArrowDown':
      return { s: 0, v: -step }
    case 'PageUp':
      return shift ? { s: 0.1, v: 0 } : { s: 0, v: 0.1 }
    case 'PageDown':
      return shift ? { s: -0.1, v: 0 } : { s: 0, v: -0.1 }
    case 'Home':
      return { s: -1, v: 0 }
    case 'End':
      return { s: 1, v: 0 }
    default:
      return { s: 0, v: 0 }
  }
}

/** Whether the eyedropper is there to open; false off a browser and where it is unsupported. */
export const canEyedrop = (): boolean =>
  typeof globalThis === 'object' && 'EyeDropper' in globalThis

interface EyeDropperLike {
  open: () => Promise<{ readonly sRGBHex: string }>
}

const isEyeDropper = (value: unknown): value is new () => EyeDropperLike =>
  typeof value === 'function'

/** Opens the browser's eyedropper; its color, or `CancelledEyedropper` when there is none to read. */
export const Eyedrop = Command.define('ColorPicker.Eyedrop', {
  messages: [Message.GotEyedropperColor, Message.CancelledEyedropper],
  // Suspended, so each run asks the browser then, not once when this module loads.
  execute: Effect.suspend(() => {
    const Dropper: unknown = Reflect.get(globalThis, 'EyeDropper')
    if (!isEyeDropper(Dropper)) return Effect.succeed(Message.CancelledEyedropper())
    return Effect.tryPromise(() => new Dropper().open()).pipe(
      Effect.match({
        onFailure: () => Message.CancelledEyedropper(),
        onSuccess: ({ sRGBHex }) => Message.GotEyedropperColor({ hex: sRGBHex }),
      }),
    )
  }),
})

/** The Model with `next` as its color, or the same Model when the color reads the same. */
const withColor = (model: Model, next: Color): Return<Model, Message> =>
  next.h === model.color.h &&
  next.s === model.color.s &&
  next.v === model.color.v &&
  next.alpha === model.color.alpha
    ? { model }
    : { model: modifyFields(model, { color: () => next }) }

/** The picker after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return<Model, Message> => {
  const { color: current } = model
  return Message.match(message, {
    PointedArea: ({ x, y }) => withColor(model, { ...current, s: clamp(x), v: clamp(1 - y) }),
    PressedAreaKey: ({ key, shift }) => {
      const step = areaStep(key, shift)
      return withColor(model, {
        ...current,
        s: round(clamp(current.s + step.s), 4),
        v: round(clamp(current.v + step.v), 4),
      })
    },
    ChangedHue: ({ hue }) => withColor(model, { ...current, h: clamp(hue, 0, 360) }),
    ChangedAlpha: ({ alpha }) => withColor(model, { ...current, alpha: clamp(alpha / 100) }),
    PickedPreset: ({ color: picked }) => withColor(model, picked),
    ChangedFormat: ({ format: next }) =>
      next === model.format
        ? { model }
        : { model: modifyFields(model, { format: () => next, draft: () => Option.none() }) },
    TypedText: ({ text }) => ({ model: modifyFields(model, { draft: () => Option.some(text) }) }),
    CommittedText: () =>
      Option.match(model.draft, {
        onNone: () => ({ model }),
        onSome: text => {
          const dropped = modifyFields(model, { draft: () => Option.none() })
          return Option.match(parse(text, current.h), {
            onNone: () => ({ model: dropped }),
            onSome: parsed => ({ model: modifyFields(dropped, { color: () => parsed }) }),
          })
        },
      }),
    RevertedText: () =>
      Option.isNone(model.draft)
        ? { model }
        : { model: modifyFields(model, { draft: () => Option.none() }) },
    PressedEyedropper: () => ({ model, commands: [Eyedrop()] }),
    GotEyedropperColor: ({ hex }) =>
      Option.match(parse(hex, current.h), {
        onNone: () => ({ model }),
        onSome: picked => withColor(model, { ...picked, alpha: current.alpha }),
      }),
    CancelledEyedropper: () => ({ model }),
  })
}

// ---------------------------------------------------------------- the area's pointer

const areaPosition = PointerPosition({ focus: '[tabindex]' })

/**
 * Where the pointer is in the area, 0 to 1 across and down, at a press and
 * at each move until it is released. A press focuses the thumb, so the keys
 * go on from where the pointer left it. The release itself is dropped: the
 * color is already where the pointer let go of it.
 */
const areaPointer: Mount.MountAction<{ readonly x: number; readonly y: number }> = {
  ...areaPosition,
  f: (element, viewStateChanges) =>
    areaPosition.f(element, viewStateChanges).pipe(
      Stream.filter(Schema.is(Schema.Union([PointerPressed, PointerMoved]))),
      Stream.map(({ point, width, height }) => ({
        x: width === 0 ? 0 : clamp(point.x / width),
        y: height === 0 ? 0 : clamp(point.y / height),
      })),
    ),
}

// ---------------------------------------------------------------- the view

export interface ColorPickerPreset {
  /** The color's name, which its swatch reads aloud. */
  readonly label: string
  readonly value: Color
}

/** The words a picker says; each has an English default. */
export interface ColorPickerLabels {
  /** The area's thumb; default `Saturation and brightness`. */
  readonly area: string
  readonly saturation: string
  readonly brightness: string
  readonly hue: string
  readonly alpha: string
  /** The format select; default `Color format`. */
  readonly format: string
  /** The text field; default `Color value`. */
  readonly input: string
  readonly eyedropper: string
  readonly presets: string
}

const defaultLabels: ColorPickerLabels = {
  area: 'Saturation and brightness',
  saturation: 'Saturation',
  brightness: 'Brightness',
  hue: 'Hue',
  alpha: 'Alpha',
  format: 'Color format',
  input: 'Color value',
  eyedropper: 'Pick a color from the screen',
  presets: 'Presets',
}

export interface ColorPickerView<Message> {
  readonly model: Model
  /** Lifts the picker's own Messages into the application's. */
  readonly onMessage: (message: typeof Message.Type) => NoInfer<Message>
  /** What the color is for, shown and naming the group. */
  readonly label: string
  /** Colors one press away, drawn as a radio group of swatches; the one equal to the color is checked. */
  readonly presets?: ReadonlyArray<ColorPickerPreset> | undefined
  /** Default `true`; without it the color is opaque and its slider is not drawn. */
  readonly alpha?: boolean | undefined
  /** Draws the eyedropper; default whether the browser has one (`canEyedrop`). */
  readonly eyedropper?: boolean | undefined
  readonly labels?: Partial<ColorPickerLabels> | undefined
  readonly disabled?: boolean | undefined
  /** A style of `ColorPickerSlots`, for the look. */
  readonly style?: NamedStyle<typeof ColorPickerSlots> | undefined
  /** The hue and alpha Sliders' style. */
  readonly slider?: NamedStyle<typeof SliderSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const pct = (share: number) => `${round(share * 100)}%`

const buildersOf = <Message>(options: ColorPickerView<Message>, h: HtmlBuilder<Message>) =>
  SlotView.buildersFor(
    ColorPickerSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )

/** The custom properties a recipe paints from: the color, as data. */
const paintOf = (value: Color): Record<string, string> => {
  const opaque = { ...value, alpha: 1 }
  const hue = format({ h: value.h, s: 1, v: 1, alpha: 1 }, 'hsl')
  return {
    '--fk-color': format(value, 'rgb'),
    '--fk-color-opaque': format(opaque, 'rgb'),
    '--fk-color-hue': hue,
    '--fk-color-area': `linear-gradient(to top, rgb(0 0 0), transparent), linear-gradient(to right, rgb(255 255 255), ${hue})`,
    '--fk-color-hues': [0, 60, 120, 180, 240, 300, 360].map(at => `hsl(${at} 100% 50%)`).join(', '),
    '--fk-color-x': String(round(value.s, 4)),
    '--fk-color-y': String(round(1 - value.v, 4)),
  }
}

export const view = <Outer>(options: ColorPickerView<Outer>, h: HtmlBuilder<Outer>): Html =>
  drawn(options, h, [])

const drawn = <Outer>(
  options: ColorPickerView<Outer>,
  h: HtmlBuilder<Outer>,
  // What the popover adds to the root: the Mount that closes it when focus leaves.
  rootAttributes: ReadonlyArray<ReturnType<HtmlBuilder<Outer>['OnMount']>>,
): Html => {
  const builders = buildersOf(options, h)
  const { model, onMessage: lift } = options
  const { color: current } = model
  const disabled = options.disabled === true
  const labels = { ...defaultLabels, ...options.labels }
  const labelId = `${model.id}-label`
  const presets = options.presets ?? []
  const withAlpha = options.alpha !== false
  const eyedropper = options.eyedropper ?? canEyedrop()
  const shown = Option.getOrElse(model.draft, () => format(current, model.format))

  const channel = (key: 'hue' | 'alpha', slider: Html) =>
    h.div(builders.channel.attrs([h.Key(key), h.DataAttribute('channel', key)]), [slider])

  return h.div(
    builders.root.attrs([
      h.Role('group'),
      h.AriaLabelledBy(labelId),
      h.Style(paintOf(current)),
      ...(disabled ? [h.DataAttribute('disabled', '')] : []),
      ...rootAttributes,
    ]),
    [
      h.span(builders.label.attrs([h.Id(labelId)]), [options.label]),
      h.div(
        builders.area.attrs(
          disabled
            ? []
            : [
                h.OnMount(
                  Mount.mapMessage(areaPointer, ({ x, y }) => lift(Message.PointedArea({ x, y }))),
                ),
              ],
        ),
        [
          h.div(
            builders.areaThumb.attrs([
              h.Id(`${model.id}-area`),
              h.Role('slider'),
              h.AriaLabel(labels.area),
              h.AriaValuemin(0),
              h.AriaValuemax(100),
              h.AriaValuenow(round(current.s * 100)),
              h.AriaValuetext(
                `${labels.saturation} ${pct(current.s)}, ${labels.brightness} ${pct(current.v)}`,
              ),
              ...(disabled
                ? [h.AriaDisabled(true)]
                : [
                    h.Tabindex(0),
                    h.OnKeyDownPreventDefault((key, modifiers) =>
                      areaKeys.has(key)
                        ? Option.some(
                            lift(Message.PressedAreaKey({ key, shift: modifiers.shiftKey })),
                          )
                        : Option.none(),
                    ),
                  ]),
            ]),
            [],
          ),
        ],
      ),
      h.div(builders.controls.attrs(), [
        ...(eyedropper
          ? [
              h.button(
                builders.eyedropper.attrs([
                  h.Type('button'),
                  h.AriaLabel(labels.eyedropper),
                  ...(disabled
                    ? [h.Disabled(true)]
                    : [h.OnClick(lift(Message.PressedEyedropper()))]),
                ]),
                [],
              ),
            ]
          : []),
        h.div(builders.channels.attrs(), [
          channel(
            'hue',
            Slider.view(
              {
                id: `${model.id}-hue`,
                label: labels.hue,
                value: round(current.h),
                max: 360,
                format: value => `${value} degrees`,
                onChange: hue => lift(Message.ChangedHue({ hue })),
                disabled,
                style: options.slider,
              },
              h,
            ),
          ),
          ...(withAlpha
            ? [
                channel(
                  'alpha',
                  Slider.view(
                    {
                      id: `${model.id}-alpha`,
                      label: labels.alpha,
                      value: round(current.alpha * 100),
                      format: value => `${value}%`,
                      onChange: alpha => lift(Message.ChangedAlpha({ alpha })),
                      disabled,
                      style: options.slider,
                    },
                    h,
                  ),
                ),
              ]
            : []),
        ]),
        // The text field says the color; the swatch only shows it.
        h.div(builders.swatch.attrs([h.AriaHidden(true)]), []),
      ]),
      h.div(builders.fields.attrs(), [
        h.select(
          builders.format.attrs([
            h.AriaLabel(labels.format),
            h.Value(model.format),
            ...(disabled
              ? [h.Disabled(true)]
              : [
                  h.OnChange(text =>
                    lift(
                      Message.ChangedFormat({
                        format: formats.find(each => each === text) ?? model.format,
                      }),
                    ),
                  ),
                ]),
          ]),
          formats.map(each =>
            h.option(
              [h.Key(each), h.Value(each), h.Selected(each === model.format)],
              [each.toUpperCase()],
            ),
          ),
        ),
        h.input(
          builders.input.attrs([
            h.Id(`${model.id}-input`),
            h.Type('text'),
            h.AriaLabel(labels.input),
            h.Value(shown),
            h.Attribute('spellcheck', 'false'),
            h.Attribute('autocomplete', 'off'),
            ...(Option.isSome(model.draft) && Option.isNone(parse(shown, current.h))
              ? [h.AriaInvalid(true)]
              : []),
            ...(disabled
              ? [h.Disabled(true)]
              : [
                  h.OnInput(text => lift(Message.TypedText({ text }))),
                  h.OnChange(() => lift(Message.CommittedText())),
                  h.OnKeyDownPreventDefault(key =>
                    key === 'Enter'
                      ? Option.some(lift(Message.CommittedText()))
                      : key === 'Escape' && Option.isSome(model.draft)
                        ? Option.some(lift(Message.RevertedText()))
                        : Option.none(),
                  ),
                ]),
          ]),
        ),
      ]),
      ...(presets.length === 0
        ? []
        : [
            h.div(
              builders.presets.attrs([h.Role('radiogroup'), h.AriaLabel(labels.presets)]),
              presets.map(preset =>
                h.input(
                  builders.preset.attrs([
                    h.Key(preset.label),
                    h.Type('radio'),
                    // An attribute, not `h.Name`'s client-only property, so server markup groups the radios too.
                    h.Attribute('name', `${model.id}-presets`),
                    h.AriaLabel(preset.label),
                    h.Checked(same(preset.value, current)),
                    h.Style({ '--fk-color': format(preset.value, 'rgb') }),
                    ...(disabled
                      ? [h.Disabled(true)]
                      : [h.OnChange(() => lift(Message.PickedPreset({ color: preset.value })))]),
                  ]),
                ),
              ),
            ),
          ]),
    ],
  )
}

export interface ColorPickerPopover<Message> extends ColorPickerView<Message> {
  /**
   * The Popover's Model, made with `contentFocus: true`
   * (`Popover.init({ id, contentFocus: true })` from `@foldkit/ui/popover`):
   * the picker owns its panel's focus, so a press inside never closes it.
   */
  readonly popover: UiPopover.Model
  /** The Popover's Messages, for `Popover.update`. */
  readonly onPopover: (message: UiPopover.Message) => NoInfer<Message>
  /** Where the panel opens; default below the trigger, at its start. */
  readonly anchor?: AnchorConfig | undefined
  /** The Popover's own look and Mixins, as `Popover.toView` takes them. */
  readonly popoverMixins?: MixinList<Message> | undefined
}

const DEFAULT_ANCHOR: AnchorConfig = {
  placement: 'bottom-start',
  gap: 4,
  padding: 8,
  portal: false,
}

/**
 * Focus going from the picker to an element outside it, as a Mount on its
 * root: the Popover's `BlurredPanel`, which closes it without taking focus
 * back from where Tab took it (and, as upstream decides, keeps open a panel a
 * mouse opened). Focus going nowhere (a press on the panel's words, the window
 * losing focus) leaves it open, and a press outside is the backdrop's.
 */
const LeftPicker = Mount.defineStream('ColorPickerLeft', {
  messages: [UiPopover.Message.BlurredPanel],
  execute: ({ element }) =>
    Stream.callback<UiPopover.BlurredPanel>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const left = (event: globalThis.Event) => {
            const to = event instanceof FocusEvent ? event.relatedTarget : null
            if (to instanceof Node && !element.contains(to))
              Queue.offerUnsafe(queue, UiPopover.Message.BlurredPanel())
          }
          element.addEventListener('focusout', left)
          return left
        }),
        left => Effect.sync(() => element.removeEventListener('focusout', left)),
      ),
    ),
})

/**
 * The picker behind a swatch of its color and its text, in the package's
 * Popover. The panel opens on the area's thumb, and closes on Escape, a press
 * outside, or focus leaving it (unless a mouse opened it); a press or a drag
 * anywhere inside keeps it open, whatever opened it. The open state is the
 * Popover's Model.
 */
export const popover = <Outer>(options: ColorPickerPopover<Outer>, h: HtmlBuilder<Outer>): Html => {
  if (!options.popover.contentFocus)
    throw new Error(
      `ColorPicker.popover: make the Popover "${options.popover.id}" with contentFocus: true; ` +
        'without it, focus moving into the picker closes the panel under a finger or the keys',
    )
  const builders = buildersOf(options, h)
  return h.submodel({
    slotId: options.popover.id,
    model: options.popover,
    view: UiPopover.view,
    viewInputs: {
      anchor: options.anchor ?? DEFAULT_ANCHOR,
      focusSelector: idSelector(`${options.model.id}-area`),
      toView: Popover.toView(options.popoverMixins ?? [], { h }, shown =>
        h.div(builders.picker.attrs([h.Style(paintOf(options.model.color))]), [
          h.button(shown.button, [
            h.span(builders.trigger.attrs(), [
              h.span(builders.swatch.attrs([h.AriaHidden(true)]), []),
              // The format's widest text, drawn unseen beneath, holds the trigger's width
              // while the color changes: a centred trigger moved its panel at each step.
              h.span(
                builders.value.attrs([
                  h.DataAttribute(
                    'widest',
                    widestText(options.model.format, options.model.color.alpha),
                  ),
                ]),
                [format(options.model.color, options.model.format)],
              ),
            ]),
          ]),
          ...(shown.isVisible
            ? [
                h.div(shown.backdrop, []),
                h.div(shown.layer, [
                  h.div(shown.panel, [
                    drawn(options, h, [
                      h.OnMount(Mount.mapMessage(LeftPicker(), options.onPopover)),
                    ]),
                  ]),
                ]),
              ]
            : []),
        ]),
      ),
    },
    toParentMessage: options.onPopover,
  })
}

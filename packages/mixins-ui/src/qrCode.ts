import { Effect, Option, Schema } from 'effect'
import { Attr, Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { encode as encodeQr } from 'uqr'
import type { MixinList } from './resolve.js'

/**
 * A QR code, Zag's qr-code: text encoded to a matrix of modules and drawn as
 * one SVG `path` over a `background` that carries the quiet zone, with an
 * optional `overlay` (a logo) centred on it. The root is one image whose
 * name says what the code holds. The encoder is `uqr`, the one Zag's machine
 * uses; `encode` and `pathOf` are pure, so a server draws the same code.
 * `Download` saves the drawn code as an SVG or PNG file in the colors the
 * page shows it in.
 */
export const QrCodeSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] }),
  /** The `svg`, in modules: its view box is the code and its quiet zone. */
  frame: Slot.make({ capability: Capability.Container }),
  /** A `rect` under the modules, quiet zone included: the light color. */
  background: Slot.make({ capability: Capability.Container }),
  /** One `path` of every dark module: the dark color. */
  pattern: Slot.make({ capability: Capability.Container }),
  /** A box over the centre, for a logo; the error correction covers what it hides. */
  overlay: Slot.make({ capability: Capability.Container }),
  /** Said in place of the code when the text is too long for any QR code. */
  fallback: Slot.make({ capability: Capability.Container }),
})

/** How much of the code may be lost and still read: about 7, 15, 25 or 30%. */
export type Level = 'L' | 'M' | 'Q' | 'H'

/** An encoded code: `size` modules a side, `dark[y][x]` true for a dark module. */
export interface Matrix {
  readonly version: number
  readonly size: number
  readonly dark: ReadonlyArray<ReadonlyArray<boolean>>
}

const encoded = new Map<string, Option.Option<Matrix>>()
/** Codes kept: a page shows a few, and each takes a moment to encode. */
const KEPT = 32

/**
 * `text` as a QR code at `level`, in the smallest version that holds it;
 * none when no version does (about 2,900 bytes at `L`). The last few codes
 * are kept, so a view drawn again does not encode again.
 */
export const encode = (text: string, level: Level): Option.Option<Matrix> => {
  const key = `${level}:${text}`
  const kept = encoded.get(key)
  if (kept !== undefined) return kept
  const result = (() => {
    try {
      const { version, size, data } = encodeQr(text, { ecc: level, border: 0 })
      return Option.some({ version, size, dark: data })
    } catch (error) {
      // No version holds the text; anything else is a fault to see.
      if (error instanceof Error && error.message === 'Data too long') return Option.none()
      throw error
    }
  })()
  if (encoded.size >= KEPT) encoded.delete(encoded.keys().next().value ?? key)
  encoded.set(key, result)
  return result
}

/** Every dark module as one path, one subpath per run of dark modules in a row. */
export const pathOf = (matrix: Matrix): string => {
  const runs: Array<string> = []
  matrix.dark.forEach((row, y) => {
    let start = -1
    row.forEach((dark, x) => {
      if (dark && start < 0) start = x
      if ((!dark || x === row.length - 1) && start >= 0) {
        const end = dark ? x + 1 : x
        runs.push(`M${start} ${y}h${end - start}v1h${start - end}z`)
        start = -1
      }
    })
  })
  return runs.join('')
}

const frameId = (id: string) => `${id}-frame`

export const Format = Schema.Literals(['svg', 'png'])
export type Format = typeof Format.Type

export const Message = defineMessageUnion({
  Downloaded: { format: Format },
  /** No code drawn under the id, or the browser refused to make the file. */
  DownloadFailed: { message: Schema.String },
})
export type Message = typeof Message.Type

/** The drawn code as SVG text, in the colors it is drawn in: a file has no tokens to read. */
const svgFile = (frame: SVGSVGElement, pixels: number): string => {
  const copy = frame.cloneNode(true)
  if (!(copy instanceof SVGSVGElement)) throw new Error('the frame is not an svg')
  const painted = (from: Element, to: Element) => {
    to.setAttribute('fill', getComputedStyle(from).fill)
    to.removeAttribute('class')
  }
  const drawn = frame.querySelectorAll('rect, path')
  copy.querySelectorAll('rect, path').forEach((each, at) => painted(drawn[at]!, each))
  copy.removeAttribute('class')
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copy.setAttribute('width', String(pixels))
  copy.setAttribute('height', String(pixels))
  return new XMLSerializer().serializeToString(copy)
}

const pngOf = async (svg: string, pixels: number): Promise<Blob> => {
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = pixels
  canvas.height = pixels
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('no 2D canvas')
  context.imageSmoothingEnabled = false
  context.drawImage(image, 0, 0, pixels, pixels)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      blob => (blob === null ? reject(new Error('no PNG')) : resolve(blob)),
      'image/png',
    ),
  )
}

const save = async (id: string, format: Format, filename: string, pixels: number) => {
  const frame = document.getElementById(frameId(id))
  if (!(frame instanceof SVGSVGElement)) throw new Error(`no QR code is drawn with the id ${id}`)
  const svg = svgFile(frame, pixels)
  const blob =
    format === 'svg' ? new Blob([svg], { type: 'image/svg+xml' }) : await pngOf(svg, pixels)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.${format}`
  link.click()
  // The browser has started the download once the click returns; the URL is no longer needed.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Saves the code drawn under `id` as `filename.svg` or `filename.png`,
 * `pixels` a side, in the colors the page draws it in; the overlay is
 * markup, which an image file cannot hold, so the file has the code alone.
 * Yields `Downloaded`, or `DownloadFailed` without the DOM or the code.
 */
export const Download = Command.define('QrCode.Download', {
  args: { id: Schema.String, format: Format, filename: Schema.String, pixels: Schema.Number },
  messages: [Message.Downloaded, Message.DownloadFailed],
  execute: ({ id, format, filename, pixels }) =>
    Effect.tryPromise({
      try: () => save(id, format, filename, pixels),
      catch: error => (error instanceof Error ? error.message : String(error)),
    }).pipe(
      Effect.match({
        onFailure: message => Message.DownloadFailed({ message }),
        onSuccess: () => Message.Downloaded({ format }),
      }),
    ),
})

export interface QrCodeView<Message> {
  /** Prefixes the ids the code draws, unique on the page; `Download` finds the code by it. */
  readonly id: string
  /** The text encoded: a URL, a contact, any string. */
  readonly value: string
  /** What the code holds, said aloud; default `QR code: ` and the value. */
  readonly label?: string | undefined
  /** The error correction; default `M`, and `H` when there is an overlay to cover. */
  readonly level?: Level | undefined
  /** The light margin around the code, in modules; default the standard's 4. */
  readonly quietZone?: number | undefined
  /** Drawn over the centre, such as a logo. */
  readonly overlay?: Html | undefined
  /** Said in place of the code when the value is too long; default `Too long for a QR code`. */
  readonly tooLong?: string | undefined
  /** A style of `QrCodeSlots`, for the look. */
  readonly style?: NamedStyle<typeof QrCodeSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Message>(options: QrCodeView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    QrCodeSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { overlay } = options
  const level = options.level ?? (overlay === undefined ? 'M' : 'H')
  const zone = Math.max(0, options.quietZone ?? 4)
  return Option.match(encode(options.value, level), {
    onNone: () =>
      h.div(builders.root.attrs([h.DataAttribute('overflow', 'true')]), [
        h.span(builders.fallback.attrs(), [options.tooLong ?? 'Too long for a QR code']),
      ]),
    onSome: matrix => {
      const side = String(matrix.size + zone * 2)
      return h.div(
        builders.root.attrs([
          h.Role('img'),
          h.AriaLabel(options.label ?? `QR code: ${options.value}`),
          h.DataAttribute('level', level),
        ]),
        [
          h.svg(
            builders.frame.attrs([
              h.Id(frameId(options.id)),
              h.ViewBox(`${-zone} ${-zone} ${side} ${side}`),
              // Module edges on whole pixels, or a scaled code blurs between them.
              h.ShapeRendering('crispEdges'),
              h.AriaHidden(true),
            ]),
            [
              h.rect(
                builders.background.attrs([
                  h.X(String(-zone)),
                  h.Y(String(-zone)),
                  h.Width(side),
                  h.Height(side),
                ]),
                [],
              ),
              h.path(builders.pattern.attrs([h.D(pathOf(matrix))]), []),
            ],
          ),
          ...(overlay === undefined ? [] : [h.div(builders.overlay.attrs(), [overlay])]),
        ],
      )
    },
  })
}

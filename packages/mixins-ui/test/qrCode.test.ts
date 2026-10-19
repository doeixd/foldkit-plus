/**
 * The QR code's encoding against the standard's published tables (format
 * and version information, each version's capacity), read back by a
 * decoder that shares no code with the encoder (jsQR), and drawn: one path
 * covering exactly the dark modules, a quiet zone in the view box, an image
 * named by what it encodes, and a fallback for a text too long to encode.
 * What the browser draws, and the downloaded files, are read back in
 * `qrCode.browser.test.ts`.
 */
import { Option } from 'effect'
import jsQR from 'jsqr'
import { SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import { describe, expect, it } from 'vitest'
import * as QrCode from '../src/qrCode.js'
import { QrCodeSlots, type Level, type Matrix } from '../src/qrCode.js'
import { QrCode as Recipe } from '../src/recipes/qrCode.js'
import { h, type TestMessage } from './fixture.js'

const levels: ReadonlyArray<Level> = ['L', 'M', 'Q', 'H']

const matrixOf = (text: string, level: Level): Matrix =>
  Option.getOrThrowWith(QrCode.encode(text, level), () => new Error(`${text} did not encode`))

/** The format strings of ISO/IEC 18004 table C.1, by level, then mask. */
const formats: Readonly<Record<Level, ReadonlyArray<string>>> = {
  L: [
    '111011111000100',
    '111001011110011',
    '111110110101010',
    '111100010011101',
    '110011000101111',
    '110001100011000',
    '110110001000001',
    '110100101110110',
  ],
  M: [
    '101010000010010',
    '101000100100101',
    '101111001111100',
    '101101101001011',
    '100010111111001',
    '100000011001110',
    '100111110010111',
    '100101010100000',
  ],
  Q: [
    '011010101011111',
    '011000001101000',
    '011111100110001',
    '011101000000110',
    '010010010110100',
    '010000110000011',
    '010111011011010',
    '010101111101101',
  ],
  H: [
    '001011010001001',
    '001001110111110',
    '001110011100111',
    '001100111010000',
    '000011101100010',
    '000001001010101',
    '000110100001100',
    '000100000111011',
  ],
}

const bit = (matrix: Matrix, x: number, y: number) => (matrix.dark[y]![x]! ? '1' : '0')

/** The format string beside the top left finder, most significant bit first. */
const formatAt = (matrix: Matrix): string =>
  [
    ...[0, 1, 2, 3, 4, 5, 7, 8].map(x => bit(matrix, x, 8)),
    ...[7, 5, 4, 3, 2, 1, 0].map(y => bit(matrix, 8, y)),
  ].join('')

/** Its copy, split under the top right finder and beside the bottom left one. */
const formatCopyAt = (matrix: Matrix): string => {
  const last = matrix.size - 1
  return [
    ...[0, 1, 2, 3, 4, 5, 6].map(at => bit(matrix, 8, last - at)),
    ...[7, 6, 5, 4, 3, 2, 1, 0].map(at => bit(matrix, last - at, 8)),
  ].join('')
}

/** A mask from its format string: the string is unique per level and mask. */
const maskOf = (matrix: Matrix, level: Level) => formats[level].indexOf(formatAt(matrix))

/** The code as RGBA pixels, `scale` a module, in a quiet zone of 4, for a decoder. */
const pixelsOf = (matrix: Matrix, scale = 4) => {
  const side = (matrix.size + 8) * scale
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255)
  matrix.dark.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const at = (((y + 4) * scale + dy) * side + (x + 4) * scale + dx) * 4
          pixels.fill(0, at, at + 3)
        }
    }),
  )
  return { pixels, side }
}

const decoded = (matrix: Matrix): Option.Option<string> => {
  const { pixels, side } = pixelsOf(matrix)
  return Option.map(Option.fromNullishOr(jsQR(pixels, side, side)), code => code.data)
}

describe('QrCode.encode', () => {
  it.each(levels)('writes the format string of level %s and its mask, twice', level => {
    const matrix = matrixOf('HELLO WORLD', level)
    expect(maskOf(matrix, level)).toBeGreaterThanOrEqual(0)
    expect(formatCopyAt(matrix)).toBe(formatAt(matrix))
  })

  it('writes the version information of version 7, 000111110010010100', () => {
    const matrix = matrixOf('a'.repeat(140), 'L')
    expect(matrix.version).toBe(7)
    // Bit i of the 18 sits at row size - 11 + i % 3, column i / 3, in the block above the bottom left finder.
    const bits = Array.from({ length: 18 }, (_, at) =>
      bit(matrix, Math.floor(at / 3), matrix.size - 11 + (at % 3)),
    )
    expect(bits.reverse().join('')).toBe('000111110010010100')
  })

  it.each([
    ['bytes at L', 'a', 'L', 17, 2953],
    ['bytes at H', 'a', 'H', 7, 1273],
    ['digits at L', '1', 'L', 41, 7089],
    ['capitals at L', 'A', 'L', 25, 4296],
  ] as const)(
    'takes as many %s as the standard says versions 1 and 40 hold',
    (_, unit, level, first, last) => {
      const version = (length: number) =>
        Option.map(QrCode.encode(unit.repeat(length), level), matrix => matrix.version)
      expect(version(first)).toEqual(Option.some(1))
      expect(version(first + 1)).toEqual(Option.some(2))
      expect(version(last)).toEqual(Option.some(40))
      expect(version(last + 1)).toEqual(Option.none())
    },
  )

  it('is size 17 + 4 × version modules a side', () => {
    for (const length of [1, 40, 300]) {
      const matrix = matrixOf('x'.repeat(length), 'M')
      expect(matrix.size).toBe(17 + 4 * matrix.version)
      expect(matrix.dark.map(row => row.length)).toEqual(Array(matrix.size).fill(matrix.size))
    }
  })

  it.each(
    levels.flatMap(level =>
      [
        'https://example.com/menu?table=12',
        'HELLO WORLD',
        '0123456789',
        'héllo €',
        'ü'.repeat(200),
      ].map(text => [text, level] as const),
    ),
  )('reads %s back at level %s', (text, level) => {
    expect(decoded(matrixOf(text, level))).toEqual(Option.some(text))
  })
})

/** Every module a path of `M x y h n v1 h-n z` runs covers. */
const cellsOf = (path: string): ReadonlySet<string> => {
  const cells = new Set<string>()
  for (const [, x, y, width] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g))
    for (let at = 0; at < Number(width); at++) cells.add(`${Number(x) + at},${y}`)
  return cells
}

describe('QrCode.pathOf', () => {
  it('covers exactly the dark modules, a row at a time', () => {
    const matrix = matrixOf('https://example.com', 'Q')
    const dark = new Set(
      matrix.dark.flatMap((row, y) => row.flatMap((on, x) => (on ? [`${x},${y}`] : []))),
    )
    const path = QrCode.pathOf(matrix)
    // Nothing but whole runs: no stray command a parse would skip.
    expect(path.replace(/M\d+ \d+h\d+v1h-\d+z/g, '')).toBe('')
    expect(cellsOf(path)).toEqual(dark)
  })
})

const style = Style.forSlots(QrCodeSlots)(Recipe({}))
type More = Partial<QrCode.QrCodeView<TestMessage>>
const Code = SlotView.forMessages<TestMessage>().define(QrCodeSlots, (more: More, _, h) =>
  QrCode.view({ id: 'menu', value: 'https://example.com/menu', style, ...more }, h),
)
const drawn = (more: More = {}) => Inert.draw(Code, more)
const only = (root: ReturnType<typeof drawn>, slot: string) => {
  const [node, ...more] = Inert.bySlot(root, slot)
  expect(more).toEqual([])
  return node
}

describe('QrCode.view', () => {
  it('is one image named by what it encodes, or by its label', () => {
    expect(Inert.byRole(drawn(), 'img').map(node => Inert.value(node, 'aria-label'))).toEqual([
      'QR code: https://example.com/menu',
    ])
    expect(Inert.value(only(drawn({ label: 'Our menu' }), 'root'), 'aria-label')).toBe('Our menu')
  })

  it('draws every dark module in one path, inside a quiet zone of four', () => {
    const matrix = matrixOf('https://example.com/menu', 'M')
    const code = drawn()
    expect(Inert.value(only(code, 'pattern'), 'd')).toBe(QrCode.pathOf(matrix))
    const side = matrix.size + 8
    expect(Inert.value(only(code, 'frame'), 'viewBox')).toBe(`-4 -4 ${side} ${side}`)
    const background = only(code, 'background')
    expect(['x', 'y', 'width', 'height'].map(key => Inert.value(background, key))).toEqual([
      '-4',
      '-4',
      String(side),
      String(side),
    ])
  })

  it('takes its quiet zone and level', () => {
    const matrix = matrixOf('https://example.com/menu', 'L')
    const code = drawn({ quietZone: 0, level: 'L' })
    expect(Inert.value(only(code, 'frame'), 'viewBox')).toBe(`0 0 ${matrix.size} ${matrix.size}`)
    expect(Inert.value(only(code, 'pattern'), 'd')).toBe(QrCode.pathOf(matrix))
  })

  it('corrects at M, and at H under an overlay it must read through', () => {
    expect(Inert.value(only(drawn(), 'root'), 'data-level')).toBe('M')
    const covered = drawn({ overlay: h.img([h.Src('logo.svg'), h.Alt('')]) })
    expect(Inert.value(only(covered, 'root'), 'data-level')).toBe('H')
    expect(Inert.byTag(only(covered, 'overlay'), 'img')).toHaveLength(1)
    expect(
      Inert.value(only(drawn({ overlay: h.span([], []), level: 'Q' }), 'root'), 'data-level'),
    ).toBe('Q')
  })

  it('says so in place of a code too long for any version', () => {
    const code = drawn({ value: 'a'.repeat(3000) })
    expect(Inert.bySlot(code, 'frame')).toEqual([])
    expect(Inert.byRole(code, 'img')).toEqual([])
    expect(Inert.text(only(code, 'fallback'))).toBe('Too long for a QR code')
    expect(
      Inert.text(only(drawn({ value: 'a'.repeat(3000), tooLong: 'Too long' }), 'fallback')),
    ).toBe('Too long')
  })

  it('draws nothing outside its slots, and reads only tokens the theme declares', () => {
    const code = drawn({ overlay: h.span([], ['logo']) })
    expect(Inert.unslotted(code, { inside: ['overlay'] })).toEqual([])
    const theme = Theme.standard(Theme.make({ accent: { hue: 260, chroma: 0.15, lightness: 55 } }))
    expect(Inert.css([code]).length).toBeGreaterThan(0)
    expect(Inert.missingTokens(code, Style.stylesheet(Theme.root(theme)))).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { gradeOf, luminance, ratio, type Rgb } from '../src/contrast.js'

const black: Rgb = [0, 0, 0]
const white: Rgb = [255, 255, 255]

describe('contrast', () => {
  it('measures black on white as 21 and a colour on itself as 1, whichever side is which', () => {
    expect(ratio(black, white)).toBeCloseTo(21, 5)
    expect(ratio(white, black)).toBeCloseTo(21, 5)
    expect(ratio([119, 119, 119], [119, 119, 119])).toBeCloseTo(1, 5)
  })

  it('reads the grey 767676 on white as just over 4.5, the AA line', () => {
    expect(ratio([118, 118, 118], white)).toBeGreaterThan(4.5)
    expect(ratio([119, 119, 119], white)).toBeLessThan(4.5)
  })

  it('weights green most and blue least', () => {
    expect(luminance([0, 255, 0])).toBeGreaterThan(luminance([255, 0, 0]))
    expect(luminance([255, 0, 0])).toBeGreaterThan(luminance([0, 0, 255]))
  })

  it.each([
    [21, 'AAA'],
    [7, 'AAA'],
    [6.99, 'AA'],
    [4.5, 'AA'],
    [4.49, 'Large'],
    [3, 'Large'],
    [2.99, 'Fail'],
  ] as const)('grades %d as %s', (value, grade) => {
    expect(gradeOf(value)).toBe(grade)
  })
})

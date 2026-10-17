/** `cornerRadius`: the radius a box draws for its computed top left corner. */
import { describe, expect, it } from 'vitest'
import { cornerRadius } from '../src/dom/track-box.js'

describe('cornerRadius', () => {
  it.each([
    ['8px', 100, 40, 8],
    // Elliptical: the horizontal length.
    ['8px 4px', 100, 40, 8],
    // A percentage is a share of the width.
    ['10%', 200, 100, 20],
    // Never past half the shorter side, where the browser stops it: a pill and a circle.
    ['999px', 100, 40, 20],
    ['50%', 40, 40, 20],
    ['0px', 100, 40, 0],
    ['', 100, 40, 0],
  ])('%s on %d by %d is %d', (value, width, height, radius) => {
    expect(cornerRadius(value, width, height)).toBe(radius)
  })
})

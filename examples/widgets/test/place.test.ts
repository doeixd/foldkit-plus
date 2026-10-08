import { describe, expect, it } from 'vitest'
import { placeFor } from '../src/place.js'

describe('placeFor', () => {
  it('holds still inside the window', () => {
    expect(
      placeFor({ top: 100, right: 800, bottom: 300, height: 200 }, { width: 1024, height: 768 }),
    ).toEqual({ dx: 0, flip: false })
  })

  it('moves left by the overflow plus a breath', () => {
    expect(
      placeFor({ top: 100, right: 1100, bottom: 300, height: 200 }, { width: 1024, height: 768 }),
    ).toEqual({ dx: -84, flip: false })
  })

  it('flips above when the bottom clears and the room overhead fits', () => {
    expect(
      placeFor({ top: 600, right: 400, bottom: 800, height: 200 }, { width: 1024, height: 768 }),
    ).toEqual({ dx: 0, flip: true })
  })

  it('stays below when nothing overhead fits', () => {
    expect(
      placeFor({ top: 100, right: 400, bottom: 800, height: 700 }, { width: 1024, height: 768 }),
    ).toEqual({ dx: 0, flip: false })
  })
})

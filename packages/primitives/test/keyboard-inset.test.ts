/** `keyboardInset`: what of the layout viewport the visual viewport leaves out below it. */
import { describe, expect, it } from 'vitest'
import { keyboardInset } from '../src/dom/keyboard-inset.js'

describe('keyboardInset', () => {
  it.each([
    { name: 'no keyboard', height: 800, offsetTop: 0, inset: 0 },
    { name: 'a keyboard over the bottom', height: 500, offsetTop: 0, inset: 300 },
    { name: 'a keyboard while pinched out', height: 500, offsetTop: 0, scale: 0.8, inset: 300 },
    {
      name: 'a keyboard at a scale a hair off 1',
      height: 500,
      offsetTop: 0,
      scale: 1.001,
      inset: 300,
    },
    {
      name: 'a pinch zoom that shortens the viewport',
      height: 400,
      offsetTop: 0,
      scale: 2,
      inset: 0,
    },
    {
      name: 'a pinch zoom scrolled down the page',
      height: 400,
      offsetTop: 150,
      scale: 2,
      inset: 0,
    },
    // Scrolled while open: what is above the visual viewport is no keyboard.
    { name: 'a keyboard, the page scrolled under it', height: 500, offsetTop: 120, inset: 180 },
    { name: 'a fraction of a pixel of zoom', height: 799.6, offsetTop: 0, inset: 0 },
  ])('$name', ({ height, offsetTop, scale = 1, inset }) => {
    expect(keyboardInset({ innerHeight: 800, visualViewport: { height, offsetTop, scale } })).toBe(
      inset,
    )
  })

  it('is 0 where there is no visual viewport', () => {
    expect(keyboardInset({ innerHeight: 800, visualViewport: null })).toBe(0)
  })
})

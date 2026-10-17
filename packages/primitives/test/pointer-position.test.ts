/**
 * `contentBoxOf`: the box inside an element's border and padding, each side
 * apart, so a left border is not read as a right one; and never smaller
 * than nothing.
 */
import { expect, it } from 'vitest'
import { contentBoxOf } from '../src/dom/pointer-position.js'

const none = { top: 0, right: 0, bottom: 0, left: 0 }
const rect = { left: 50, top: 40, width: 246, height: 126 }

it.each([
  ['no border or padding', none, none, { left: 50, top: 40, width: 246, height: 126 }],
  [
    'a border',
    { top: 1, right: 2, bottom: 3, left: 4 },
    none,
    { left: 54, top: 41, width: 240, height: 122 },
  ],
  [
    'a border and padding',
    { top: 1, right: 2, bottom: 3, left: 4 },
    { top: 10, right: 20, bottom: 30, left: 40 },
    { left: 94, top: 51, width: 180, height: 82 },
  ],
  [
    'sides wider than the box',
    none,
    { top: 100, right: 200, bottom: 100, left: 200 },
    { left: 250, top: 140, width: 0, height: 0 },
  ],
])('%s', (_, border, padding, expected) => {
  expect(contentBoxOf({ rect, border, padding })).toEqual(expected)
})

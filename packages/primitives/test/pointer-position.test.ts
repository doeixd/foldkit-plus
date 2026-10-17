/**
 * `paddingBoxOf`: the box inside an element's border, each side apart, so a
 * left border is not read as a right one; and never smaller than nothing.
 */
import { expect, it } from 'vitest'
import { paddingBoxOf } from '../src/dom/pointer-position.js'

const rect = { left: 50, top: 40, width: 246, height: 126 }

it.each([
  ['no border', { top: 0, right: 0, bottom: 0, left: 0 }, rect],
  [
    'a border',
    { top: 1, right: 2, bottom: 3, left: 4 },
    { left: 54, top: 41, width: 240, height: 122 },
  ],
  [
    'a border wider than the box',
    { top: 100, right: 200, bottom: 100, left: 200 },
    { left: 250, top: 140, width: 0, height: 0 },
  ],
])('%s', (_, border, expected) => {
  expect(paddingBoxOf({ rect, border })).toEqual(expected)
})

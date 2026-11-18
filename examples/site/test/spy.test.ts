import { Option } from 'effect'
import { expect, test } from 'vitest'

import { sectionAt } from '../src/spy.js'

const ids = ['intro', 'install', 'usage', 'limits']
const at = (tops: ReadonlyArray<number>, atEnd = false) => sectionAt(ids, tops, 200, atEnd)

test.each([
  {
    name: 'above the first heading nothing is marked',
    tops: [400, 900, 1500, 2100],
    section: Option.none(),
  },
  {
    name: 'a heading at the lead line counts',
    tops: [-300, 200, 900, 1500],
    section: Option.some('install'),
  },
  {
    name: 'the last heading above the lead line wins',
    tops: [-1200, -800, 120, 900],
    section: Option.some('usage'),
  },
  {
    name: 'a heading just under the lead line does not',
    tops: [-1200, -800, 201, 900],
    section: Option.some('install'),
  },
])('$name', ({ tops, section }) => {
  expect(at(tops)).toEqual(section)
})

test('at the end of the page the last section is the reader’s, though its heading is low', () => {
  expect(at([-900, -500, -100, 600], true)).toEqual(Option.some('limits'))
})

test('a page with no sections has no place', () => {
  expect(sectionAt([], [], 200, true)).toEqual(Option.none())
})

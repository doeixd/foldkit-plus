import { describe, expect, it } from 'vitest'
import { sameData } from '../src/data.js'

describe('sameData', () => {
  it.each<[string, unknown, unknown, boolean]>([
    ['equal primitives', 'a', 'a', true],
    ['NaN', NaN, NaN, true],
    ['different primitives', 1, 2, false],
    ['arrays of equal objects', [{ a: 1 }], [{ a: 1 }], true],
    ['arrays of different objects', [{ a: 1 }], [{ a: 2 }], false],
    ['arrays of different lengths', [1], [1, 2], false],
    ['nested equal objects', { a: { b: [1] } }, { a: { b: [1] } }, true],
    ['an object gaining a key', { a: 1 }, { a: 1, b: 2 }, false],
    ['an object losing a key', { a: 1, b: 2 }, { a: 1 }, false],
    ['the same count of other keys', { a: undefined }, { b: undefined }, false],
    ['an array and an object', [1], { 0: 1 }, false],
    ['null and an object', null, {}, false],
    ['equal dates, which are not plain data', new Date(0), new Date(0), false],
  ])('%s', (_name, left, right, same) => {
    expect(sameData(left, right)).toBe(same)
  })
})

import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import {
  findFirstEnabledIndex,
  groupContiguous,
  isPrintableKey,
  keyToIndex,
  resolveTypeaheadMatch,
  whenOption,
  wrapIndex,
} from '../src/menuUtils.js'

const none = Option.none()

describe('groupContiguous', () => {
  it('collects adjacent same-key items into one segment', () => {
    expect(groupContiguous(['a1', 'a2', 'b1'], item => item.slice(0, 1))).toEqual([
      { key: 'a', items: ['a1', 'a2'] },
      { key: 'b', items: ['b1'] },
    ])
  })

  it('splits the same key when it recurs non-adjacently', () => {
    expect(groupContiguous(['a1', 'b1', 'a2'], item => item.slice(0, 1))).toEqual([
      { key: 'a', items: ['a1'] },
      { key: 'b', items: ['b1'] },
      { key: 'a', items: ['a2'] },
    ])
  })

  it('keys by index when asked', () => {
    expect(groupContiguous(['x', 'y'], (_item, index) => String(index % 2))).toEqual([
      { key: '0', items: ['x'] },
      { key: '1', items: ['y'] },
    ])
  })
})

describe('keyboard index helpers', () => {
  it('isPrintableKey accepts one character and refuses named keys', () => {
    expect(isPrintableKey('a')).toBe(true)
    expect(isPrintableKey('Enter')).toBe(false)
    expect(isPrintableKey(' ')).toBe(true)
  })

  it('wrapIndex wraps negative and overflowing indices', () => {
    expect(wrapIndex(-1, 3)).toBe(2)
    expect(wrapIndex(3, 3)).toBe(0)
    expect(wrapIndex(1, 3)).toBe(1)
  })

  it('findFirstEnabledIndex skips disabled and wraps around', () => {
    expect(findFirstEnabledIndex(3, 0, index => index === 1)(1, 1)).toBe(2)
    expect(findFirstEnabledIndex(3, 0, index => index !== 0)(1, 1)).toBe(0)
  })

  it('findFirstEnabledIndex falls back to the focused index when all are disabled', () => {
    expect(findFirstEnabledIndex(2, 1, () => true)(0, 1)).toBe(1)
  })

  it('keyToIndex moves by key and holds on unknown keys', () => {
    const resolve = keyToIndex('ArrowDown', 'ArrowUp', 3, 0, () => false)
    expect(resolve('ArrowDown')).toBe(1)
    expect(resolve('ArrowUp')).toBe(2)
    expect(resolve('Home')).toBe(0)
    expect(resolve('End')).toBe(2)
    expect(resolve('Tab')).toBe(0)
  })
})

describe('resolveTypeaheadMatch', () => {
  const fruits = ['apple', 'apricot', 'banana']
  const text = (item: string) => item
  const enabled = () => false

  it('matches forward from after the active item on a fresh search', () => {
    expect(resolveTypeaheadMatch(fruits, 'ap', Option.some(0), enabled, text, false)).toEqual(
      Option.some(1),
    )
  })

  it('includes the active item when refining', () => {
    expect(resolveTypeaheadMatch(fruits, 'app', Option.some(0), enabled, text, true)).toEqual(
      Option.some(0),
    )
  })

  it('starts at zero with no active item', () => {
    expect(resolveTypeaheadMatch(fruits, 'b', none, enabled, text, false)).toEqual(Option.some(2))
  })

  it('skips disabled items and answers none when nothing matches', () => {
    expect(resolveTypeaheadMatch(fruits, 'ap', none, index => index !== 1, text, false)).toEqual(
      Option.some(1),
    )
    expect(resolveTypeaheadMatch(fruits, 'z', none, enabled, text, false)).toEqual(none)
  })

  it('matches case-insensitively', () => {
    expect(resolveTypeaheadMatch(fruits, 'AP', none, enabled, text, false)).toEqual(Option.some(0))
  })
})

describe('whenOption', () => {
  it('keeps the value on true and drops it on false', () => {
    expect(whenOption(true, 'x')).toEqual(Option.some('x'))
    expect(whenOption(false, 'x')).toEqual(none)
  })

  it('curries over the value', () => {
    expect(whenOption('x')(true)).toEqual(Option.some('x'))
    expect(whenOption('x')(false)).toEqual(none)
  })
})

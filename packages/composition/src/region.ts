/**
 * Regions: the stored positions inside a Block where other Blocks are placed.
 *
 * A Region is not a Mixins Slot. A Slot is a rendered element that Style or
 * Behavior attaches to; a Region is a place in the Document. A Renderer draws a
 * Region's children into whichever element it chooses.
 */
import type { Content } from './content.js'

export interface Region {
  readonly _tag: 'Region'
  readonly cardinality: 'one' | 'many'
  /** The Content a child must provide one of. */
  readonly accepts: ReadonlyArray<Content>
  /** The fewest children it may hold. */
  readonly min: number
  /** The most children it may hold; `Infinity` for no limit. */
  readonly max: number
}

const check = (accepted: ReadonlyArray<Content>): ReadonlyArray<Content> => {
  if (accepted.length === 0)
    throw new Error('Region: `accepts` names no Content, so nothing could be placed in it')
  return Object.freeze([...accepted])
}

const count = (value: number, what: string): number => {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`Region.many: \`${what}\` must be a whole number of children, not ${value}`)
  return value
}

export const Region = {
  /** Exactly one child, or at most one when `optional`. */
  one: (config: {
    readonly accepts: ReadonlyArray<Content>
    readonly optional?: boolean
  }): Region =>
    Object.freeze({
      _tag: 'Region',
      cardinality: 'one',
      accepts: check(config.accepts),
      min: config.optional === true ? 0 : 1,
      max: 1,
    }),

  /** Any number of children, from `min` (default 0) to `max` (default no limit). */
  many: (config: {
    readonly accepts: ReadonlyArray<Content>
    readonly min?: number
    readonly max?: number
  }): Region => {
    const min = count(config.min ?? 0, 'min')
    const max = config.max === undefined ? Infinity : count(config.max, 'max')
    if (max < min) throw new Error(`Region.many: \`max\` (${max}) is below \`min\` (${min})`)
    return Object.freeze({
      _tag: 'Region',
      cardinality: 'many',
      accepts: check(config.accepts),
      min,
      max,
    })
  },
}

/** How many children a Region takes, in words: `exactly 1`, `0 to 3`, `at least 1`. */
export const bounds = (region: Region): string =>
  region.min === region.max
    ? `exactly ${region.min}`
    : region.max === Infinity
      ? region.min === 0
        ? 'any number'
        : `at least ${region.min}`
      : `${region.min} to ${region.max}`

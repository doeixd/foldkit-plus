import { describe, expect, it } from 'vitest'
import { Metadata, MetadataTypeId } from '../src/index.js'

const union = (values: ReadonlyArray<string>) => [...new Set(values)]
const Tags = Metadata.key<string>('tags', { merge: union, summarize: tag => tag })
const Limits = Metadata.key<number>('limits', {
  merge: values => [Math.min(...values)],
  summarize: limit => `<= ${limit}`,
})

describe('Metadata', () => {
  it('merges each key across combined parts with that key’s own merge', () => {
    const combined = Metadata.combine([
      Tags.of('a', 'b'),
      Limits.of(10),
      Tags.of('b', 'c'),
      Limits.of(3),
    ])

    expect(Tags.get(combined)).toEqual(['a', 'b', 'c'])
    expect(Limits.get(combined)).toEqual([3])
  })

  it('runs merge on a single `of`, so one value is already normalized', () => {
    expect(Tags.get(Tags.of('a', 'a'))).toEqual(['a'])
  })

  it('looks entries up by key identity, not by name', () => {
    const Impostor = Metadata.key<string>('tags', { merge: union, summarize: tag => tag })

    expect(Impostor.get(Tags.of('a'))).toEqual([])
  })

  it.each([
    ['no parts', []],
    ['empty parts', [Metadata.empty, Tags.of()]],
  ])('combines %s to the shared empty value', (_, parts) => {
    expect(Metadata.combine(parts)).toBe(Metadata.empty)
  })

  it('summarizes every key as text, in the order keys were first seen', () => {
    expect(Metadata.summarize(Metadata.combine([Limits.of(5), Tags.of('a', 'b')]))).toEqual([
      { name: 'limits', entries: ['<= 5'] },
      { name: 'tags', entries: ['a', 'b'] },
    ])
  })

  it('treats a forged brand or a copy as empty, alone or beside a sibling', () => {
    const original = Tags.of('a')
    const forged = Object.freeze({ [MetadataTypeId]: MetadataTypeId }) as Metadata

    for (const foreign of [forged, { ...original }, structuredClone(original)]) {
      expect(Metadata.is(foreign)).toBe(false)
      expect(Tags.get(foreign)).toEqual([])
      expect(Metadata.combine([foreign])).toBe(Metadata.empty)
      expect(Tags.get(Metadata.combine([foreign, Tags.of('b')]))).toEqual(['b'])
    }
    expect(Metadata.is(original)).toBe(true)
  })

  it('cannot be changed after it is made', () => {
    const made = Metadata.combine([Tags.of('a'), Tags.of('b')])

    expect(Object.isFrozen(made)).toBe(true)
    for (const metadata of [made, Tags.of('a'), Metadata.empty])
      expect(() => (Tags.get(metadata) as string[]).push('c')).toThrow(TypeError)
    expect(Tags.get(made)).toEqual(['a', 'b'])
  })
})

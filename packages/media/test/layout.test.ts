import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Layout, Widths } from 'foldkit-media'

const ladder = Widths.make([800, 100, 400, 200])

describe('Widths', () => {
  it('sorts its widths, and decodes only those', () => {
    expect(ladder.values).toEqual([100, 200, 400, 800])
    expect(Widths.atLeast(ladder, 150)).toBe(200)
    expect(Widths.atLeast(ladder, 900)).toBe(800)
    expect(Schema.decodeUnknownSync(ladder.Schema)(200)).toBe(200)
    expect(() => Schema.decodeUnknownSync(ladder.Schema)(300)).toThrow()
  })

  it.each([
    ['an empty ladder', []],
    ['a zero width', [0, 100]],
    ['a fractional width', [100, 150.5]],
    ['a repeated width', [100, 200, 100]],
  ])('refuses %s', (_, values) => {
    expect(() => Widths.make(values)).toThrow(/Widths\.make/)
  })
})

describe('Layout.candidates', () => {
  it.each([
    [
      'a fixed image takes its 1x and 2x',
      Layout.Fixed({ width: 150 }),
      1000,
      [
        [200, 200],
        [400, 400],
      ],
    ],
    [
      'a fixed image above the original describes the original',
      Layout.Fixed({ width: 150 }),
      300,
      [
        [200, 200],
        [400, 300],
      ],
    ],
    [
      'a fixed image wider than the ladder takes its top once',
      Layout.Fixed({ width: 500 }),
      1000,
      [[800, 800]],
    ],
    [
      'a constrained image takes every width up to its 2x',
      Layout.Constrained({ width: 150 }),
      1000,
      [
        [100, 100],
        [200, 200],
        [400, 400],
      ],
    ],
    [
      'a constrained image keeps one width above the original',
      Layout.Constrained({ width: 150 }),
      150,
      [
        [100, 100],
        [200, 150],
      ],
    ],
    [
      'a full-width image takes the ladder',
      Layout.FullWidth(),
      1000,
      [
        [100, 100],
        [200, 200],
        [400, 400],
        [800, 800],
      ],
    ],
    ['an original below the ladder is offered once', Layout.FullWidth(), 50, [[100, 50]]],
  ] as const)('%s', (_, layout, intrinsic, expected) => {
    expect(
      Layout.candidates(layout, ladder, intrinsic).map(({ request, described }) => [
        request,
        described,
      ]),
    ).toEqual(expected)
  })
})

describe('Layout.sizes and Layout.box', () => {
  it.each([
    [Layout.Fixed({ width: 150 }), '150px', { width: 150, height: 75 }],
    [
      Layout.Constrained({ width: 333 }),
      '(min-width: 333px) 333px, 100vw',
      { width: 333, height: 167 },
    ],
    [Layout.FullWidth(), '100vw', { width: 1000, height: 500 }],
  ])('%o', (layout, sizes, box) => {
    expect(Layout.sizes(layout)).toBe(sizes)
    expect(Layout.box(layout, { width: 1000, height: 500 })).toEqual(box)
  })
})

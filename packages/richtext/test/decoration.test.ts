/**
 * Decorations (§64): derived, ephemeral presentation over document ranges, and the
 * projection a renderer shares — which decoration covers which run, and where.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const at = (node: string, offset: number): RichText.Position => ({
  node: id(node),
  offset,
  affinity: 'after',
})

const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 'a', text: 'ab', marks: [] },
          { type: 'Text', id: 'b', text: 'cd', marks: [] },
        ],
      },
      {
        type: 'Paragraph',
        id: 'q',
        children: [{ type: 'Text', id: 'c', text: 'ef', marks: [] }],
      },
    ],
  })

const decoration = (
  from: readonly [string, number],
  to: readonly [string, number],
  kind = 'search',
): RichText.Decoration => ({ from: at(from[0], from[1]), to: at(to[0], to[1]), kind })

/** The spans per run, as `[from, to]` pairs, so a case reads at a glance. */
const spans = (set: RichText.DecorationSet) =>
  Object.fromEntries(
    [...RichText.decorationsIn(document(), set)].map(([run, list]) => [
      run,
      list.map(span => [span.from, span.to]),
    ]),
  )

describe('projecting decorations over a document', () => {
  it('covers the run a decoration sits in, in that run’s offsets', () => {
    expect(spans([decoration(['a', 0], ['a', 2])])).toEqual({ a: [[0, 2]] })
  })

  it('cuts a decoration at each run’s edge when it crosses runs', () => {
    expect(spans([decoration(['a', 1], ['b', 2])])).toEqual({ a: [[1, 2]], b: [[0, 2]] })
  })

  it('crosses blocks the same way, because document order is what it walks', () => {
    expect(spans([decoration(['b', 0], ['c', 1])])).toEqual({ b: [[0, 2]], c: [[0, 1]] })
  })

  it('honours a backwards range rather than requiring it to run forwards', () => {
    expect(spans([decoration(['b', 2], ['a', 1])])).toEqual({ a: [[1, 2]], b: [[0, 2]] })
  })

  it('is nothing for an empty range or a position this document cannot resolve', () => {
    expect(spans([decoration(['a', 1], ['a', 1])])).toEqual({})
    expect(spans([decoration(['nope', 0], ['a', 1])])).toEqual({})
  })

  it('clamps an offset past the run rather than dropping the decoration', () => {
    expect(spans([decoration(['a', 1], ['a', 9])])).toEqual({ a: [[1, 2]] })
  })

  it('orders several decorations over one run by where they start', () => {
    const projected = RichText.decorationsIn(document(), [
      decoration(['a', 1], ['a', 2], 'cursor'),
      decoration(['a', 0], ['a', 2], 'search'),
    ])
    expect(projected.get(id('a'))?.map(span => [span.from, span.to, span.decoration.kind])).toEqual(
      [
        [0, 2, 'search'],
        [1, 2, 'cursor'],
      ],
    )
  })

  it('carries the decoration’s data through, unread', () => {
    const marked: RichText.Decoration<{ score: number }> = {
      ...decoration(['a', 0], ['a', 1]),
      data: { score: 3 },
    }
    expect(RichText.decorationsIn(document(), [marked]).get(id('a'))?.[0]?.decoration.data).toEqual(
      {
        score: 3,
      },
    )
  })

  it('keeps a nested run where the document puts it when a decoration crosses it', () => {
    // A container's runs sit between its siblings' runs in document order, which is the
    // order the index has to agree with.
    const nested = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [{ type: 'Text', id: 'a', text: 'ab', marks: [] }],
        },
        {
          type: 'Node',
          kind: 'Quote',
          id: 'q',
          props: {},
          children: [],
          blocks: [
            {
              type: 'Paragraph',
              id: 'qp',
              children: [{ type: 'Text', id: 'n', text: 'cd', marks: [] }],
            },
          ],
        },
        {
          type: 'Paragraph',
          id: 'r',
          children: [{ type: 'Text', id: 'z', text: 'ef', marks: [] }],
        },
      ],
    })
    const projected = RichText.decorationsIn(nested, [decoration(['a', 0], ['z', 1])])
    expect([...projected.keys()]).toEqual(['a', 'n', 'z'])
    expect(projected.get(id('n'))?.map(span => [span.from, span.to])).toEqual([[0, 2]])
    expect(projected.get(id('z'))?.map(span => [span.from, span.to])).toEqual([[0, 1]])
  })
})

describe('the pieces a run is drawn as', () => {
  const span = (from: number, to: number, kind: string): RichText.DecorationSpan => ({
    from,
    to,
    decoration: {
      from: { node: RichText.NodeId.make('r'), offset: from, affinity: 'before' },
      to: { node: RichText.NodeId.make('r'), offset: to, affinity: 'before' },
      kind,
    },
  })
  const drawn = (text: string, spans: ReadonlyArray<RichText.DecorationSpan>) =>
    RichText.runPieces(text, spans).map(piece => [
      piece.text,
      piece.decorations.map(decoration => decoration.kind),
    ])

  it('is the whole run, empty or not, when nothing covers it', () => {
    expect(drawn('abc', [])).toEqual([['abc', []]])
    expect(drawn('', [])).toEqual([['', []]])
  })

  it('cuts at every edge and gives each piece what covers all of it', () => {
    expect(drawn('abcdef', [span(1, 4, 'x'), span(3, 5, 'y')])).toEqual([
      ['a', []],
      ['bc', ['x']],
      ['d', ['x', 'y']],
      ['e', ['y']],
      ['f', []],
    ])
  })
})

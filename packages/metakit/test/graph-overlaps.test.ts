/**
 * `graph.overlaps` over random pairs of writers: it answers the same in either
 * order, and finds a reason exactly where a direct reference says the two
 * meet, a row write bridged into a Model path included.
 */
import { Option } from 'effect'
import * as Graph from 'metakit/graph'
import { describe, expect, it } from 'vitest'

/** A small seeded generator (mulberry32), so a failing case reproduces. */
const seeded = (seed: number) => {
  let state = seed >>> 0
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const links: ReadonlyArray<Graph.RowToModelLink> = [
  { row: Graph.rowPath('Note', []), model: Graph.modelPath(['remote', 'notes']) },
  { row: Graph.rowPath('Tag', ['name']), model: Graph.modelPath(['remote', 'tags']) },
]

const addresses: ReadonlyArray<Graph.PathAddress> = [
  Graph.modelPath(['remote']),
  Graph.modelPath(['remote', 'notes']),
  Graph.modelPath(['remote', 'notes', 'title']),
  Graph.modelPath(['remote', 'tags']),
  Graph.modelPath(['ui']),
  Graph.modelPath(['ui', 'theme']),
  Graph.rowPath('Note', ['title']),
  Graph.rowPath('Note', []),
  Graph.rowPath('Tag', ['name']),
  Graph.rowPath('Tag', ['color']),
]

const edgesFrom = (random: () => number, max: number): Array<Graph.PathEdge> => {
  const edges: Array<Graph.PathEdge> = []
  const count = Math.floor(random() * (max + 1))
  for (let i = 0; i < count; i++) {
    edges.push(
      random() < 0.1
        ? Graph.unknownEdge()
        : Graph.knownEdge(addresses[Math.floor(random() * addresses.length)]!),
    )
  }
  return edges
}

const known = (edge: Graph.PathEdge): Option.Option<Graph.PathAddress> =>
  edge.knowledge === 'unknown' ? Option.none() : edge.path

/** Whether a write of `write` reaches `target`: unknown on either side, a shared prefix, or a bridge. */
const reaches = (write: Graph.PathEdge, target: Graph.PathEdge): boolean =>
  Option.match(known(write), {
    onNone: () => true,
    onSome: w =>
      Option.match(known(target), {
        onNone: () => true,
        onSome: t =>
          Graph.addressesOverlap(w, t) ||
          links.some(
            link => Graph.addressesOverlap(w, link.row) && Graph.addressesOverlap(link.model, t),
          ),
      }),
  })

const meet = (a: Graph.WriterNode, b: Graph.WriterNode): boolean =>
  a.writes.some(w => b.writes.some(t => reaches(w, t) || reaches(t, w))) ||
  a.writes.some(w => (b.reads ?? []).some(t => reaches(w, t))) ||
  b.writes.some(w => (a.reads ?? []).some(t => reaches(w, t)))

describe('graph.overlaps', () => {
  it('agrees in either order, and with a direct reference, over seeded random writers', () => {
    const random = seeded(4_381)
    for (let round = 0; round < 300; round++) {
      const writers: Array<Graph.WriterNode> = []
      for (let i = 0; i < 6; i++) {
        writers.push({
          id: `W${Math.floor(random() * 1000)}-${i}`,
          kind: 'transition',
          writes: edgesFrom(random, 3),
          ...(random() < 0.6 ? { reads: edgesFrom(random, 2) } : {}),
        })
      }
      const g = Graph.build({ writers, readers: [], links })
      for (const a of writers) {
        for (const b of writers) {
          const forward = g.overlaps(a.id, b.id)
          expect(forward, `${a.id} / ${b.id}`).toEqual(g.overlaps(b.id, a.id))
          expect(forward.length > 0, `${a.id} / ${b.id}`).toBe(meet(a, b))
        }
      }
    }
  })

  it('finds the bridge between a row writer and a Model writer from both sides', () => {
    const g = Graph.build({
      writers: [
        { id: 'RowWriter', kind: 'write', writes: [Graph.knownEdge(Graph.rowPath('Note', []))] },
        {
          id: 'ModelWriter',
          kind: 'transition',
          writes: [Graph.knownEdge(Graph.modelPath(['remote', 'notes']))],
        },
      ],
      readers: [],
      links,
    })
    expect(g.overlaps('RowWriter', 'ModelWriter').map(reason => reason.kind)).toEqual(['bridged'])
    expect(g.overlaps('ModelWriter', 'RowWriter').map(reason => reason.kind)).toEqual(['bridged'])
  })
})

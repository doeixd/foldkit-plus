import { describe, test } from 'vitest'
import * as Graph from '../src/graph/structure.js'

for (const size of [100, 1_000, 10_000]) {
  describe(`${size} readers and ${size} writers`, () => {
    const paths = Array.from({ length: size }, (_, index) =>
      Graph.modelPath(['items', String(index)]),
    )
    const config = {
      readers: paths.map((path, index) => ({
        id: String(index),
        kind: 'binding' as const,
        reads: [Graph.knownEdge(path)],
      })),
      writers: paths.map((path, index) => ({
        id: String(index),
        kind: 'transition' as const,
        writes: [Graph.knownEdge(path)],
      })),
    }
    const graph = Graph.build(config)
    const path = paths[42]!

    test('construct graph', async ({ bench }) => {
      await bench('construct graph', () => Graph.build(config)).run()
    })

    test('warm lookup with one hit', async ({ bench }) => {
      await bench('warm lookup with one hit', () => {
        graph.readersOf(path)
        graph.writersOf(path)
        graph.affectedBy('42')
      }).run()
    })
  })
}

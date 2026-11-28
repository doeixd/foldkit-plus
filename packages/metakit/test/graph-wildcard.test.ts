import { describe, expect, it } from 'vitest'
import { Path } from '@doeixd/metakit'
import * as Graph from '@doeixd/metakit/graph'
import { minimizePaths, pathsOverlap } from '@doeixd/metakit/graph/match'

const model = (segments: ReadonlyArray<string>) => Graph.modelPath(segments)
const idOf = (segments: ReadonlyArray<string>) => segments.join('.')
const writer = (segments: ReadonlyArray<string>) => ({
  id: idOf(segments),
  kind: 'write' as const,
  writes: [Graph.knownEdge(model(segments))],
})
const reader = (segments: ReadonlyArray<string>) => ({
  id: idOf(segments),
  kind: 'projection' as const,
  reads: [Graph.knownEdge(model(segments))],
})

describe('a wildcard edge meets a concrete one in either direction', () => {
  it('a writer under todos.*.done invalidates a reader at todos.0.done', () => {
    const graph = Graph.build({
      writers: [writer(['todos', '*', 'done'])],
      readers: [reader(['todos', '0', 'done'])],
    })
    expect(graph.affectedBy('todos.*.done')).toEqual(['todos.0.done'])
    expect(graph.explain('todos.*.done', 'todos.0.done').map(reason => reason.kind)).toEqual([
      'direct',
    ])
  })

  it('a concrete writer invalidates a wildcard reader', () => {
    const graph = Graph.build({
      writers: [writer(['todos', '0', 'done'])],
      readers: [reader(['todos', '*', 'done'])],
    })
    expect(graph.affectedBy('todos.0.done')).toEqual(['todos.*.done'])
    expect(graph.readersOf(model(['todos', '0', 'done']))).toEqual(['todos.*.done'])
  })

  it('a wildcard query finds the concrete edges under it', () => {
    const graph = Graph.build({
      writers: [writer(['todos', '0', 'done']), writer(['todos', '1', 'done'])],
      readers: [reader(['todos', '0', 'done']), reader(['todos', '1', 'done'])],
    })
    expect(graph.writersOf(model(['todos', '*', 'done']))).toEqual(['todos.0.done', 'todos.1.done'])
    expect(graph.readersOf(model(['todos', '*', 'done']))).toEqual(['todos.0.done', 'todos.1.done'])
  })

  it('leaves an unrelated sibling out', () => {
    const graph = Graph.build({
      writers: [writer(['todos', '0', 'done'])],
      readers: [reader(['todos', '1', 'done']), reader(['notes', '*'])],
    })
    expect(graph.affectedBy('todos.0.done')).toEqual([])
  })
})

const alphabet = ['a', '0', '1', '*'] as const

const sequences = (max: number): ReadonlyArray<ReadonlyArray<string>> => {
  const out: Array<ReadonlyArray<string>> = []
  const walk = (prefix: ReadonlyArray<string>): void => {
    if (prefix.length > 0) out.push(prefix)
    if (prefix.length === max) return
    for (const segment of alphabet) walk([...prefix, segment])
  }
  walk([])
  return out
}

describe('indexed lookups agree with the reference overlap', () => {
  const all = sequences(3)
  const graph = Graph.build({
    writers: all.map(writer),
    readers: all.map(reader),
  })

  it('readersOf and writersOf match a scan in every direction', () => {
    for (const query of all) {
      const address = model(query)
      expect(graph.readersOf(address)).toEqual(
        all.filter(path => pathsOverlap(query, path)).map(idOf),
      )
      expect(graph.writersOf(address)).toEqual(
        all.filter(path => pathsOverlap(query, path)).map(idOf),
      )
    }
  })

  it('affectedBy matches a scan', () => {
    for (const written of all) {
      expect(graph.affectedBy(idOf(written))).toEqual(
        all.filter(path => pathsOverlap(written, path)).map(idOf),
      )
    }
  })
})

const universe = (() => {
  const names = ['a', 'b', 'c', '0', '1', '2', 'todos', 'title', 'done']
  const out: Array<ReadonlyArray<string>> = []
  const walk = (prefix: ReadonlyArray<string>): void => {
    if (prefix.length > 0) out.push(prefix)
    if (prefix.length === 3) return
    for (const name of names) walk([...prefix, name])
  }
  walk([])
  return out
})()

const coverage = (
  patterns: ReadonlyArray<ReadonlyArray<string>>,
): ReadonlyArray<ReadonlyArray<string>> =>
  universe.filter(path => patterns.some(pattern => Path.isPrefix(pattern, path)))

describe('minimizePaths keeps a wildcard another path needs', () => {
  it('does not drop todos.*.title behind todos.0', () => {
    const input = [
      ['todos', '0'],
      ['todos', '*', 'title'],
    ] as const
    expect(minimizePaths(input)).toEqual(input)
    expect(minimizePaths([...input].reverse())).toEqual([...input].reverse())
  })

  it('reduces todos.* plus todos.0.title to todos.*', () => {
    const expected = [['todos', '*']]
    expect(
      minimizePaths([
        ['todos', '*'],
        ['todos', '0', 'title'],
      ]),
    ).toEqual(expected)
    expect(
      minimizePaths([
        ['todos', '0', 'title'],
        ['todos', '*'],
      ]),
    ).toEqual(expected)
  })

  it('keeps two concrete paths each covering its own index', () => {
    const paths = [
      ['todos', '0', 'title'],
      ['todos', '1', 'title'],
    ]
    expect(minimizePaths(paths)).toEqual(paths)
  })

  it('covers the same concrete reads as the paths it reduces', () => {
    const cases: ReadonlyArray<ReadonlyArray<ReadonlyArray<string>>> = [
      [
        ['todos', '0'],
        ['todos', '*', 'title'],
      ],
      [
        ['todos', '*'],
        ['todos', '0', 'title'],
      ],
      [['a'], ['a', 'b', 'c'], ['*', 'b']],
      [
        ['todos', '*', 'title'],
        ['todos', '0', 'done'],
        ['todos', '1', 'title'],
      ],
    ]
    for (const paths of cases) {
      expect(coverage(minimizePaths(paths))).toEqual(coverage(paths))
    }
  })
})

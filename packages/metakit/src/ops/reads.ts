/**
 * What an expression reads (`readsOfNode`), from its nodes alone: a walker
 * that needs no partial evaluation, so a page that reads a transition's
 * footprint carries none.
 */
import { Option } from 'effect'
import * as Node from '../node.js'

/**
 * Collect the static read footprint of `node`: `Option.none()` means
 * unbounded (an opaque term with no declared reads).
 *
 * A `Rows` body's read of its element is a read of every element: under a
 * list at `todos`, `each.title` reads `todos.*.title`, and under related rows
 * `<relation>.*.title` below the row they point at. A body that reads nothing
 * of its element still reads which elements there are: the list itself.
 */
export const readsOfNode = (
  node: Node.Node,
): Option.Option<ReadonlyArray<ReadonlyArray<string>>> => {
  const seen = new Map<string, ReadonlyArray<string>>()
  let unbounded = false
  const add = (segments: ReadonlyArray<string>): void => {
    const k = JSON.stringify(segments)
    if (!seen.has(k)) seen.set(k, segments)
  }

  const visit = (current: Node.Node, read: (segments: ReadonlyArray<string>) => void): void => {
    if (unbounded) return
    Node.$match(current, {
      Lit: () => {},
      Path: ({ segments }) => read(segments),
      Call: ({ args }) => {
        for (const arg of args) visit(arg, read)
      },
      If: ({ cond, then, otherwise }) => {
        visit(cond, read)
        visit(then, read)
        visit(otherwise, read)
      },
      Match: ({ on, cases, otherwise }) => {
        visit(on, read)
        for (const [, branch] of cases) visit(branch, read)
        if (Option.isSome(otherwise)) visit(otherwise.value, read)
      },
      Opaque: ({ reads }) => {
        if (Option.isNone(reads)) {
          unbounded = true
          return
        }
        for (const segments of reads.value) read(segments)
      },
      Rows: rows => {
        const source: Array<ReadonlyArray<string>> = []
        visit(Node.rowsSource(rows.over), segments => source.push(segments))
        const body: Array<ReadonlyArray<string>> = []
        for (const each of Node.rowsBody(rows)) visit(each, segments => body.push(segments))
        for (const segments of readsOfRows(rows.over, source, body, Node.rowsEach(rows))) {
          read(segments)
        }
      },
    })
  }

  visit(node, add)
  return unbounded ? Option.none() : Option.some(Array.from(seen.values()))
}

/**
 * What a `Rows` node reads, from what its source and its body read: a body's
 * read of its element is a read of every element, under each place the
 * elements are (the list's own reads, or the slot under the row they point
 * at); a body that reads nothing of its element still reads those places.
 */
export const readsOfRows = (
  over: Node.RowsOver,
  source: ReadonlyArray<ReadonlyArray<string>>,
  body: ReadonlyArray<ReadonlyArray<string>>,
  each: string = Node.EACH,
): ReadonlyArray<ReadonlyArray<string>> => {
  const bases = source.map(segments =>
    Node.RowsOver.$match(over, {
      List: () => segments,
      Related: ({ relation }) => [...segments, Node.relatedSegment(relation)],
    }),
  )
  const isOwn = (segments: ReadonlyArray<string>): boolean => Node.readsEach(segments, each)
  return [
    ...body.flatMap(segments =>
      isOwn(segments) ? bases.map(base => [...base, '*', ...segments.slice(1)]) : [segments],
    ),
    ...(body.some(isOwn) ? [] : bases),
  ]
}

/**
 * Review of #610: a wildcard edge must meet a concrete one in the index, and
 * path minimization must not drop a wildcard another path needs (#615, #616).
 * `pnpm mutate packages/metakit/test/graph-review-610.mutations.ts`.
 */
const tests = ['packages/metakit/test/graph-wildcard.test.ts']

export default [
  {
    name: 'minimizePaths treats a concrete segment as covering a wildcard one',
    edits: [
      {
        file: '../src/graph/match.ts',
        find: `  return unique.filter(
    (candidate, i) => !unique.some((other, j) => i !== j && covers(other, candidate)),
  )`,
        replace: `  return unique.filter(
    (candidate, i) =>
      !unique.some(
        (other, j) => i !== j && other.length < candidate.length && Path.isPrefix(other, candidate),
      ),
  )`,
      },
    ],
    tests,
  },
  {
    name: 'the trie descends exact segments only',
    edits: [
      {
        file: '../src/graph/structure.ts',
        find: `  const visit = (node: TrieNode<T>, depth: number): void => {
    if (depth === segments.length) {
      collectSubtree(node, out)
      return
    }
    // A path ending here is an ancestor of the query, so it overlaps.
    for (const value of node.values) out.add(value)
    const segment = segments[depth]!
    if (segment === '*') {
      for (const child of node.children.values()) visit(child, depth + 1)
      return
    }
    const exact = node.children.get(segment)
    if (exact !== undefined) visit(exact, depth + 1)
    const wildcard = node.children.get('*')
    if (wildcard !== undefined && wildcard !== exact) visit(wildcard, depth + 1)
  }
  visit(root, 0)`,
        replace: `  let node: TrieNode<T> | undefined = root
  for (const value of node.values) out.add(value)
  for (let i = 0; i < segments.length; i++) {
    node = node.children.get(segments[i]!)
    if (node === undefined) return
    if (i < segments.length - 1) {
      for (const value of node.values) out.add(value)
    } else {
      collectSubtree(node, out)
    }
  }`,
      },
    ],
    tests,
  },
]

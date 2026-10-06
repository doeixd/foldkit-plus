/**
 * A page's families, broken in turn:
 * `pnpm mutate packages/composition/test/families.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/composition/test/families.test.ts']
const file = '../src/surface/index.ts'

export default [
  {
    name: 'a family reads every Block’s nodes',
    edits: [
      {
        file,
        find: '            if (node === undefined || node.block !== block.name) continue',
        replace: '            if (node === undefined) continue',
      },
    ],
    tests,
  },
  {
    name: 'nodes whose props do not decode are kept',
    edits: [
      {
        file,
        find: "            if (props._tag === 'Failure') continue",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'instances are keyed alike',
    edits: [
      {
        file,
        find: '            found.push({ key: id, params: read.params(props.success) })',
        replace: "            found.push({ key: 'x', params: read.params(props.success) })",
      },
    ],
    tests,
  },
  {
    name: 'a foreign Surface is not refused',
    edits: [
      {
        file,
        find: '    const foreign = defined.find(({ read }) => read.surface.owner !== config.from.owner)\n    if (foreign !== undefined)\n      throw new Error(\n        `SurfaceBlock.families: "${foreign.read.surface.name}" belongs to another application than "${config.from.name}"`,\n      )',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a missing document is indexed',
    edits: [
      {
        file,
        find: '          if (document === undefined) return []',
        replace: '',
      },
    ],
    tests,
  },
]

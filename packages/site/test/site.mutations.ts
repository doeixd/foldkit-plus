/**
 * The Site first cut, broken in turn:
 * `pnpm mutate packages/site/test/site.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/site/test/site.test.ts']
const file = '../src/index.ts'

export default [
  {
    name: 'targets lose their route value',
    edits: [
      {
        file,
        find: '    route: node.case(params),',
        replace: '    route: node.case({} as never),',
      },
    ],
    tests,
  },
  {
    name: 'a move within a node always pushes',
    edits: [
      {
        file,
        find: "    const rule = next.node.history ?? 'replace'",
        replace: "    const rule = next.node.history ?? 'push'",
      },
    ],
    tests,
  },
  {
    name: 'a move to another node replaces',
    edits: [
      {
        file,
        find: "    if (prev.node !== next.node) return 'push'",
        replace: "    if (prev.node !== next.node) return 'replace'",
      },
    ],
    tests,
  },
  {
    name: 'a foreign surface is not refused',
    edits: [
      {
        file,
        find: '      if (bound.surface.owner !== owner)\n        throw new Error(\n          `Site.sources: "${bound.surface.name}" belongs to another application than the site`,\n        )',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a chain drops its ancestors',
    edits: [
      {
        file,
        find: '    const chain: Array<SiteNode<any>> = [node]',
        replace: '    const chain: Array<SiteNode<any>> = []',
      },
    ],
    tests,
  },
]

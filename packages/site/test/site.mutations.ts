/**
 * The Site first cut, broken in turn:
 * `pnpm mutate packages/site/test/site.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/site/test/site.test.ts', 'packages/site/test/routing.test.ts']
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
        find: "    if (prev === undefined || prev.node !== next.node) return 'push'",
        replace: "    if (prev === undefined || prev.node !== next.node) return 'replace'",
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
  {
    name: 'an echo of the shown address resets the route',
    edits: [
      {
        file,
        find: '      return sameRoute(current, next) ? model : config.route.set(model, next)',
        replace: '      return config.route.set(model, next)',
      },
    ],
    tests,
  },
  {
    name: 'every click pushes',
    edits: [
      {
        file,
        find: "                const intent =\n                  node === undefined\n                    ? ('push' as const)\n                    : Site.historyOf(currentTarget(model), {\n                        node,\n                        route: next,\n                        url: Url.toString(url),\n                      })",
        replace:
          "                void node\n                void next\n                const intent = 'push' as const",
      },
    ],
    tests,
  },
  {
    name: 'a completion that names no message is accepted',
    edits: [
      {
        file,
        find: "    const completedTag = tagOfConstructor(\n      config.completed,\n      'Site.routing: completed must be a message constructor',\n    )",
        replace: "    const completedTag = 'CompletedNavigation'",
      },
    ],
    tests,
  },
]

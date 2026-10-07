/**
 * The Site first cut, broken in turn:
 * `pnpm mutate packages/site/test/site.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = [
  'packages/site/test/site.test.ts',
  'packages/site/test/routing.test.ts',
  'packages/site/test/placement.test.ts',
  'packages/site/test/prefetch.test.ts',
  'packages/site/test/ssr.test.ts',
]
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
        find: '  if (bound.surface.owner !== owner)\n    throw new Error(`Site: "${bound.surface.name}" belongs to another application than the site`)',
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
  {
    name: 'a page is informed of every route',
    edits: [
      {
        file,
        find: '        if (!Predicate.isTagged(route, node.tag) || changed === undefined)',
        replace: '        if (changed === undefined)',
      },
    ],
    tests,
  },
  {
    name: 'an arrival that needs no answer is still sent',
    edits: [
      {
        file,
        find: '        const child = changed(route as Route)\n        if (child === undefined) return Option.none()',
        replace: '        const child = changed(route as Route)',
      },
    ],
    tests,
  },
  {
    name: 'a route change informs no page',
    edits: [
      {
        file,
        find: '            ...(config.pages ?? []).map(\n              page => (model: Root) =>\n                Option.getOrElse(page.inform(model, next), () => ({ model })),\n            ),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'route-level Sources hold every node',
    edits: [
      {
        file,
        find: '    for (const node of Site.chainOf(site, route)) {',
        replace: '    for (const node of Site.nodesOf(site)) {',
      },
    ],
    tests,
  },
  {
    name: 'a built title is lost',
    edits: [
      {
        file,
        find: '      title: title => at(Object.freeze({ ...built, title })),',
        replace: '      title: _title => at(built),',
      },
    ],
    tests,
  },
  {
    name: 'a built Surface is lost',
    edits: [
      {
        file,
        find: '      surface: config => at(Object.freeze({ ...built, bound: config as BoundSurface })),',
        replace: '      surface: _config => at(built),',
      },
    ],
    tests,
  },
  {
    name: 'a piped bundle is not applied',
    edits: [
      {
        file,
        find: '      pipe: <A>(fn: (builder: NodeBuilder<Route>) => A): A => fn(at(built)),',
        replace: '      pipe: <A>(fn: (builder: NodeBuilder<Route>) => A): A => at(built) as A,',
      },
    ],
    tests,
  },
  {
    name: 'a bare node is only non-extensible, not frozen',
    edits: [
      {
        file,
        find: '  Object.freeze({\n    tag: tagOfConstructor(routeCase,',
        replace: '  Object.preventExtensions({\n    tag: tagOfConstructor(routeCase,',
      },
    ],
    tests,
  },
  {
    name: 'a section lands on whatever comes first',
    edits: [
      {
        file,
        find: '      if (candidate.section !== section) continue',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a section without a landing lands anyway',
    edits: [
      {
        file,
        find: '      if (landing === undefined) continue',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'layouts never apply',
    edits: [
      {
        file,
        find: '      if (layout !== undefined) child = layout.render(child, model, h)',
        replace: '      void layout',
      },
    ],
    tests: ['packages/site/test/view.test.ts'],
  },
  {
    name: 'layouts wrap leaf-first',
    edits: [
      {
        file,
        find: '    for (let at = chain.length - 2; at >= 0; at--) {',
        replace: '    for (let at = 0; at < chain.length - 1; at++) {',
      },
    ],
    tests: ['packages/site/test/view.test.ts'],
  },
  {
    name: 'a viewless leaf draws nothing',
    edits: [
      {
        file,
        find: '    if (leaf.view === undefined)\n      throw new Error(`Site.view: "${leaf.tag}" draws nothing; give the leaf a view`)',
        replace: '',
      },
    ],
    tests: ['packages/site/test/view.test.ts'],
  },
]

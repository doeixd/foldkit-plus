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
        find: 'const history = Site.historyOf(currentTarget(model), {',
        replace: "const history = 'push' as const; void ({",
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
        find: '    for (const node of Site.chainOf(site, route)) {\n      const entry = sourceOf(node, owner, place)',
        replace:
          '    for (const node of Site.nodesOf(site)) {\n      const entry = sourceOf(node, owner, place)',
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
  {
    name: 'an ancestor’s meta overrides its descendant’s',
    edits: [
      {
        file,
        find: 'meta = { ...meta, ...saidOf(node.meta({ route, model })) }',
        replace: 'meta = { ...saidOf(node.meta({ route, model })), ...meta }',
      },
    ],
    tests,
  },
  {
    name: 'a field left undefined erases the ancestor’s',
    edits: [
      {
        file,
        find: '...saidOf(node.meta({ route, model }))',
        replace: '...node.meta({ route, model })',
      },
    ],
    tests,
  },
  {
    name: 'the preview title ignores the route’s title',
    edits: [
      {
        file,
        find: 'const title = meta.title ?? Site.titleOf(site, route)',
        replace: 'const title = meta.title',
      },
    ],
    tests,
  },
  {
    name: 'a route’s own meta overrides the preview title it names',
    edits: [
      {
        file,
        find: 'const title = meta.title ?? Site.titleOf(site, route)',
        replace: 'const title = Site.titleOf(site, route) ?? meta.title',
      },
    ],
    tests,
  },
  {
    name: 'an unindexed route says nothing of it',
    edits: [
      { file, find: "...(Site.indexedOf(site, route) ? {} : { robots: 'noindex' }),", replace: '' },
    ],
    tests,
  },
  {
    name: 'a meta reindexes an unindexed route',
    edits: [
      {
        file,
        find: "...(Site.indexedOf(site, route) ? {} : { robots: 'noindex' }),",
        replace:
          "...(Site.indexedOf(site, route) || meta.robots !== undefined ? {} : { robots: 'noindex' }),",
      },
    ],
    tests,
  },
  {
    name: 'the farthest declaration of indexed wins',
    edits: [
      {
        file,
        find: '    for (let at = chain.length - 1; at >= 0; at--) {\n      const indexed',
        replace: '    for (let at = 0; at < chain.length; at++) {\n      const indexed',
      },
    ],
    tests,
  },
  {
    name: 'an undeclared route is unindexed',
    edits: [
      {
        file,
        find: '      if (indexed !== undefined) return indexed\n    }\n    return true',
        replace: '      if (indexed !== undefined) return indexed\n    }\n    return false',
      },
    ],
    tests,
  },
  {
    name: 'route options drop meta and indexed',
    edits: [
      {
        file,
        find: '    if (options?.meta !== undefined) built = built.meta(options.meta)\n',
        replace: '',
      },
      {
        file,
        find: '    if (options?.indexed !== undefined) built = built.indexed(options.indexed)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a link the tree does not hold navigates in place',
    edits: [
      {
        file,
        find: 'onNone: () => ({ model, commands: [Load({ href: Url.toString(url) })] }),',
        replace:
          "onNone: () => ({ model, commands: [Navigate({ url: Url.toString(url), history: 'push' })] }),",
      },
    ],
    tests,
  },
  {
    name: 'a shortcut with no landing is taken',
    edits: [
      {
        file,
        find: '      if (node.landing === undefined)\n        throw new Error(`Site.shortcuts:',
        replace: '      if (false)\n        throw new Error(`Site.shortcuts:',
      },
    ],
    tests,
  },
  {
    name: 'a shortcut used twice is taken',
    edits: [{ file, find: '      if (other !== undefined)\n', replace: '      if (false)\n' }],
    tests,
  },
  {
    name: 'one press is bound as a sequence',
    edits: [
      {
        file,
        find: "typeof keys === 'string' ? { keys, mapEvent } :",
        replace: "typeof keys === 'string' ? { keys: [keys, keys], mapEvent } :",
      },
    ],
    tests,
  },
  {
    name: 'a binding sends where the first shortcut goes',
    edits: [
      {
        file,
        find: '      const message = toMessage(Site.target(node, node.landing))\n',
        replace:
          '      const first = Site.nodesOf(site)[0]!\n      const message = toMessage(Site.target(first, first.landing))\n',
      },
    ],
    tests,
  },
  {
    name: 'a new route arrives nowhere',
    edits: [
      {
        file,
        find: '            ...(arrived === undefined ? [] : [(model: Root) => arrived(model, next)]),',
        replace: '',
      },
    ],
    tests,
  },
]

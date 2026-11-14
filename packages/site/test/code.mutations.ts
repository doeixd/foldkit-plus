/**
 * Route code from the Site tree (#438), broken in turn: `pnpm mutate
 * packages/site/test/code.mutations.ts` checks that a test fails for each.
 */
const index = '../src/index.ts'
const lazy = '../../bundle/src/lazy.ts'
const tests = ['packages/site/test/code.test.ts']
const arrival = ['packages/site/test/codeArrival.test.ts']

export default [
  {
    name: "codeFor reads the route's whole chain, not its node alone",
    edits: [
      {
        file: index,
        find: 'Site.chainOf(site, route).flatMap(node =>',
        replace: '[Site.nodeOf(site, route)].flatMap(node =>',
      },
    ],
    tests,
  },
  {
    name: 'a lazy page is its code',
    edits: [
      {
        file: index,
        find: 'const code = isLoadable(bundle) ? Option.some(bundle) : Option.none()',
        replace: 'const code = Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'a lazy page without changed is refused',
    edits: [
      {
        file: index,
        find: 'if (Option.isSome(code) && changed === undefined)',
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'an intent fetches the code of the route it points at',
    edits: [
      {
        file: index,
        find: '...(unloadedAt(next).length === 0 ? [] : [LoadCode({ tag: next._tag })]),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a loaded chunk is asked for nothing more',
    edits: [
      {
        file: index,
        find: 'Site.codeFor(config.site, pages, route).filter(code => !code.isLoaded())',
        replace: 'Site.codeFor(config.site, pages, route)',
      },
    ],
    tests,
  },
  {
    name: 'a chunk that fails to load is no defect',
    edits: [{ file: index, find: 'Promise.allSettled(', replace: 'Promise.all(' }],
    tests,
  },
  {
    name: "a placed page's arrival is drawn though the Model is the same",
    edits: [{ file: lazy, find: 'return { ...step, model: copy }', replace: 'return step' }],
    tests: arrival,
  },
]

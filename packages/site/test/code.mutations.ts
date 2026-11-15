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
        find: 'Site.chainOf(config.site, route).flatMap(node =>',
        replace: '[Site.nodeOf(config.site, route)].flatMap(node =>',
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
    name: 'a preload with a lazy page and no fetchCode is refused',
    edits: [
      {
        file: index,
        find: '      fetch === undefined &&\n',
        replace: '      false &&\n',
      },
    ],
    tests,
  },
  {
    name: 'only a lazy page makes the routing ask for fetchCode',
    edits: [
      {
        file: index,
        find: 'pages.some(page => Option.isSome(page.code))',
        replace: 'true',
      },
    ],
    tests: ['packages/site/test/intent.test.ts'],
  },
  {
    name: 'an intent fetches the code of the route it points at',
    edits: [
      {
        file: index,
        find: '...(fetch === undefined || unloaded.length === 0 ? [] : [fetch(unloaded)]),',
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
        find: 'codeFor(next).filter(code => !code.isLoaded())',
        replace: 'codeFor(next)',
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
    name: "boot tells the Model's route to its pages",
    edits: [
      {
        file: index,
        find: 'boot: model => Update.combine(model, informed(config.route.get(model))),',
        replace: 'boot: model => ({ model }),',
      },
    ],
    tests: [...tests, ...arrival],
  },
  {
    name: "a placed page's arrival is drawn though the Model is the same",
    edits: [{ file: lazy, find: 'return { ...step, model: copy }', replace: 'return step' }],
    tests: arrival,
  },
]

/**
 * `Site.routing`'s `navigated`, broken in turn:
 * `pnpm mutate packages/site/test/navigated.mutations.ts`
 */
const tests = ['packages/site/test/navigated.test.ts']
const file = '../src/index.ts'

export default [
  {
    name: 'nothing is told',
    edits: [
      {
        file,
        find: '[(model: Root) => ({ model: navigated(model, navigationKind()) })]',
        replace: '[]',
      },
    ],
    tests,
  },
  {
    name: 'the kind is told after the route is set',
    edits: [
      {
        file,
        find: '            ...(navigated === undefined\n              ? []\n              : [(model: Root) => ({ model: navigated(model, navigationKind()) })]),\n            model => ({ model: setRoute(model, next) }),',
        replace:
          '            model => ({ model: setRoute(model, next) }),\n            ...(navigated === undefined\n              ? []\n              : [(model: Root) => ({ model: navigated(model, navigationKind()) })]),',
      },
    ],
    tests,
  },
  {
    name: 'every change reads as history',
    edits: [
      { file, find: "window.event?.type === 'popstate' ? 'history'", replace: "true ? 'history'" },
    ],
    tests,
  },
  {
    name: 'every change reads as a push',
    edits: [
      { file, find: "window.event?.type === 'popstate' ? 'history'", replace: "false ? 'history'" },
    ],
    tests,
  },
]

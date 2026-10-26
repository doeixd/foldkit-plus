/**
 * A picker's "more", broken in turn from the view to the list:
 * `pnpm mutate packages/crud/test/more.mutations.ts`.
 */
const screen = '../src/screen.ts'
const crud = '../src/index.ts'
const view = '../../mixins-form/src/index.ts'
const screenTests = ['packages/crud/test/screen.test.ts']
const listTests = ['packages/crud/test/list.test.ts']
const viewTests = ['packages/mixins-form/test/runtime.test.ts']
const page = ['examples/entity/test/page.test.ts']

export default [
  {
    name: 'the screen hands an ask to the form alone',
    edits: [
      {
        file: screen,
        find: 'onSome: ({ key }) => pickers.ask(root, key)',
        replace: 'onSome: () => root',
      },
    ],
    tests: [...screenTests, ...page],
  },
  {
    name: 'the screen asks on every Message of the form',
    edits: [
      {
        file: screen,
        find: '            isAskedForMore,\n',
        replace: '            (_: unknown): _ is { readonly key: string } => true,\n',
      },
    ],
    tests: screenTests,
  },
  {
    name: 'a list never has more',
    edits: [{ file: crud, find: '&& read.value.hasNext', replace: '&& false' }],
    tests: [...listTests, ...page],
  },
  {
    name: 'an ask shows nothing more',
    edits: [
      { file: crud, find: 'list => list.more(root)),', replace: '() => Option.none<Root>()),' },
    ],
    tests: listTests,
  },
  {
    name: 'no picker draws its more',
    edits: [{ file: view, find: "path === '' && more[key] === true", replace: 'false' }],
    tests: [...viewTests, ...page],
  },
  {
    name: 'every picker draws its more',
    edits: [{ file: view, find: "path === '' && more[key] === true", replace: "path === ''" }],
    tests: viewTests,
  },
]

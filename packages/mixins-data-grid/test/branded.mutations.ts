/**
 * The funnel and the column menu button as Foldkit's view-identity brand sees
 * them: `pnpm mutate packages/mixins-data-grid/test/branded.mutations.ts`
 * checks that `branded.test.ts` fails when a button is returned by a different
 * arrow open than shut, which replaces it and drops its focus.
 */
const view = '../src/view.ts'
const tests = ['packages/mixins-data-grid/test/branded.test.ts']

export default [
  {
    name: 'the funnel is returned by one arrow shut and another open',
    edits: [
      {
        file: view,
        find: '              return [\n                button,\n                ...Option.match(open, {\n                  onNone: () => [],\n                  onSome: ({ form, sent, generation }) => {',
        replace:
          '              return [\n                ...Option.match(open, {\n                  onNone: () => [button],\n                  onSome: ({ form, sent, generation }) => {',
      },
      {
        file: view,
        find: '                    return [\n                      filterForm<Message>({',
        replace:
          '                    return [\n                      button,\n                      filterForm<Message>({',
      },
    ],
    tests,
  },
  {
    name: 'the menu button is returned by one arrow shut and another open',
    edits: [
      {
        file: view,
        find: '          return [\n            button,\n            ...Option.match(open, {\n              onNone: () => [],\n              onSome: ({ active }) => {',
        replace:
          '          return [\n            ...Option.match(open, {\n              onNone: () => [button],\n              onSome: ({ active }) => {',
      },
      {
        file: view,
        find: '                return [\n                  h.div(\n                    slots.menu.attrs([',
        replace:
          '                return [\n                  button,\n                  h.div(\n                    slots.menu.attrs([',
      },
    ],
    tests,
  },
]

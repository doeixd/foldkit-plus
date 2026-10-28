/**
 * An update's rules over the row it leaves, through a writer and through Sync's
 * admit, broken in turn:
 * `pnpm mutate packages/guard/test/after.mutations.ts`.
 */
const tests = ['packages/guard/test/after.test.ts']
const file = '../src/server.ts'
const sync = '../src/sync.ts'
const held = 'yield* require([rules.row, ...rules.members, ...pointing], after, principal)'

export default [
  {
    name: 'a member’s rule is held over the row before alone',
    edits: [
      { file, find: held, replace: 'yield* require([rules.row, ...pointing], after, principal)' },
    ],
    tests,
  },
  {
    name: 'a link’s rule is held over the row before alone',
    edits: [
      {
        file,
        find: held,
        replace: 'yield* require([rules.row, ...rules.members], after, principal)',
      },
    ],
    tests,
  },
  {
    name: 'an unlink’s rule is held over the row after',
    edits: [
      {
        file,
        find: 'rules.relating.map(rule => ({ ...rule, unlink: Option.none() })),',
        replace: 'rules.relating,',
      },
    ],
    tests,
  },
  {
    name: 'Sync holds a member’s rule over the row before alone',
    edits: [
      {
        file: sync,
        find: 'const moved = first(rules, holdsOver({ ...current.value, ...edits }))',
        replace: 'const moved = first([row], holdsOver({ ...current.value, ...edits }))',
      },
    ],
    tests: ['packages/guard/test/sync.test.ts'],
  },
]

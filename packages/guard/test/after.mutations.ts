/**
 * An update's member and link rules over the row it leaves with that one
 * change undone, through a writer and through Sync's admit, broken in turn:
 * `pnpm mutate packages/guard/test/after.mutations.ts`.
 */
const tests = ['packages/guard/test/after.test.ts']
const syncTests = ['packages/guard/test/sync.test.ts']
const file = '../src/server.ts'
const sync = '../src/sync.ts'
const undone = '({ rule, key }) => require([rule], { ...after, [key]: before[key] }, principal),'

export default [
  {
    name: 'a member’s and a link’s rules are held over the row before alone',
    edits: [{ file, find: undone, replace: '() => Effect.void,' }],
    tests,
  },
  {
    name: 'a member’s and a link’s rules are held over the whole row after',
    edits: [{ file, find: undone, replace: '({ rule }) => require([rule], after, principal),' }],
    tests,
  },
  {
    name: 'a link’s rule is held over the row before alone',
    edits: [
      {
        file,
        find: '...rules.relating.flatMap(rule =>',
        replace: '...rules.relating.slice(0, 0).flatMap(rule =>',
      },
    ],
    tests,
  },
  {
    name: 'an unlink’s rule is held over the row after',
    edits: [
      {
        file,
        find: 'linking([{ ...rule, unlink: Option.none() }], was)',
        replace: 'linking([rule], was)',
      },
    ],
    tests,
  },
  {
    name: 'Sync holds a member’s rule over the row before alone',
    edits: [
      { file: sync, find: 'for (const rule of changed) {', replace: 'for (const rule of []) {' },
    ],
    tests: syncTests,
  },
  {
    name: 'Sync holds a member’s rule over the whole row after',
    edits: [
      {
        file: sync,
        find: 'holdsOver({ ...after, [rule.member]: current.value[rule.member] }),',
        replace: 'holdsOver(after),',
      },
    ],
    tests: syncTests,
  },
]

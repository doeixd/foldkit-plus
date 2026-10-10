/**
 * `foldkit-sync/remote`, broken in turn:
 * `pnpm mutate packages/sync/test/remote.mutations.ts`.
 */
const tests = ['packages/sync/test/remote.test.ts']
const file = '../src/remote.ts'
const remote = '../../remote/src/model.ts'

export default [
  {
    name: 'an edit is shown over a row that has it',
    edits: [
      {
        file,
        find: 'for (const edit of slice) if (!reached(remote, edit)) wanted.set(keyOf(edit), edit)',
        replace: 'for (const edit of slice) wanted.set(keyOf(edit), edit)',
      },
    ],
    tests,
  },
  {
    name: 'a matching overlay is shown again',
    edits: [{ file, find: 'if (!shown.held && wanted.has(shown.key)) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'an absorbed edit is never held',
    edits: [{ file, find: 'const holds =', replace: 'const holds = false &&' }],
    tests,
  },
  {
    name: 'a cell edited again holds its old edit too',
    edits: [{ file, find: '!edited.has(cellOf(shown.edit)) &&', replace: '' }],
    tests,
  },
  {
    name: 'a pending edit is held',
    edits: [{ file, find: 'Option.isSome(shown.edit.at) &&', replace: '' }],
    tests,
  },
  {
    name: 'an edit is held for a row that is not cached',
    edits: [{ file, find: 'Option.isSome(revisionOf(remote, shown.edit)) &&', replace: '' }],
    tests,
  },
  {
    name: 'a held edit is held again each time',
    edits: [{ file, find: 'if (holds && shown.held) continue', replace: '' }],
    tests,
  },
  {
    name: 'a held edit outlives the read that reaches it',
    edits: [
      { file, find: '          !reached(remote, shown.edit)\n', replace: '          true\n' },
    ],
    tests,
  },
  {
    name: 'another replica’s edit is said replaced',
    edits: [{ file, find: 'edits.mine(shown.edit, replica) &&', replace: '' }],
    tests,
  },
  {
    name: 'an edit the row holds is said replaced',
    edits: [{ file, find: '!Equal.equals(', replace: 'true || !Equal.equals(' }],
    tests,
  },
  {
    name: 'another Entity’s overlays are read as this one’s',
    edits: [
      { file, find: 'const SHOWN = `sync-edit:${entity}:`', replace: 'const SHOWN = `sync-edit:`' },
    ],
    tests,
  },
  {
    name: 'clear lifts nothing',
    edits: [
      {
        file,
        find: 'shownIn(model).reduce((next, shown) => data.lift(next, shown.id), model)',
        replace: 'model',
      },
    ],
    tests,
  },
  {
    name: 'overlays name the layers by their internal ids',
    edits: [
      {
        file: remote,
        find: 'id.startsWith(OVERLAY) ? [id.slice(OVERLAY.length)] : []',
        replace: '[id]',
      },
    ],
    tests,
  },
]

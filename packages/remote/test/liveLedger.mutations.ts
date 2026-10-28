/**
 * The bounded live ledger and placements retention drops, broken in turn:
 * `pnpm mutate packages/remote/test/liveLedger.mutations.ts`.
 */
const tests = [
  'packages/remote/test/liveLedger.test.ts',
  'packages/remote/test/verifyPlacement.test.ts',
]
const file = '../src/model.ts'

export default [
  {
    name: 'the stream ledger keeps every stream',
    edits: [
      {
        file,
        find: '  for (const key of keys.slice(0, Math.max(0, keys.length - STREAM_WINDOW))) delete next[key]\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a stream heard from again keeps its old place',
    edits: [
      {
        file,
        find: '  const { [stream]: _previous, ...rest } = record\n  const next: Record<string, V> = { ...rest, [stream]: value }',
        replace: '  const next: Record<string, V> = { ...record, [stream]: value }',
      },
    ],
    tests,
  },
  {
    name: 'live cursors are not bounded',
    edits: [
      {
        file,
        find: 'live[stream] === state ? live : heard(live, stream, state)',
        replace: 'live[stream] === state ? live : { ...live, [stream]: state }',
      },
    ],
    tests,
  },
  {
    name: 'a gap outlives its stream’s health',
    edits: [
      {
        file,
        find: 'new Set([...model.gaps, stream].filter(key => Object.hasOwn(streams, key)))',
        replace: 'new Set([...model.gaps, stream])',
      },
    ],
    tests,
  },
  {
    name: 'retention keeps the placement of a list it dropped',
    edits: [
      {
        file,
        find: '        placed: keptPlacements(model.placed, retained.connections),\n',
        replace: '',
      },
    ],
    tests,
  },
]

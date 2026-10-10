/**
 * A broken live stream's recovery, broken in turn:
 * `pnpm mutate packages/remote/test/liveRecovery.mutations.ts`.
 */
const tests = ['packages/remote/test/liveRecovery.test.ts']
const model = '../src/model.ts'
const index = '../src/index.ts'

export default [
  {
    name: 'every event of a dying stream restarts it again',
    edits: [{ file: model, find: 'if (model.gaps.has(stream)) return model', replace: '' }],
    tests,
  },
  {
    name: 'a broken stream’s last events reset its backoff',
    edits: [
      {
        file: model,
        find: 'health.failures === 0 || model.gaps.has(stream)',
        replace: 'health.failures === 0',
      },
    ],
    tests,
  },
  {
    name: 'an applied row event leaves the backoff where it was',
    edits: [
      {
        file: model,
        find: "return applied.outcome === 'applied' ? healthy(next, message.stream) : next",
        replace: 'return next',
      },
    ],
    tests,
  },
  {
    name: 'an applied list event leaves the backoff where it was',
    edits: [
      {
        file: model,
        find: "const next = applied.outcome === 'applied' ? healthy(written, message.stream) : written",
        replace: 'const next = written',
      },
    ],
    tests,
  },
  {
    name: 'a failure is recorded without its error',
    edits: [
      {
        file: model,
        find: 'return broke(model, message.stream, Option.some(message.error))',
        replace: 'return broke(model, message.stream, Option.none())',
      },
    ],
    tests,
  },
  {
    name: 'a new principal inherits the old one’s stream health',
    edits: [
      {
        file: model,
        find: 'refresh: { generation, requested: new Map(), started: new Map(), floor: generation },',
        replace:
          'streams: model.streams, gaps: model.gaps, refresh: { generation, requested: new Map(), started: new Map(), floor: generation },',
      },
    ],
    tests,
  },
  {
    name: 'a break does not restart the entry',
    edits: [
      {
        file: index,
        find: '    restarts: Schema.Number,\n',
        replace: '    restarts: resumeCursor,\n',
      },
    ],
    tests,
  },
  {
    name: 'an applied event restarts the entry',
    edits: [
      {
        file: index,
        find: '    failures: resumeCursor,\n',
        replace: '    failures: Schema.Number,\n',
      },
    ],
    tests,
  },
  {
    name: 'a restart refetches nothing',
    edits: [
      {
        file: index,
        find: "      toMessage({ _tag: 'RefreshStarted', requests: requirements }),\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a restart leaves the gap open',
    edits: [
      { file: index, find: "      toMessage({ _tag: 'GapCleared', stream }),\n", replace: '' },
    ],
    tests,
  },
  {
    name: 'the backoff does not grow',
    edits: [
      {
        file: index,
        find: 'base * 2 ** Math.min(Math.max(failures, 1) - 1, 30)',
        replace: 'base',
      },
    ],
    tests,
  },
  {
    name: 'the backoff has no ceiling',
    edits: [
      { file: index, find: 'Math.min(max, base * 2 **', replace: 'Math.min(Infinity, base * 2 **' },
    ],
    tests,
  },
  {
    name: 'a restart does not wait',
    edits: [
      {
        file: index,
        find: 'Stream.fromEffect(Effect.sleep(restartDelay(options, failures)))',
        replace: 'Stream.fromEffect(Effect.void)',
      },
    ],
    tests,
  },
  {
    name: 'the resubscribe runs beside the gap closing',
    edits: [{ file: index, find: 'Stream.concat(live),', replace: 'Stream.merge(live),' }],
    tests,
  },
  {
    name: 'a broken stream reads as Live',
    edits: [
      {
        file: index,
        find: 'health === undefined || !remote.gaps.has(stream)',
        replace: 'true',
      },
    ],
    tests,
  },
]

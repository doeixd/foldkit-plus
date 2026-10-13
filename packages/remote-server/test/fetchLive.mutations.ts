/**
 * Live over fetch, each guard broken in turn: `pnpm mutate
 * packages/remote-server/test/fetchLive.mutations.ts` checks that a test fails
 * for every one.
 */
const tests = ['packages/remote-server/test/fetchLive.test.ts']
const file = '../src/fetch.ts'

export default [
  {
    name: 'a live stream is never asked who it serves again',
    edits: [
      {
        file,
        find: 'if (revalidate === undefined) return Stream.empty',
        replace: 'return Stream.empty',
      },
    ],
    tests,
  },
  {
    name: 'a live stream serves a changed principal on',
    edits: [
      {
        file,
        find: 'revalidate.same === undefined || revalidate.same(opened, now)',
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'a live open is answered as a request',
    edits: [
      {
        file,
        find: '      if (isLiveOpen(body.value))\n        return yield* liveResponse(',
        replace: '      if (false)\n        return yield* liveResponse(',
      },
    ],
    tests,
  },
  {
    name: 'an idle stream never pings',
    edits: [
      {
        file,
        find: `      const beats = Stream.concat(
        Stream.succeed(': ping\\n\\n'),
        Stream.fromSchedule(Schedule.spaced(heartbeat)).pipe(Stream.map(() => ': ping\\n\\n')),
      ).pipe(Stream.interruptWhen(Deferred.await(ended)))`,
        replace: '      const beats = Stream.empty',
      },
    ],
    tests,
  },
  {
    name: 'the heartbeat outlives the events it serves',
    edits: [
      {
        file,
        find: '.pipe(Stream.interruptWhen(Deferred.await(ended)))',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'no hub reaches the live streams',
    edits: [{ file, find: 'live: config.live,', replace: 'live: undefined,' }],
    tests,
  },
  {
    name: 'a stream failure is a data frame',
    edits: [{ file, find: 'event: error\\ndata:', replace: 'data:' }],
    tests,
  },
  {
    name: 'the stream answers as JSON',
    edits: [
      {
        file,
        find: "'content-type': 'text/event-stream'",
        replace: "'content-type': 'application/json'",
      },
    ],
    tests,
  },
  {
    name: 'a live payload no stream speaks is answered 200',
    edits: [
      {
        file,
        find: "{ error: 'The live payload is not a requirement' }, { status: 400 }",
        replace: "{ error: 'The live payload is not a requirement' }, { status: 200 }",
      },
    ],
    tests,
  },
]

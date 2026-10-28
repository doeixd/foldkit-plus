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
        find: 'revalidate.key === undefined || revalidate.key(opened) === revalidate.key(now)',
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
        find: 'if (isLiveOpen(body.value)) {',
        replace: 'if (false) {',
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
        find: "{ error: 'The live payload is not a requirement' },\n            { status: 400, headers },",
        replace:
          "{ error: 'The live payload is not a requirement' },\n            { status: 200, headers },",
      },
    ],
    tests,
  },
  {
    name: 'the layer closes when the answer is built, before the stream serves',
    edits: [
      {
        file,
        find: 'Exit.isSuccess(exit) && exit.value.live ? Effect.void : Scope.close(scope, exit)',
        replace: 'Scope.close(scope, exit)',
      },
    ],
    tests,
  },
  {
    name: 'a live stream never closes its layer',
    edits: [
      { file, find: 'Stream.ensuring(release)),', replace: 'Stream.ensuring(Effect.void)),' },
    ],
    tests,
  },
  {
    name: 'a defect mid-stream errors the body, unanswered',
    edits: [
      {
        file,
        find: ": Stream.fromEffect(\n                Effect.as(Diagnostics.report(serverDefect(cause)), errorFrame('Internal error')),\n              ),",
        replace: ': Stream.failCause(cause),',
      },
    ],
    tests,
  },
  {
    name: 'a defect mid-stream is not reported',
    edits: [
      {
        file,
        find: 'Effect.as(Diagnostics.report(serverDefect(cause)), ',
        replace: 'Effect.as(Effect.void, ',
      },
    ],
    tests,
  },
  {
    name: 'any interval is taken',
    edits: [
      {
        file,
        find: "throw new Error('serveFetch: revalidate.every must be longer than zero')",
        replace: '{}',
      },
    ],
    tests,
  },
]

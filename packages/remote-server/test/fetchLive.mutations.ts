/**
 * Live over fetch, each guard broken in turn: `pnpm mutate
 * packages/remote-server/test/fetchLive.mutations.ts` checks that a test fails
 * for every one.
 */
const tests = ['packages/remote-server/test/fetchLive.test.ts']
const file = '../src/fetch.ts'

export default [
  {
    name: 'a live open is answered as a request',
    edits: [
      {
        file,
        find: `    if (isLiveOpen(body)) {
      return liveResponse(handlers, body.payload, config.layer(env))
    }`,
        replace: '    void body',
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

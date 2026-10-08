/**
 * Live over fetch, each guard broken in turn: `pnpm mutate
 * packages/remote/test/sse.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/remote/test/sse.test.ts']
const file = '../src/sse.ts'

export default [
  {
    name: 'live opens as a read',
    edits: [
      {
        file,
        find: "body: JSON.stringify({ operation: 'live', payload }),",
        replace: "body: JSON.stringify({ operation: 'read', payload }),",
      },
    ],
    tests,
  },
  {
    name: 'an error frame is read as data',
    edits: [{ file, find: "if (frame.event === 'error') {", replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'data lines join without their newline',
    edits: [{ file, find: "frame.data.join('\\n')", replace: "frame.data.join('')" }],
    tests,
    survives:
      'every multi-data split of one JSON payload is whitespace-tolerant: where the newline join parses, the empty join parses to the same value (a newline inside a string or number token is invalid either way)',
  },
  {
    name: 'the request is never abortable',
    edits: [{ file, find: 'signal: controller.signal,', replace: '' }],
    tests,
  },
  {
    name: 'a non-200 never reports its answer',
    edits: [{ file, find: '? String(answered.error)', replace: "? 'HTTP x'" }],
    tests,
  },
]

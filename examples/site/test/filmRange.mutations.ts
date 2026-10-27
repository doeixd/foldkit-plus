/**
 * The film's byte ranges, each broken in turn: `pnpm mutate
 * examples/site/test/filmRange.mutations.ts`.
 */
const file = '../functions/film/[[path]].ts'
const tests = ['examples/site/test/filmRange.test.ts']

export default [
  {
    name: 'a range runs past the end of the file',
    edits: [{ file, find: 'Math.min(Number(to), size - 1)', replace: 'Number(to)' }],
    tests,
  },
  {
    name: 'a suffix longer than the file starts before it',
    edits: [{ file, find: 'Math.max(0, size - last)', replace: 'size - last' }],
    tests,
  },
  {
    name: 'a backwards range is answered',
    edits: [{ file, find: 'start >= size || start > end', replace: 'start >= size' }],
    tests,
  },
  {
    name: 'a range is answered whole',
    edits: [{ file, find: "if (range === 'whole')", replace: 'if (true)' }],
    tests,
  },
  {
    name: 'a slice drops its last byte',
    edits: [
      {
        file,
        find: 'body.slice(range.start, range.end + 1)',
        replace: 'body.slice(range.start, range.end)',
      },
    ],
    tests,
  },
  {
    name: 'the answer does not offer ranges',
    edits: [{ file, find: "headers.set('accept-ranges', 'bytes')", replace: '' }],
    tests,
  },
]

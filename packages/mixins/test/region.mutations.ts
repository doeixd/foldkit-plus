/**
 * Regions and the per-item memo's forgetting:
 * `pnpm mutate packages/mixins/test/region.mutations.ts`.
 */
const tests = ['packages/mixins/test/region.test.ts']

export default [
  {
    name: 'a region compares only the first path it reads',
    edits: [
      {
        file: '../src/slotView.ts',
        find: 'if (values.every((value, index) => Object.is(value, before.values[index])))',
        replace: 'if (Object.is(values[0], before.values[0]))',
      },
    ],
    tests,
  },
  {
    name: 'a region keeps its value whatever its paths hold',
    edits: [
      {
        file: '../src/slotView.ts',
        find: 'if (values.every((value, index) => Object.is(value, before.values[index])))',
        replace: 'if (true)',
      },
    ],
    tests,
  },
  {
    name: 'a region takes a read holding the same fields as a new value',
    edits: [
      {
        file: '../src/slotView.ts',
        find: 'return keepAlike(before.value, reads.read(root))',
        replace: 'return reads.read(root)',
      },
    ],
    tests,
  },
  {
    name: 'a region that reads no path is accepted',
    edits: [
      {
        file: '../src/slotView.ts',
        find: 'if (reads.dependencies.length === 0) {',
        replace: 'if (reads.dependencies.length < 0) {',
      },
    ],
    tests,
  },
  {
    name: 'the item memo never forgets',
    edits: [
      {
        file: '../src/slotView.ts',
        find: '  if (memo.drawn.has(key)) {',
        replace: '  if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'the item memo keeps only the pass that just ended',
    edits: [
      {
        file: '../src/slotView.ts',
        find: 'if (memo.drawn.has(known) || memo.before.has(known)) continue',
        replace: 'if (memo.drawn.has(known)) continue',
      },
    ],
    tests,
  },
  {
    name: 'a drawing with no frame keeps an empty memo',
    edits: [
      {
        file: '../src/slotView.ts',
        find: '        memo.lazies.delete(key)\n',
        replace: '',
      },
    ],
    tests,
    survives:
      'Only memory: a server drawing page after page with keyed items would keep an empty memo per key, which nothing a test can read shows.',
  },
]

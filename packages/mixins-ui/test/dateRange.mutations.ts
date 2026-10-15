/**
 * The date range, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/dateRange.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/dateRange.test.ts']

export default [
  {
    name: 'an earlier second day becomes the end',
    edits: [
      {
        file: '../src/dateRange.ts',
        find: 'start: Option.some(Dates.min(start, date)),\n        end: Option.some(Dates.max(start, date)),',
        replace: 'start: Option.some(start),\n        end: Option.some(date),',
      },
    ],
    tests,
  },
  {
    name: 'the days between the ends are not marked',
    edits: [
      {
        file: '../src/dateRange.ts',
        find: "...(within ? [h.DataAttribute('in-range', '')] : []),",
        replace: '',
      },
    ],
    tests,
  },
]

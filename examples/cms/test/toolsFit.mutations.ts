/**
 * How much of the formatting bar fits, broken in turn: `pnpm mutate examples/cms/test/toolsFit.mutations.ts`.
 */
const file = '../src/content/toolsFit.ts'
const tests = ['examples/cms/test/toolsFit.test.ts']

export default [
  {
    name: 'an overflowing bar does not move up',
    edits: [
      {
        file,
        find: 'const level = Math.min(fit.level + 1, HIGHEST_LEVEL)',
        replace: 'const level = fit.level',
      },
    ],
    tests,
  },
  {
    name: 'a bar that fits never goes back down',
    edits: [
      {
        file,
        find: '  return lower === -1 ? fit : { level: lower, needs: fit.needs }',
        replace: '  return fit',
      },
    ],
    tests,
  },
  {
    name: 'a lower level is taken without its recorded need fitting',
    edits: [
      {
        file,
        find: 'level < fit.level && need > 0 && need <= width',
        replace: 'level < fit.level && need > 0',
      },
    ],
    tests,
  },
  {
    name: 'what a level needed is not recorded',
    edits: [
      {
        file,
        find: '(level === fit.level ? scroll : need)',
        replace: '(level === fit.level ? 0 : need)',
      },
    ],
    tests,
  },
  {
    name: 'a bar not drawn is judged',
    edits: [{ file, find: '  if (width <= 0) return fit\n', replace: '' }],
    tests,
  },
]

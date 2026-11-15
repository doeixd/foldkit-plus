/**
 * The dead conditional rule guard, broken in turn: `pnpm mutate packages/mixins/test/deadRules.mutations.ts`
 * checks that a test fails for every one.
 */
const tests = ['packages/mixins/test/deadRules.test.ts']
const file = '../src/styleValue.ts'

export default [
  {
    name: 'nothing is checked',
    edits: [
      {
        file,
        find: '    if (rules.length + conditions.length > 0) checkDeadRules(Object.keys(style), rules, conditions)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a base rule counts as conditional',
    edits: [
      {
        file,
        find: "    if (!chosen && rule.at === undefined && rule.selector === '&') continue\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a pseudo-class rule is taken for a base rule',
    edits: [
      {
        file,
        find: "if (!chosen && rule.at === undefined && rule.selector === '&') continue",
        replace: 'if (!chosen && rule.at === undefined) continue',
      },
    ],
    tests,
  },
  {
    name: 'an at-rule is taken for a base rule',
    edits: [
      {
        file,
        find: "if (!chosen && rule.at === undefined && rule.selector === '&') continue",
        replace: "if (!chosen && rule.selector === '&') continue",
      },
    ],
    tests,
  },
  {
    name: 'a rule marked !important is refused',
    edits: [
      {
        file,
        find: 'IMPORTANT.test(value)\n        ? undefined',
        replace: 'false\n        ? undefined',
      },
    ],
    tests,
  },
  {
    name: 'a rule the view chooses is not read',
    edits: [
      {
        file,
        find: '    checkDeadRules(inlined, piece.rules ?? [], piece.conditions ?? [], true)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a longhand in a rule beside an inline shorthand passes',
    edits: [
      {
        file,
        find: '(shorthands.includes(inline) && isLonghandOf(inline, property)) ||',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a shorthand in a rule beside an inline longhand passes',
    edits: [
      {
        file,
        find: '(shorthands.includes(property) && isLonghandOf(property, inline)),',
        replace: 'false,',
      },
    ],
    tests,
  },
  {
    name: 'an exact match is not caught',
    edits: [{ file, find: 'inline === property ||', replace: '' }],
    tests,
  },
  {
    name: 'the checks run in a production build too',
    edits: [{ file, find: 'import.meta.env?.DEV === true', replace: 'true' }],
    tests: ['packages/mixins/test/deadRulesProduction.test.ts'],
  },
]

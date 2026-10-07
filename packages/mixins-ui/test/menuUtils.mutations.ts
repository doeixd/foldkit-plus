/**
 * The vendored menu utils, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/menuUtils.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/menuUtils.test.ts']

export default [
  {
    name: 'non-adjacent same-key items still group together',
    edits: [
      {
        file: '../src/menuUtils.ts',
        find: 'const [matching, rest] = Array.span(nonEmpty, tagged => tagged.key === key)',
        replace: 'const [matching, rest] = Array.span(nonEmpty, _tagged => true)',
      },
    ],
    tests,
  },
  {
    name: 'printable means longer than one character',
    edits: [
      {
        file: '../src/menuUtils.ts',
        find: 'export const isPrintableKey = (key: string): boolean => key.length === 1',
        replace: 'export const isPrintableKey = (key: string): boolean => key.length !== 1',
      },
    ],
    tests,
  },
  {
    name: 'indices never wrap',
    edits: [
      {
        file: '../src/menuUtils.ts',
        find: 'export const wrapIndex = (index: number, length: number): number =>\n  ((index % length) + length) % length',
        replace: 'export const wrapIndex = (index: number, length: number): number =>\n  index',
      },
    ],
    tests,
  },
  {
    name: 'a fresh search refines from the active item',
    edits: [
      {
        file: '../src/menuUtils.ts',
        find: '  const offset = isRefinement ? 0 : 1',
        replace: '  const offset = isRefinement ? 1 : 0',
      },
    ],
    tests,
  },
  {
    name: 'typeahead matches are case-sensitive',
    edits: [
      {
        file: '../src/menuUtils.ts',
        find: '  const lowerQuery = String.toLowerCase(query)',
        replace: '  const lowerQuery = query',
      },
    ],
    tests,
  },
  {
    name: 'disabled items match typeahead',
    edits: [
      {
        file: '../src/menuUtils.ts',
        find: '  const isEnabledMatch = (index: number): boolean =>\n    !isDisabled(index) &&',
        replace: '  const isEnabledMatch = (index: number): boolean =>\n    !isDisabled(index) ||',
      },
    ],
    tests,
  },
  {
    name: 'Home goes to the end',
    edits: [
      {
        file: '../src/menuUtils.ts',
        find: "      Match.whenOr('Home', 'PageUp', () => find(0, 1)),",
        replace: "      Match.whenOr('Home', 'PageUp', () => find(itemCount - 1, -1)),",
      },
    ],
    tests,
  },
  {
    name: 'whenOption keeps nothing',
    edits: [
      {
        file: '../src/menuUtils.ts',
        find: '  Option.liftPredicate(value, () => condition),',
        replace: '  Option.liftPredicate(value, () => !condition),',
      },
    ],
    tests,
  },
]

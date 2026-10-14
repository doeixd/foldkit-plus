/**
 * Search and Replace, each broken in turn: `pnpm mutate packages/richtext/test/replace.mutations.ts`
 * checks that a test fails for every one.
 */
const search = '../src/search.ts'
const command = '../src/command.ts'
const tests = ['packages/richtext/test/replace.test.ts', 'packages/richtext/test/search.test.ts']

export default [
  {
    name: 'case always counts',
    edits: [
      { file: search, find: '  if (caseSensitive) return text\n', replace: '  return text\n' },
    ],
    tests,
  },
  {
    name: 'case never counts',
    edits: [
      {
        file: search,
        find: '  const caseSensitive = options.caseSensitive === true',
        replace: '  const caseSensitive = false',
      },
    ],
    tests,
  },
  {
    name: 'the current match is not marked',
    edits: [
      {
        file: search,
        find: 'kind: index === options.current ? SEARCH_CURRENT_DECORATION : SEARCH_DECORATION,',
        replace: 'kind: SEARCH_DECORATION,',
      },
    ],
    tests,
  },
  {
    name: 'an index replaces every match',
    edits: [
      {
        file: command,
        find: 'const chosen = command.at === undefined ? matches : matches.slice(command.at, command.at + 1)',
        replace: 'const chosen = matches',
      },
    ],
    tests,
  },
  {
    name: 'matches are replaced first to last',
    edits: [
      {
        file: command,
        find: '  for (const match of [...matches].reverse()) {',
        replace: '  for (const match of matches) {',
      },
    ],
    tests,
  },
]
